// Walkies link previews — currently a no-op, on purpose.
//
// Measured 2026-11-02 against the real links in this trip:
//
//   TikTok oEmbed still answers 200, but the payload no longer carries
//   thumbnail_url. Keys returned: version, type, width, height, html,
//   provider_url, provider_name, embed_product_id, embed_type.
//
//   maps.app.goo.gl short links answer 200 with a 39 KB JavaScript
//   interstitial. No redirect to follow, no coordinates in the HTML, no
//   og:image, and rel=canonical points back at the short link itself.
//
// So neither source gives a picture away for free any more. A real photo
// needs the Google Places API, keyed by the idea's title and stop rather
// than by the link, and that needs a server-side API key of its own.
// Until then people upload their own photo and otherwise get the drawing.
//
// This stub stays so the client has something safe to call. It fetches
// nothing, so it cannot be used to make requests on our behalf.

Deno.serve(() =>
  new Response(JSON.stringify({ thumbnail: '', reason: 'no free source' }), {
    headers: { 'content-type': 'application/json' }
  })
);
