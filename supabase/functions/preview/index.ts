// Walkies lookups, both free and keyless, both from Wikipedia.
//
//   { title, stop, kind }  -> a picture of the place
//   { geocode: "Hoi An" }  -> { lat, lng } for its map pin
//   { suggest, stop, lat, lng } -> place names for the title box
//
// Why not the obvious sources (all measured 2026-11-02):
//   TikTok oEmbed answers 200 but no longer returns thumbnail_url.
//   maps.app.goo.gl serves a JS interstitial: no redirect, no coordinates,
//     no og:image, rel=canonical points back at itself.
//   Google Places would work, but its terms let you cache lat/lng for 30
//     days and Place IDs only, not photos. Serving photos live instead
//     bills every thumbnail view against a 1,000/month free cap, which a
//     family browsing would pass. So it is not free in any honest sense.
//   OpenStreetMap's Nominatim answered nothing from this host, which is
//     their right: their policy discourages bulk use from datacenters.
//
// Wikipedia needs no key, has no quota worth worrying about, licenses its
// images for reuse, and carries coordinates for most places, so it answers
// both questions from one source that is known to work from here.
//
// Wikipedia is confidently wrong when it misses, so both answers are
// guarded, and every rule below came from a real wrong answer:
//   photos: accents stripped, so "Senso-ji" matches the article "Sensō-ji";
//   photos: whole words only, after a prefix rule let "Mt Fuji" match the
//     town of Fujikawaguchiko;
//   photos: generic travel words cannot carry a match, after "Ha Long Bay
//     cruise" matched "Disney Cruise Line";
//   photos: a title whose every word is in the article's name always
//     matches, after "Ha long bay" threw away "Hạ Long Bay" for having
//     nothing distinctive left once the stop's words were removed;
//   photos: the title is searched alone first, after "Universal studios
//     japan" filed under Kyoto (it is in Osaka) buried the real article
//     under a band and Studio Ghibli;
//   places: the article must contain the place's own first word, after
//     "Hoi An Vietnam" returned the country and "Ha Long Vietnam" returned
//     Hanoi, either of which would have put the pin hundreds of km out.
// A near miss costs nothing: the idea keeps its drawing, the stop its pin.
//
// colimit must cover every page the search returns, not one: it caps
// coordinates across the whole result, so colimit=1 left every article
// after the first without them.

// The app calls this from the browser, on another origin, so every answer
// needs CORS headers or the browser hides it and the app sees a failure.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...CORS, 'content-type': 'application/json' } });
const UA = 'Walkies/1.0 (family trip planner; +https://github.com/Gold4Rowmi/walkies)';
const WIKI = 'https://en.wikipedia.org/w/api.php';

// Words too common to prove a match on their own.
const GENERIC = new Set([
  'walk', 'walks', 'tour', 'tours', 'cruise', 'ride', 'rides', 'trip', 'visit', 'hike', 'hiking',
  'lunch', 'dinner', 'breakfast', 'brunch', 'food', 'meal', 'snack', 'stall', 'cafe', 'coffee',
  'market', 'shop', 'shopping', 'store', 'beach', 'park', 'bridge', 'station', 'hire', 'rental',
  'boat', 'ferry', 'train', 'bus', 'taxi', 'flight', 'transfer', 'view', 'views', 'viewpoint',
  'temple', 'shrine', 'museum', 'gallery', 'garden', 'gardens', 'castle', 'tower', 'palace',
  'street', 'river', 'lake', 'bay', 'island', 'mountain', 'hill', 'valley', 'falls', 'cave',
  'morning', 'afternoon', 'evening', 'night', 'early', 'late', 'dawn', 'dusk', 'sunrise', 'sunset',
  'best', 'good', 'great', 'nice', 'cheap', 'free', 'local', 'famous', 'quiet', 'busy',
  'old', 'new', 'town', 'city', 'centre', 'center', 'area', 'place', 'spot', 'day', 'days',
  'with', 'from', 'near', 'this', 'that', 'there', 'here', 'some', 'more', 'most', 'very',
  'again', 'around', 'into', 'onto', 'over', 'under', 'after', 'before', 'about', 'then'
]);

