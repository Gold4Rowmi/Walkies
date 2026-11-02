// Walkies: find a picture of a place by its name, from Wikipedia.
//
// Why not the obvious sources (all measured 2026-11-02):
//   TikTok oEmbed answers 200 but no longer returns thumbnail_url.
//   maps.app.goo.gl serves a JS interstitial: no redirect, no coordinates,
//     no og:image, rel=canonical points back at itself.
//   Google Places would work, but its terms let you cache lat/lng for 30
//     days and Place IDs only, not photos. Serving photos live instead
//     bills every thumbnail view against a 1,000/month free cap, which a
//     family browsing would pass. So it is not free in any honest sense.
//
// Wikipedia is free, needs no key, has no quota worth worrying about, and
// its images are openly licensed, so the URL can be stored. Credit is shown
// in the app next to the photo.
//
// Wikipedia is confidently wrong when it misses, so a hit is only used when
// its title shares a DISTINCTIVE word with the idea's title. Three rules,
// each put there by a real wrong answer:
//   accents are stripped, so "Senso-ji" matches the article "Sensō-ji";
//   matching is on whole words, because a prefix rule let "Mt Fuji" match
//     the town of Fujikawaguchiko;
//   generic travel words cannot carry a match, because "Ha Long Bay cruise"
//     matched "Disney Cruise Line" on the word cruise.
// A near miss costs nothing: the idea keeps its drawing until someone
// uploads a photo of their own.

const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } });
const UA = 'Walkies/1.0 (family trip planner; +https://github.com/Gold4Rowmi/walkies)';

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
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sensō-ji -> senso-ji
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

function relevant(title: string, stop: string, hit: string): boolean {
  const skip = new Set(words(stop));
  const want = words(title).filter(w => w.length >= 4 && !skip.has(w) && !GENERIC.has(w));
  if (!want.length) return false;
  const got = new Set(words(hit));
  return want.some(w => got.has(w));
}

Deno.serve(async (req) => {
  let title = '', stop = '', kind = 'idea';
  try {
    const b = await req.json();
    title = b?.title ?? ''; stop = b?.stop ?? ''; kind = b?.kind ?? 'idea';
  } catch { /* no body */ }

  // Flights and transfers have no place to photograph.
  if (!title || kind === 'travel') return json({ thumbnail: '', credit: '', page: '' });

  const api = 'https://en.wikipedia.org/w/api.php?action=query&format=json'
    + '&prop=pageimages|info&inprop=url&piprop=thumbnail&pithumbsize=600'
    + '&generator=search&gsrlimit=5&gsrsearch='
    + encodeURIComponent(title + ' ' + stop);

  try {
    const res = await fetch(api, { headers: { 'user-agent': UA } });
    if (!res.ok) return json({ thumbnail: '', credit: '', page: '' });
    const data = await res.json();
    const pages = (Object.values(data?.query?.pages ?? {}) as Record<string, unknown>[])
      .sort((a, b) => (a.index as number) - (b.index as number));

    for (const p of pages) {
      const hitTitle = String(p.title ?? '');
      const thumb = (p.thumbnail as { source?: string } | undefined)?.source;
      if (!thumb) continue;
      if (!relevant(title, stop, hitTitle)) continue;
      return json({ thumbnail: thumb, credit: hitTitle + ' · Wikipedia', page: String(p.fullurl ?? '') });
    }
    return json({ thumbnail: '', credit: '', page: '' });
  } catch (e) {
    return json({ thumbnail: '', credit: '', page: '', error: String(e) });
  }
});