const words = (s: string) =>
  (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // sensō-ji -> senso-ji, Hội -> Hoi
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

// Same word, or one is a prefix of the other and long enough to mean something.
// Lets "Kawaguchiko" match "Lake Kawaguchi", keeps "Ha" away from "Hanoi".
function akin(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

// Every word of the idea's title is in the article's name.
function exact(title: string, hit: string): boolean {
  const want = words(title).filter(w => w.length >= 2);
  if (!want.length) return false;
  const got = new Set(words(hit));
  return want.every(w => got.has(w));
}

function relevant(title: string, stop: string, hit: string): boolean {
  const skip = new Set(words(stop));
  const want = words(title).filter(w => w.length >= 4 && !skip.has(w) && !GENERIC.has(w));
  if (!want.length) return false;
  const got = new Set(words(hit));
  return want.some(w => got.has(w));
}

async function ask(params: string) {
  const res = await fetch(WIKI + '?action=query&format=json&' + params, { headers: { 'user-agent': UA } });
  if (!res.ok) return [];
  const data = await res.json();
  const pages = Object.values(data?.query?.pages ?? {}) as Record<string, unknown>[];
  return pages.sort((a, b) => (a.index as number) - (b.index as number));
}

async function findPhoto(title: string, stop: string) {
  for (const q of [title, title + ' ' + stop]) {
    const pages = await ask('prop=pageimages|info&inprop=url&piprop=thumbnail&pithumbsize=600'
      + '&generator=search&gsrlimit=5&gsrsearch=' + encodeURIComponent(q));
    for (const p of pages) {
      const hitTitle = String(p.title ?? '');
      const thumb = (p.thumbnail as { source?: string } | undefined)?.source;
      if (!thumb) continue;
      if (!exact(title, hitTitle) && !relevant(title, stop, hitTitle)) continue;
      return { thumbnail: thumb, credit: hitTitle + ' · Wikipedia', page: String(p.fullurl ?? '') };
    }
  }
  return { thumbnail: '', credit: '', page: '' };
}

async function geocode(place: string) {
  const asked = words(place);
  if (!asked.length) return { lat: null, lng: null, matched: '' };
  const first = asked[0];
  const pages = await ask('prop=coordinates&colimit=max'
    + '&generator=search&gsrlimit=8&gsrsearch=' + encodeURIComponent(place));
  for (const p of pages) {
    const c = (p.coordinates as { lat?: number; lon?: number }[] | undefined)?.[0];
    if (!c || typeof c.lat !== 'number' || typeof c.lon !== 'number') continue;
    // The article has to be about the place asked for, not the country it is in.
    if (!words(String(p.title ?? '')).some(w => akin(w, first))) continue;
    return { lat: c.lat, lng: c.lon, matched: String(p.title ?? '') };
  }
  return { lat: null, lng: null, matched: '' };
}

// Places whose names start with what is being typed, near the stop, for
// the title box. nearcoord keeps "fus" by Kyoto on Fushimi Inari, not a town
// in Aichi. Every typed word must start a word of the name, so it behaves
// like autocomplete, and wards, towns and stations are dropped because
// nobody plans a day at one.
const ADMIN = /^(ward|commune|town|village|designated city|provincial city|city|urban district|rural district|district of|railway station|metro station|train station)\b/i;
async function suggest(typed: string, stop: string, lat: unknown, lng: unknown) {
  const term = typed.replace(/[*"~:]/g, ' ').trim();
  const asked = words(term);
  if (term.length < 3 || !asked.length) return { places: [] };
  const near = typeof lat === 'number' && typeof lng === 'number'
    ? ` nearcoord:150km,${lat.toFixed(4)},${lng.toFixed(4)}` : (stop ? ' ' + stop : '');
  const pages = await ask('prop=description&generator=search&gsrnamespace=0&gsrlimit=12&gsrsearch='
    + encodeURIComponent(term + '*' + near));
  const places: { title: string; note: string }[] = [];
  for (const p of pages) {
    const title = String(p.title ?? ''), note = String(p.description ?? '');
    // Lists, "may refer to" pages and history (battles, events by year) are not places.
    if (/^(list of|battle of)/i.test(title) || /disambiguation/i.test(title)) continue;
    if (/disambiguation|same term|^\d{3,4}\b/i.test(note) || ADMIN.test(note)) continue;
    const have = words(title);
    if (!asked.every(a => have.some(h => h.startsWith(a)))) continue;
    places.push({ title, note });
    if (places.length >= 6) break;
  }
  return { places };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) ?? {}; } catch { /* no body */ }
  try {
    if (body.geocode) return json(await geocode(String(body.geocode)));
    if (body.suggest) return json(await suggest(String(body.suggest), String(body.stop ?? ''), body.lat, body.lng));
    const title = String(body.title ?? ''), stop = String(body.stop ?? ''), kind = String(body.kind ?? 'idea');
    // Flights and transfers have no place to photograph.
    if (!title || kind === 'travel') return json({ thumbnail: '', credit: '', page: '' });
    return json(await findPhoto(title, stop));
  } catch (e) {
    return json({ thumbnail: '', credit: '', page: '', lat: null, lng: null, error: String(e) });
  }
});
