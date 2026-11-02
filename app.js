(function () {
  'use strict';

  var CFG = window.WALKIES_CONFIG || {};
  var app = document.getElementById('app');
  var JOIN_KEY = 'walkies_join';

  // ---------- Trip shape ----------
  // The trip's own dates and stops live on the trip row, set by the owner in
  // the app. A trip that has never been set up falls back to this.
  var DEFAULT_PLAN = {
    start: CFG.TRIP_START || '2027-04-12',
    stops: [
      { name: 'Tokyo',       days: 4, zone: 'Asia/Tokyo',       lat: 35.6762, lng: 139.6503 },
      { name: 'Kyoto',       days: 3, zone: 'Asia/Tokyo',       lat: 35.0116, lng: 135.7681 },
      { name: 'Kawaguchiko', days: 2, zone: 'Asia/Tokyo',       lat: 35.5104, lng: 138.7689 },
      { name: 'Hoi An',      days: 5, zone: 'Asia/Ho_Chi_Minh', lat: 15.8801, lng: 108.3380 },
      { name: 'Ha Long',     days: 4, zone: 'Asia/Ho_Chi_Minh', lat: 20.9101, lng: 107.1839 }
    ]
  };
  var PLACES = window.WALKIES_PLACES || {};
  var CITIES = (window.WALKIES_CITIES || []).map(function (c) {
    return { name: c[0], country: c[1], zone: c[2], lat: c[3], lng: c[4] };
  });
  function fold(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  // Safari on iPhone shows a <datalist> inconsistently, so this draws its own:
  // up to six matches under the box, names that start with what you typed first.
  function suggestionsFor(kind, typed) {
    var q = fold(typed);
    if (!q) return [];
    var pool, stop = '';
    if (kind === 'city') {
      pool = CITIES.map(function (c) { return { value: c.name, note: c.country }; });
    } else {
      // The stop picked in the form, so Kyoto suggests Kyoto. The built-in
      // list first, then the trip's own nearby ideas.
      var sel = document.getElementById('fStop');
      stop = sel ? sel.value : '';
      pool = (PLACES[stop] || []).map(function (t) { return { value: t, note: stop }; })
        .concat(S.data.nearby.filter(function (n) { return n.stop === stop; })
          .map(function (n) { return { value: n.title, note: n.stop }; }));
    }
    var hits = pool.filter(function (o) { return fold(o.value).indexOf(q) >= 0 || fold(o.note).indexOf(q) >= 0; });
    hits.sort(function (a, b) {
      var as = fold(a.value).indexOf(q) === 0 ? 0 : 1, bs = fold(b.value).indexOf(q) === 0 ? 0 : 1;
      return as - bs || a.value.localeCompare(b.value);
    });
    // Then whatever Wikipedia knows near the stop, once it has answered.
    var live = kind === 'place' && liveCache[stop + '|' + q];
    if (live) {
      var seen = hits.map(function (o) { return fold(o.value); });
      live.forEach(function (o) { if (seen.indexOf(fold(o.value)) < 0) { hits.push(o); seen.push(fold(o.value)); } });
    }
    if (hits.length === 1 && fold(hits[0].value) === q) return [];   // already exactly that
    return hits.slice(0, 6);
  }

  // ---------- Live place search near the stop ----------
  // Asked once the typing pauses, remembered per stop and text, so going back
  // over the same letters costs nothing. A failure just means no extra rows.
  var liveCache = {}, liveTimer = null;
  function askLive(input) {
    clearTimeout(liveTimer);
    var sel = document.getElementById('fStop');
    var stop = sel ? sel.value : '', q = fold(input.value);
    if (q.length < 3 || liveCache[stop + '|' + q]) return;
    liveTimer = setTimeout(async function () {
      var at = stopByName(stop);
      if (at.lat == null) at = cityByName(stop) || {};
      try {
        var r = await sb.functions.invoke('preview', { body: { suggest: input.value, stop: stop, lat: at.lat, lng: at.lng } });
        if (r.error || !r.data || !r.data.places) return;
        liveCache[stop + '|' + q] = r.data.places.map(function (p) { return { value: p.title, note: p.note || stop }; });
        if (document.activeElement === input && fold(input.value) === q) showSuggestions(input);
      } catch (e) { /* no extra rows */ }
    }, 350);
  }
  function showSuggestions(input) {
    var box = input.closest('.lbl, .row').nextElementSibling;
    if (!box || !box.classList.contains('suggest')) return;
    box.innerHTML = suggestionsFor(input.dataset.suggest, input.value).map(function (o) {
      return '<button type="button" class="sug" role="option" data-act="sug-pick" data-v="' + esc(o.value) + '">'
        + '<span>' + esc(o.value) + '</span><span class="meta">' + esc(o.note) + '</span></button>';
    }).join('');
  }
  function cityByName(n) {
    n = String(n || '').trim().toLowerCase();
    for (var i = 0; i < CITIES.length; i++) if (CITIES[i].name.toLowerCase() === n) return CITIES[i];
    return null;
  }
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Day numbers run straight through the stops in order, so the first and last
  // day of each stop fall out of how many days it has.
  function plan() {
    var t = S.data && S.data.trip;
    var raw = (t && t.stops && t.stops.length) ? t.stops : DEFAULT_PLAN.stops;
    var out = [], day = 1;
    raw.forEach(function (st) {
      var n = Math.max(1, Number(st.days) || 1);
      out.push({ name: st.name, days: n, from: day, to: day + n - 1,
                 zone: st.zone || 'UTC', lat: st.lat, lng: st.lng });
      day += n;
    });
    return { start: (t && t.start_date) || DEFAULT_PLAN.start, stops: out, ndays: day - 1 };
  }
  function stopNames() { return plan().stops.map(function (s) { return s.name; }); }
  function stopFor(n) {
    var st = plan().stops;
    for (var i = 0; i < st.length; i++) if (n >= st[i].from && n <= st[i].to) return st[i].name;
    return st.length ? st[0].name : '';
  }
  // An idea keeps the stop name it was filed under. If that stop is renamed or
  // removed the idea still shows, just without a time zone.
  function stopByName(name) {
    var st = plan().stops;
    for (var i = 0; i < st.length; i++) if (st[i].name === name) return st[i];
    return { name: name, days: 0, from: 0, to: 0, zone: '' };
  }
  // CLDR has no abbreviation for most Asian zones, so this reads "GMT+9".
  function tzLabel(zone) {
    if (!zone) return '';
    try {
      var part = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'short' })
        .formatToParts(new Date()).filter(function (x) { return x.type === 'timeZoneName'; })[0];
      return part ? part.value : '';
    } catch (e) { return ''; }
  }
  function dayDate(n) {
    var d = new Date(plan().start + 'T00:00:00');
    d.setDate(d.getDate() + n - 1);
    return d;
  }
  function dayLabel(n) {
    var d = dayDate(n);
    return 'Day ' + n + ' · ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  // Where we are in the trip, by the clock at the first stop.
  function todayDay() {
    var p = plan();
    if (!p.stops.length) return 0;
    try {
      var here = new Intl.DateTimeFormat('en-CA', { timeZone: p.stops[0].zone || 'UTC',
        year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      var diff = Math.round((new Date(here + 'T00:00:00') - new Date(p.start + 'T00:00:00')) / 86400000) + 1;
      return diff >= 1 && diff <= p.ndays ? diff : 0;
    } catch (e) { return 0; }
  }
  function nowMinutes(zone) {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone || 'UTC',
        hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
      var h = 0, m = 0;
      parts.forEach(function (x) { if (x.type === 'hour') h = +x.value; if (x.type === 'minute') m = +x.value; });
      return h * 60 + m;
    } catch (e) { return 0; }
  }

  // Share links come from all sorts of subdomains: vt.tiktok.com, vm.tiktok.com,
  // google.com.au/maps. Allow any subdomain on the hosts we know.
  var SOCIAL_RE = /^https?:\/\/([a-z0-9-]+\.)*(tiktok\.com|instagram\.com|instagr\.am|jal\.co\.jp|ana\.co\.jp|vietjetair\.com|vietnamairlines\.com)(\/|$)/i;
  var MAPS_RE = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|([a-z0-9-]+\.)*google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6})/i;
  function validLink(u) { return SOCIAL_RE.test(u || '') || MAPS_RE.test(u || ''); }

  // The iPhone share sheet hands over "Look at this https://vt.tiktok.com/x",
  // and people type hosts with no scheme. Take the link out of whatever arrives.
  var BARE_HOST = /^((?:[a-z0-9-]+\.)*(?:tiktok\.com|instagram\.com|instagr\.am|goo\.gl|google\.[a-z.]{2,6}|jal\.co\.jp|ana\.co\.jp|vietjetair\.com|vietnamairlines\.com)\b\S*)$/i;
  function cleanLink(raw) {
    var t = String(raw == null ? '' : raw).trim();
    var m = t.match(/https?:\/\/\S+/i);
    if (m) return m[0].replace(/[.,;:)\]]+$/, '');
    var bare = t.match(BARE_HOST);
    return bare ? 'https://' + bare[1] : t;
  }
  function srcName(u) {
    return /instagram/i.test(u) ? 'Instagram' : /tiktok/i.test(u) ? 'TikTok' : /maps|goo\.gl/i.test(u) ? 'Google Maps' : 'Booking page';
  }

  // ---------- Rommel, from the brand grids ----------
  var R = ['..##..##..','##########','###t##t###','##########','#.#e##e#.#','..t####t..','..#tttt#..','...t##t...','....##....','..........'];
  function edit(rows) { var p = R.slice(); Object.keys(rows).forEach(function (k) { p[k] = rows[k]; }); return p; }
  var POSES = {
    idle: R,
    alert:  edit({ 0: '#.##..##.#', 4: '..#e##e#..' }),
    happy:  edit({ 0: '#.##..##.#', 4: '..######..', 9: '....pp....' }),
    grin:   edit({ 0: '#.##..##.#', 4: '..#e##e#..', 9: '....pp....' }),
    sad:    edit({ 5: '#.t####t.#' }),
    sleepy: edit({ 4: '#.######.#', 5: '#.t####t.#' }),
    wink:   edit({ 4: '#.#e####.#', 9: '....pp....' })
  };
  var DOG_C = { '#': '#16181D', t: '#D9893B', e: '#F4F5F7', p: '#E07A6B' };
  function dog(pose, ox, oy, outline) {
    ox = ox || 0; oy = oy || 0;
    var rows = POSES[pose] || POSES.idle, s = '';
    function on(x, y) { return y >= 0 && y < 10 && x >= 0 && x < 10 && rows[y][x] !== '.'; }
    if (outline) {
      for (var y0 = -1; y0 <= 10; y0++) for (var x0 = -1; x0 <= 10; x0++) {
        if (!on(x0, y0) && (on(x0 - 1, y0) || on(x0 + 1, y0) || on(x0, y0 - 1) || on(x0, y0 + 1)))
          s += '<rect x="' + (x0 + ox) + '" y="' + (y0 + oy) + '" width="1" height="1" fill="#ECEEF1"/>';
      }
    }
    rows.forEach(function (r, y) {
      for (var x = 0; x < 10; x++) { var c = r[x]; if (c !== '.') s += '<rect x="' + (x + ox) + '" y="' + (y + oy) + '" width="1" height="1" fill="' + DOG_C[c] + '"/>'; }
    });
    return s;
  }
  var WORD = ['####...###..#...#.#...#.###','#...#.#...#.#...#.##.##..#.','#...#.#...#.#.#.#.#.#.#..#.','####..#...#.#.#.#.#...#..#.','#...#..###...#.#..#...#.###'];
  function word(fill, ox, oy) {
    var s = '';
    WORD.forEach(function (r, y) {
      for (var x = 0; x < r.length; x++) if (r[x] === '#') s += '<rect x="' + (x + ox) + '" y="' + (y + oy) + '" width="1" height="1" fill="' + fill + '"/>';
    });
    return s;
  }
  function isDark() {
    var t = document.documentElement.dataset.theme;
    return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  // A full <svg> for any pose. On dark grounds he gets the 1 px Paper ring.
  function dogSVG(pose, size, onShell) {
    var ring = isDark() && !onShell;
    return '<svg class="px" width="' + size + '" height="' + size + '" viewBox="' + (ring ? '-1 -1 12 12' : '0 0 10 10') +
      '" aria-hidden="true">' + dog(pose, 0, 0, ring) + '</svg>';
  }
  function paintLock() {
    var el = document.getElementById('aboutLock');
    if (!el) return;
    var dk = isDark();
    el.setAttribute('viewBox', dk ? '-1 -1 41 12' : '0 0 39 10');
    el.innerHTML = dog('idle', 0, 0, dk) + word(dk ? '#F4F5F7' : '#16181D', 12, 4);
  }
  // The header pose between reactions: Idle, or Sleepy while the main view is empty
  var base = 'idle', reactT;
  function headDog(pose) { var el = document.getElementById('headDog'); if (el) el.innerHTML = dogSVG(pose, 40, true); }
  function react(pose, ms) {
    headDog(pose);
    clearTimeout(reactT);
    reactT = setTimeout(function () { headDog(base); }, ms || 700);
  }
  function setBase(pose) { if (base === pose) return; base = pose; headDog(pose); }
  function hop() {
    var b = document.getElementById('headDog'); if (!b) return;
    b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop');
  }

  // ---------- Prefs (per viewer): sound on at 60 %, dog sounds on, Light unless picked ----------
  var prefs = { sound: true, vol: 6, dog: true };
  try { var sp = JSON.parse(localStorage.getItem('rowmi-prefs') || 'null'); if (sp) for (var pk in sp) prefs[pk] = sp[pk]; } catch (e) {}
  function savePrefs() { try { localStorage.setItem('rowmi-prefs', JSON.stringify(prefs)); } catch (e) {} }
  function themePref() { try { return localStorage.getItem('walkies_theme') || 'light'; } catch (e) { return 'light'; } }

  // ---------- Sound: the UI guidelines' engine. Pitch up means forward and yes, down means back and no. ----------
  var ctx = null, master = null;
  function ac() {
    if (!prefs.sound) return null;
    if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ctx = new C(); } catch (e) { return null; } master = ctx.createGain(); master.connect(ctx.destination); }
    master.gain.value = prefs.vol / 10 * 0.5; if (ctx.state === 'suspended') ctx.resume(); return ctx;
  }
  function tone(f, d, o) {
    o = o || {}; var c = ac(); if (!c || !prefs.vol) return;
    var t = c.currentTime + (o.at || 0), osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'square'; osc.frequency.setValueAtTime(f, t); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.v || 0.1, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + d + 0.03);
  }
  function noise(dur, f1, f2, v, at, q) {
    var c = ac(); if (!c || !prefs.vol) return;
    var len = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf; var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q || 1.2;
    var t = c.currentTime + (at || 0); bp.frequency.setValueAtTime(f1, t); bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02);
  }
  function voice(o) {
    var c = ac(); if (!c || !prefs.vol) return;
    var t = c.currentTime + (o.at || 0), osc = c.createOscillator(); osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || o.dur)); if (o.then) osc.frequency.exponentialRampToValueAtTime(o.then, t + o.dur);
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.v, t + (o.attack || 0.006)); g.gain.setValueAtTime(o.v, t + o.dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    var out = g; if (o.lp) { var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.lp; g.connect(lp); out = lp; }
    if (o.vib) { var l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vibRate || 8; lg.gain.value = o.vib; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + o.dur + 0.03); }
    if (o.am) { var a = c.createOscillator(), agn = c.createGain(); a.frequency.value = o.amRate || 30; agn.gain.value = o.am; a.connect(agn); agn.connect(g.gain); a.start(t); a.stop(t + o.dur + 0.03); }
    osc.connect(g); out.connect(master); osc.start(t); osc.stop(t + o.dur + 0.03);
  }
  var SFX = {
    tick:    function () { tone(1320, 0.03, { v: 0.07 }); },
    click:   function () { tone(240, 0.04, { type: 'triangle', v: 0.22 }); },
    confirm: function () { tone(660, 0.06, { v: 0.09 }); tone(990, 0.09, { v: 0.09, at: 0.06 }); },
    back:    function () { tone(660, 0.06, { v: 0.09 }); tone(440, 0.09, { v: 0.09, at: 0.06 }); },
    on:      function () { tone(700, 0.05, { v: 0.09, to: 1400 }); },
    off:     function () { tone(1000, 0.05, { v: 0.09, to: 480 }); },
    error:   function () { tone(150, 0.09, { v: 0.13 }); tone(110, 0.13, { v: 0.13, at: 0.1 }); },
    success: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.1, { type: 'triangle', v: 0.2, at: i * 0.06 }); }); },
    sting:   function () { tone(1568, 0.05, { v: 0.09 }); tone(2093, 0.13, { v: 0.09, at: 0.06 }); },
    detent:  function (n) { tone(1500 + n * 90, 0.016, { v: 0.06 }); },
    swish:   function () { noise(0.14, 500, 3200, 0.25, 0, 1.4); },
    // Startup: "Trot & ping", four claw taps then G5 and C6, as on the boot screen
    startup: function () {
      [0, .11, .22, .33].forEach(function (at, i) { noise(0.012, 3000, 2000, 0.05 + i * 0.015, at, 0.8); tone(1796, 0.006, { type: 'square', v: 0.03, at: at }); });
      tone(785, 0.09, { v: 0.11, at: .42 }); tone(1049, 0.55, { v: 0.12, at: .51 });
    }
  };
  // Dog sounds are seasoning: one per action, never the same one twice within 2 seconds
  var DOG = {
    woof:  function () { voice({ f: 560, to: 240, dur: 0.1, v: 0.16, lp: 2400 }); noise(0.07, 1400, 700, 0.12, 0, 1.4); voice({ f: 330, to: 170, dur: 0.11, v: 0.1, at: 0.07, lp: 1800 }); },
    yip:   function () { voice({ f: 900, to: 1400, dur: 0.06, v: 0.11, lp: 3600 }); voice({ f: 1000, to: 1550, dur: 0.07, v: 0.11, at: 0.11, lp: 3600 }); },
    sniff: function () { [0, 0.1, 0.2].forEach(function (at, i) { noise(0.05, 2600 + i * 400, 4200 + i * 300, 0.16, at, 2.5); }); },
    tag:   function () { [[2637, 0], [3520, 0.07], [2960, 0.15]].forEach(function (p) { voice({ f: p[0], dur: 0.13, v: 0.05, at: p[1], attack: 0.002 }); voice({ f: p[0] * 1.007, dur: 0.12, v: 0.03, at: p[1], attack: 0.002, type: 'triangle' }); }); },
    whine: function () { voice({ type: 'triangle', f: 980, to: 620, dur: 0.42, v: 0.16, vib: 28, vibRate: 9, attack: 0.03 }); },
    grr:   function () { voice({ f: 82, to: 76, dur: 0.48, v: 0.12, am: 0.09, amRate: 31, lp: 650, attack: 0.03 }); },
    awoo:  function () { voice({ type: 'triangle', f: 300, to: 540, glide: 0.25, then: 470, dur: 0.85, v: 0.18, vib: 14, vibRate: 6, attack: 0.05 }); }
  };
  var DOG_POSE = { woof: ['alert', 450], yip: ['happy', 450], sniff: ['idle', 380], tag: ['alert', 520], whine: ['sad', 620], grr: ['sad', 520], awoo: ['alert', 880] }, lastDog = {};
  function bark(name) {
    var now = Date.now(); if (lastDog[name] && now - lastDog[name] < 2000) return; lastDog[name] = now;
    if (prefs.dog) DOG[name](); var pz = DOG_POSE[name]; react(pz[0], pz[1]); if (name === 'woof' || name === 'yip') hop();
  }
  // Every press answers: one capture listener, so no button can be missed. data-sfx="none" opts out.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button, [role="button"], label.btn, a.btn');
    if (!b || b.disabled || b.closest('#boot')) return;
    var sx = b.dataset.sfx; if (sx === 'none') return;
    if (sx && SFX[sx]) SFX[sx](); else if (b.classList.contains('primary')) SFX.confirm(); else SFX.tick();
  }, true);

  // ---------- Toast: what happened, with the real noun. Undo for anything reversible. ----------
  var toastT, undoFn = null;
  function toast(msg, kind, opt) {
    opt = opt || {};
    var t = document.getElementById('toast');
    if (!t || !msg) return;
    var pose = kind === 'error' ? 'sad' : kind === 'success' ? 'happy' : kind === 'new' ? 'alert' : 'idle';
    document.getElementById('toastMsg').textContent = msg;
    // The toast is ink: dark in light mode, so he gets his ring there
    document.getElementById('toastDog').innerHTML = dog(pose, 0, 0, !isDark());
    undoFn = opt.undo || null;
    document.getElementById('toastUndo').hidden = !undoFn;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); undoFn = null; }, undoFn ? 6000 : 2600);
    if (kind === 'error') { react('sad', 900); SFX.error(); }
    else if (kind === 'success') { react('happy', 700); hop(); SFX.success(); if (opt.dog) bark(opt.dog); }
    else if (kind === 'new') { bark('tag'); }
  }
  document.getElementById('toastUndo').addEventListener('click', function () {
    var f = undoFn; undoFn = null; document.getElementById('toast').classList.remove('show'); if (f) f();
  });

  // ---------- Dialog: only for what can't be undone. The title names the action and the thing. ----------
  function confirmAct(o) {
    return new Promise(function (done) {
      var d = document.getElementById('confirm');
      document.getElementById('confirmTitle').textContent = o.title;
      document.getElementById('confirmBody').textContent = o.body || '';
      document.getElementById('confirmKeep').lastChild.textContent = o.keep || 'Cancel';
      document.getElementById('confirmAct').lastChild.textContent = o.act;
      d.addEventListener('close', function f() { d.removeEventListener('close', f); done(d.returnValue === 'act'); });
      d.returnValue = ''; d.showModal(); document.getElementById('confirmKeep').focus(); bark('grr');
    });
  }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });

  // ---------- Scenes on the cards ----------
  var PAL = { s: '#D7E6F5', g: '#8FB069', d: '#3E4A59', t: '#D9893B', w: '#6FA8DC', r: '#E0533F', l: '#4E9A5B', m: '#5B6B7F', c: '#F4F5F7' };
  var SC = {
    temple: ['ssssssssssssssss','ssssssssssssssss','ssssssssdsssssss','ssssssdddddsssss','sssddddddddddsss','ssssddddddddssss','sssssdccccdsssss','sssssdccccdsssss','gggggggggggggggg','gggggggggggggggg'],
    torii:  ['ssssssssssssssss','srrrrrrrrrrrrrrs','ssrrrrrrrrrrrrss','sssrrsssssrrssss','ssrrrrrrrrrrrrss','sssrrsssssrrssss','sssrrsssssrrssss','sssrrsssssrrssss','gggggggggggggggg','gggggggggggggggg'],
    bowl:   ['ssssssssssssssss','ssssssssssssssss','ssssssssssssssss','sssssssttsssssss','sssssstttttsssss','ssssddddddddssss','ssssdttttttdssss','ssssdttttttdssss','sssssddddddsssss','gggggggggggggggg'],
    beach:  ['ssssssssssssssss','ssssssssssssssss','ssssssssssssssss','ssssssssssssssss','wwwwwwwwwwwwwwww','wwwwwwwwwwwwwwww','tttttttttttttttt','tttttttttttttttt','tttttttttttttttt','tttttttttttttttt'],
    fuji:   ['ssssssssssssssss','sssssssccsssssss','ssssssccccssssss','sssssccccccsssss','ssssmmccccmmssss','sssmmmmmmmmmmsss','ssmmmmmmmmmmmmss','smmmmmmmmmmmmmms','wwwwwwwwwwwwwwww','wwwwwwwwwwwwwwww'],
    walk:   ['ssssssssssssssss','ssssssssssssssss','sssllsssssllssss','ssllllsssllllsss','ssllllsssllllsss','sssllsssssllssss','gggggggggggggggg','ggggttttttttgggg','ggggttttttttgggg','ggggttttttttgggg'],
    plane:  ['ssssssssssssssss','ssssssssssssssss','ssssssssssscssss','ssssssssssccssss','sscccccccccccsss','ssssccccccccssss','sssssccccsssssss','ssssssssssssssss','ssssssssssssssss','ssssssssssssssss']
  };
  function sceneSVG(k, fit) {
    var g = SC[k] || SC.walk, out = '';
    g.forEach(function (row, y) { for (var x = 0; x < row.length; x++) out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + PAL[row[x]] + '"/>'; });
    return '<svg viewBox="0 0 16 10" preserveAspectRatio="xMidYMid ' + (fit || 'slice') + '" aria-hidden="true">' + out + '</svg>';
  }
  function sceneFor(kind) { return kind === 'travel' ? 'plane' : 'walk'; }

  // A photo if there is one, otherwise the pixel scene.
  var THUMB_SUFFIX = '-t.jpg';
  function storageUrl(path) {
    if (!path || !sb) return '';
    try { return sb.storage.from('idea-photos').getPublicUrl(path).data.publicUrl; }
    catch (e) { return ''; }
  }
  function photoUrl(d) { return storageUrl(d.photo_path) || (d.auto_photo || ''); }
  function thumbUrl(d) {
    if (d.photo_path) return storageUrl(d.photo_path.replace(/\.jpg$/, THUMB_SUFFIX));
    return d.auto_photo || '';
  }
  function thumb(d) {
    var t = thumbUrl(d);
    if (!t) return sceneSVG(d.scene);
    // The drawing sits under the photo: it shows while the photo loads, and
    // stays if the photo never does. Uploads from before the small file
    // existed try the big one first.
    var full = photoUrl(d);
    var fail = full && full !== t
      ? 'if(this.src!==this.dataset.full){this.src=this.dataset.full}else{this.remove()}' : 'this.remove()';
    return sceneSVG(d.scene) + '<img src="' + esc(t) + '" data-full="' + esc(full) + '" alt="" loading="lazy"'
      + ' decoding="async" width="52" height="52" onerror="' + fail + '">';
  }

  // ---------- Icons, on an 8 x 8 grid like the rest of the art ----------
  var ICONS = {
    link:  ['........','....####','......##','.##..#.#','.#..#..#','.#.#....','.#......','.#####..'],
    close: ['........','.#....#.','..#..#..','...##...','...##...','..#..#..','.#....#.','........'],
    check: ['........','.......#','......##','.#...##.','.##.##..','..###...','...#....','........'],
    up:    ['...##...','..####..','.######.','########','...##...','...##...','...##...','...##...'],
    pencil:['........','.....###','....###.','...###..','..###...','.###....','.##.....','........'],
    send:  ['........','....#...','....##..','.######.','.######.','....##..','....#...','........'],
    back:  ['........','...#....','..##....','.######.','.######.','..##....','...#....','........'],
    menu:  ['........','.######.','........','.######.','........','.######.','........','........'],
    info:  ['........','...##...','........','..###...','...##...','...##...','..####..','........'],
    plus:  ['........','...##...','...##...','.######.','.######.','...##...','...##...','........']
  };
  function icon(name, size) {
    var g = ICONS[name] || ICONS.info, out = '';
    g.forEach(function (row, y) {
      for (var x = 0; x < 8; x++) if (row[x] === '#') out += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
    });
    return '<svg class="px ico" width="' + (size || 24) + '" height="' + (size || 24) + '" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">' + out + '</svg>';
  }

  // ---------- Avatars: a colour and an initial, so names stop eating the row ----------
  var AV = ['#D9893B', '#F1C79E', '#C9CED6', '#E8A96B', '#F8E2CC', '#DF9549'];   // rust 500, 200, Cartridge Grey, rust 300, 100, 400
  function hashOf(s) {
    var h = 0;
    for (var i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  // The name still reaches anyone who hovers, long-presses, or uses a screen reader.
  function avatar(uid) {
    var m = S.data.members.find(function (x) { return x.user_id === uid; });
    var name = m ? m.display_name : 'Someone';
    var gone = m ? !isActive(m) : true;
    var label = name + (gone ? ' (former member)' : '');
    var letter = (name.trim().charAt(0) || '?').toUpperCase();
    return '<span class="av' + (gone ? ' former' : '') + '" style="background:' + AV[hashOf(uid) % AV.length] + '"'
      + ' title="' + esc(label) + '" aria-label="' + esc(label) + '" role="img"'
      + '>' + esc(letter) + '</span>';
  }

  // ---------- Helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hhmm(t) { return t ? String(t).slice(0, 5) : ''; }
  function mins(t) { if (!t) return null; var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function setErr(id, msg) { var el = document.getElementById(id); if (el) el.textContent = msg; else toast(msg, 'error'); }
  function check(r) { if (r.error) throw r.error; return r.data; }
  // Only the days spent at that stop, so an idea in Kyoto can't land on a
  // Tokyo day. A day outside the stop falls back to Unscheduled.
  function dayOpts(sel, stop) {
    var o = '<option value="0">Unscheduled</option>';
    for (var n = 1; n <= plan().ndays; n++) {
      if (stop && stopFor(n) !== stop) continue;
      o += '<option value="' + n + '"' + (sel == n ? ' selected' : '') + '>' + dayLabel(n) + '</option>';
    }
    return o;
  }
  function stopOpts(sel) {
    return stopNames().map(function (s) { return '<option' + (s === sel ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  }
  function displayName() {
    var m = (S.user && S.user.user_metadata) || {};
    return m.full_name || m.name || ((S.user && S.user.email) || 'Someone').split('@')[0];
  }
  function stateBlock(title, line, action) {
    return '<div class="state">' + dogSVG('sleepy', 60) + '<b>' + esc(title) + '</b><span>' + esc(line) + '</span>' + (action || '') + '</div>';
  }
  function loadingBlock(lines) {
    var h = '';
    for (var i = 0; i < (lines || 4); i++) h += '<i style="width:' + [92, 70, 84, 56, 76][i % 5] + '%"></i>';
    return '<div class="skel" aria-label="Loading">' + h + '</div>';
  }

  // ---------- State ----------
  var sb = null;
  var S = {
    user: null, trips: [], tripId: null, data: null,
    tab: 'ideas', day: 0, sheet: null, loading: false,
    adminShown: false, taps: [], notice: ''
  };

  // ---------- Data ----------
  async function loadTrips() {
    S.trips = check(await sb.from('trips').select('id,name,owner_id,created_at').order('created_at', { ascending: false })) || [];
  }
  async function loadTrip(id) {
    var q = await Promise.all([
      sb.from('trips').select('*').eq('id', id).single(),
      sb.from('ideas').select('*').eq('trip_id', id).order('created_at'),
      sb.from('votes').select('idea_id,user_id'),
      sb.from('comments').select('*').order('created_at'),
      sb.from('trip_members').select('*').eq('trip_id', id).order('joined_at'),
      sb.from('activity').select('*').eq('trip_id', id).order('created_at', { ascending: false }).limit(20),
      sb.from('join_requests').select('*').eq('trip_id', id).eq('status', 'pending').order('created_at'),
      sb.from('hidden_suggestions').select('*').eq('trip_id', id),
      sb.from('nearby_suggestions').select('*')
    ]);
    for (var i = 0; i < q.length; i++) if (q[i].error) throw q[i].error;
    S.data = {
      trip: q[0].data, ideas: q[1].data, votes: q[2].data, comments: q[3].data,
      members: q[4].data, activity: q[5].data, requests: q[6].data,
      hidden: q[7].data, nearby: q[8].data
    };
  }
  async function refresh() {
    try { await loadTrip(S.tripId); }
    catch (e) {
      S.tripId = null; S.data = null; S.sheet = null;
      S.notice = 'That trip is gone, or you are no longer in it.';
      try { await loadTrips(); } catch (e2) {}
    }
    render();
  }
  async function openTrip(id) {
    S.tripId = id; S.data = null; S.sheet = null; S.adminShown = false; S.notice = '';
    S.tab = 'ideas'; S.day = todayDay(); S.loading = true;
    render();
    S.loading = false;
    await refresh();
  }
  function backToTrips() {
    S.tripId = null; S.data = null; S.sheet = null;
    loadTrips().catch(function () {}).then(render);
  }

  // ---------- Derived ----------
  function myMember() { return S.data.members.find(function (m) { return m.user_id === S.user.id; }); }
  function isActive(m) { return !m.left_at && !m.kicked_at; }
  function isOwner() { return S.data.trip.owner_id === S.user.id; }
  function canManage() { var m = myMember(); return isOwner() || !!(m && m.is_admin); }
  function isSecretAdmin() { var m = myMember(); return !!(S.adminShown && m && m.is_admin); }
  function nameOf(uid) {
    var m = S.data.members.find(function (x) { return x.user_id === uid; });
    if (!m) return 'Someone';
    return m.display_name + (isActive(m) ? '' : ' (former member)');
  }
  function ideaById(id) { return S.data.ideas.find(function (x) { return x.id === id; }); }
  function votesFor(id) { return S.data.votes.filter(function (v) { return v.idea_id === id; }); }
  function iVoted(id) { return votesFor(id).some(function (v) { return v.user_id === S.user.id; }); }
  function commentsFor(id) { return S.data.comments.filter(function (c) { return c.idea_id === id; }); }
  function plannedOn(n) {
    return S.data.ideas.filter(function (d) { return d.status === 'approved' && d.day === n; })
      .sort(function (a, b) { return (hhmm(a.start_time) || '99:99').localeCompare(hhmm(b.start_time) || '99:99'); });
  }

  // ---------- Renders ----------
  // render() replaces the whole screen, which threw away where you were:
  // picking a later day sent the strip back to day 1, and a vote or an
  // arriving photo jumped the page to the top.
  // The rule: a redraw never moves you. Only opening something new starts at
  // its top. This covers the page, the day strip and an open sheet, so adding
  // a stop, voting or posting a comment leaves you exactly where you were.
  function sheetKey() { return S.sheet ? S.sheet.kind + ':' + (S.sheet.id || '') : ''; }
  var lastSheetKey = '';
  function keepPlace(fn) {
    var bar = document.querySelector('.daybar');
    var left = bar ? bar.scrollLeft : 0;
    var top = window.scrollY;
    var sh = document.querySelector('.sheet');
    var sheetTop = sh ? sh.scrollTop : 0;
    var sameSheet = sheetKey() === lastSheetKey;
    fn();
    var ns = document.querySelector('.sheet');
    if (ns && sameSheet) ns.scrollTop = sheetTop;
    lastSheetKey = sheetKey();
    var nb = document.querySelector('.daybar');
    if (nb) {
      nb.scrollLeft = left;
      var on = nb.querySelector('.chip.on');
      // Only move the strip if the chosen day is off the edge.
      if (on && (on.offsetLeft < nb.scrollLeft
                 || on.offsetLeft + on.offsetWidth > nb.scrollLeft + nb.clientWidth)) {
        nb.scrollLeft = on.offsetLeft - (nb.clientWidth - on.offsetWidth) / 2;
      }
    }
    if (window.scrollY !== top) window.scrollTo(0, top);
  }

  function render() {
    paint();
    barH();
  }
  function paint() {
    if (!S.user) return renderSignIn();
    if (!S.tripId) return renderTrips();
    if (!S.data) return renderTripLoading();
    keepPlace(function () {
      renderTrip();
    });
    if (S.tab === 'map') drawMap();
    findPhotos();
  }

  function renderSetup() {
    app.innerHTML = '<div class="screen"><header class="head"><span class="pixel appname">Walkies</span></header>'
      + '<div class="body">' + stateBlock('Connect the backend first', 'Open config.js and paste your Supabase URL and key. The README has the steps.') + '</div></div>';
  }

  function renderSignIn() {
    app.innerHTML = '<div class="screen center">'
      + dogSVG('idle', 80)
      + '<span class="pixel" style="font-size:32px">Walkies</span>'
      + '<p class="meta">Family trip planning. Family only.</p>'
      + (sessionStorage.getItem(JOIN_KEY) ? '<p class="meta">Sign in to ask to join the trip.</p>' : '')
      + '<button class="btn primary" data-act="signin"><span class="glyph">A</span>Sign in with Google</button>'
      + (S.notice ? '<p class="err">' + esc(S.notice) + '</p>' : '')
      + '</div>';
    paintLock();
  }

  function headerHTML() {
    return '<header class="head">'
      + '<button class="dogbtn" id="headDog" data-act="secret" data-sfx="none" aria-label="Rommel">' + dogSVG(base, 40, true) + '</button>'
      + '<span class="pixel appname">Walkies</span>'
      + '</header>';
  }
  // Settings (Y) on the left, item actions on the right, the A action last and filled.
  function actbarHTML(inTrip) {
    return '<nav class="actbar" aria-label="Actions"><div class="in">'
      + '<button class="btn" data-act="settings-open" data-key="y"><span class="glyph">Y</span>Settings</button>'
      + '<span class="spacer"></span>'
      + (inTrip
          ? '<button class="btn primary" data-act="add-open" data-key="a"><span class="glyph">A</span>Add idea</button>'
          : '')
      + '</div></nav>';
  }
  // The bar can wrap: keep the page's end, the toast and the egg above it
  function barH() {
    var bar = document.querySelector('.actbar');
    document.documentElement.style.setProperty('--bar-h', (bar ? bar.offsetHeight : 0) + 'px');
  }

  function renderTrips() {
    var list = S.trips.map(function (t) {
      return '<button class="card trip-row" data-act="open-trip" data-id="' + esc(t.id) + '">'
        + '<span class="pixel" style="font-size:16px">' + esc(t.name) + '</span>'
        + '<span class="meta">' + (t.owner_id === S.user.id ? 'You own this' : 'Family trip') + '</span></button>';
    }).join('');
    app.innerHTML = '<div class="screen">' + headerHTML()
      + (S.notice ? '<p class="notice">' + esc(S.notice) + '</p>' : '')
      + '<div class="body">'
      + (list
          ? '<h2 class="h-pixel">Your trips</h2>' + list
          : stateBlock('No trips yet', 'Name one below and it is yours to share.'))
      + '<h3 class="h-pixel">New trip</h3>'
      + '<input id="newTripName" placeholder="Name the trip" aria-label="Trip name">'
      + '<button class="btn primary wide" data-act="new-trip"><span class="glyph">A</span>Create trip</button>'
      + '<p class="err" id="tripErr"></p>'
      + '</div>' + actbarHTML(false) + (S.sheet ? sheetHTML() : '') + '</div>';
    S.notice = '';
    paintLock();
  }

  function renderTripLoading() {
    app.innerHTML = '<div class="screen">' + headerHTML() + '<div class="body">' + loadingBlock() + '</div>' + actbarHTML(false) + '</div>';
  }

  function renderTrip() {
    var TABS = [['ideas', 'Ideas'], ['days', 'Days'], ['now', 'Now'], ['map', 'Map'], ['trip', 'Trip']];
    var at = S.tab === 'archive' ? 4 : Math.max(0, TABS.findIndex(function (x) { return x[0] === S.tab; }));
    if (S.lastTabAt == null) S.lastTabAt = at;
    var moved = at !== S.lastTabAt;
    var tabs = '<span class="ind" aria-hidden="true"></span>' + TABS.map(function (x) {
      return '<button role="tab" aria-selected="' + (S.tab === x[0]) + '" data-act="tab" data-tab="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    var body = S.tab === 'days' ? daysHTML()
      : S.tab === 'now' ? nowHTML()
      : S.tab === 'map' ? mapHTML()
      : S.tab === 'archive' ? archiveHTML()
      : S.tab === 'trip' ? tripSheet()
      : ideasHTML();
    app.innerHTML = '<div class="screen">' + headerHTML()
      + (isSecretAdmin() ? '<div class="adminbar">Admin tools on</div>' : '')
      + '<div class="hub"><div class="tabbar' + (moved ? ' moved' : '') + '" role="tablist" style="--n:' + TABS.length + ';--i:' + at + ';--from:' + S.lastTabAt + '">' + tabs + '</div></div>'
      + '<div class="body' + (moved ? ' page' + (at < S.lastTabAt ? ' from-left' : '') : '') + '">' + body + '</div>'
      + actbarHTML(true)
      + (S.sheet ? sheetHTML() : '')
      + '</div>';
    // An empty pool is a quiet screen: he dozes until there's something to look at
    S.lastTabAt = at;
    setBase(S.tab === 'ideas' && !S.data.ideas.some(function (d) { return d.status === 'suggested'; }) ? 'sleepy' : 'idle');
    paintLock();
  }

  // Votes as a paw and a number on the row's right edge, the way the vote
  // button looks, so the eye finds them without reading.
  function voteCount(id) {
    var v = votesFor(id).length;
    return '<span class="votes' + (v ? '' : ' none') + '" aria-label="' + v + ' vote' + (v === 1 ? '' : 's') + '">' + icon('up', 12) + v + '</span>';
  }
  // A day someone hopes for is a dashed chip; no day shows nothing at all.
  function maybeDay(d) {
    return d.day && stopFor(d.day) === d.stop ? '<span class="tag maybe" title="Maybe ' + esc(dayLabel(d.day)) + '">Day ' + d.day + '</span>' : '';
  }

  function ideaCard(d) {
    return '<button class="card" data-act="open-idea" data-id="' + esc(d.id) + '">'
      + '<span class="sc">' + thumb(d) + '</span>'
      + '<span class="inf"><span class="ttl clip">' + esc(d.title) + '</span>'
      + '<span class="mrow">' + avatar(d.created_by) + maybeDay(d) + voteCount(d.id) + '</span>'
      + '</span></button>';
  }

  function ideasHTML() {
    var pool = S.data.ideas.filter(function (d) { return d.status === 'suggested'; });
    var head = '<h2 class="h-pixel lg">' + esc(S.data.trip.name) + '</h2>';
    if (!pool.length) {
      return head + stateBlock('Nothing in the pool', 'Anyone can suggest a place. Paste a link and it lands here.',
        '<button class="btn" data-act="add-open">' + icon('plus', 16) + 'Suggest an idea</button>');
    }
    return head + stopNames().map(function (s) {
      var items = pool.filter(function (d) { return d.stop === s; });
      if (!items.length) return '';
      return '<h3 class="h-pixel">' + esc(s) + '</h3>' + items.map(ideaCard).join('');
    }).join('');
  }

  function archiveHTML() {
    var list = S.data.ideas.filter(function (d) { return d.status === 'removed'; });
    var back = '<div class="row"><button class="btn" data-act="trip-open" data-sfx="back">' + icon('back') + 'Back to Trip</button></div>';
    if (!list.length) return back + stateBlock('Nothing archived', 'Removed ideas land here and stay until the trip ends.');
    return back + '<h2 class="h-pixel">Archive</h2>' + list.map(function (d) {
      return '<div class="card static"><span class="sc">' + thumb(d) + '</span>'
        + '<span class="inf"><span class="ttl clip">' + esc(d.title) + '</span>'
        + '<span class="meta">' + esc(d.stop) + (d.archive_reason ? ' · ' + esc(d.archive_reason) : '') + '</span>'
        + '<button class="btn" data-act="restore" data-id="' + esc(d.id) + '">Restore</button></span></div>';
    }).join('');
  }

  function dayChip(n) {
    var planned = plannedOn(n).length;
    var count = planned;
    var label = n === 0 ? 'Unscheduled' + (count ? ', ' + count + ' waiting' : '')
      : dayLabel(n) + ', ' + stopFor(n) + (count ? ', ' + count + ' planned' : '');
    return '<button class="chip' + (S.day === n ? ' on' : '') + (n && n === todayDay() ? ' today' : '') + '" data-act="day" data-id="' + n + '" aria-label="' + esc(label) + '">'
      + '<span>' + (n || 'Open') + '</span><small>' + esc(n ? stopFor(n) : 'no day') + '</small>'
      + (count ? '<b class="n" aria-hidden="true">' + count + '</b>' : '') + '</button>';
  }

  function plannedCard(d) {
    var tags = (d.start_time ? '<span class="tag ok">' + hhmm(d.start_time) + '</span>' : '<span class="tag">no time</span>')
      + (d.booked ? ' <span class="tag booked">Booked' + (d.booking_ref ? ' · ' + esc(d.booking_ref) : '') + '</span>' : '')
      + (d.kind === 'travel' ? ' <span class="tag">Travel</span>' : '');
    return '<button class="card' + (d.kind === 'travel' ? ' travel' : '') + '" data-act="open-idea" data-id="' + esc(d.id) + '">'
      + '<span class="sc">' + thumb(d) + '</span>'
      + '<span class="inf"><span class="ttl clip">' + esc(d.title) + '</span>'
      + '<span class="mrow">' + avatar(d.created_by) + tags + '</span></span></button>';
  }

  function slotCard(d) {
    var v = votesFor(d.id).length;
    return '<div class="card slot"><span class="sc">' + thumb(d) + '</span>'
      + '<span class="inf"><span class="ttl clip">' + esc(d.title) + '</span>'
      + '<span class="mrow">' + avatar(d.created_by) + '<span class="tag slot">Slot suggested</span>' + voteCount(d.id) + '</span>'
      + '<span class="row">'
      + '<button class="btn" data-act="take" data-id="' + esc(d.id) + '" data-day="' + d.day + '" data-dur="' + (d.duration_min || 60) + '">Take slot</button></span>'
      + '</span></div>';
  }

  function nearbyHTML(stop) {
    var hiddenTitles = S.data.hidden.filter(function (h) { return h.stop === stop; }).map(function (h) { return h.title; });
    var list = S.data.nearby.filter(function (n) { return n.stop === stop && hiddenTitles.indexOf(n.title) < 0; });
    if (!list.length) return '';
    return '<div class="sugg"><p class="meta">Nearby in ' + esc(stop) + ' · suggestions, check before you go</p>'
      + list.map(function (n) {
        return '<div class="nearby"><span class="ttl">' + esc(n.title) + '</span><span class="meta">' + esc(n.kind) + '</span>'
          + '<span class="row">'
          + '<button class="btn" data-act="sugg-add" data-title="' + esc(n.title) + '" data-stop="' + esc(n.stop) + '" data-scene="' + esc(n.scene) + '">Suggest this</button>'
          + '<button class="btn" data-act="sugg-hide" data-title="' + esc(n.title) + '" data-stop="' + esc(n.stop) + '">Not for us</button>'
          + '</span></div>';
      }).join('') + '</div>';
  }

  function daysHTML() {
    var n = S.day, chips = '<div class="daybar">' + dayChip(0);
    for (var k = 1; k <= plan().ndays; k++) chips += dayChip(k);
    chips += '</div>';
    var head = n === 0
      ? '<h2 class="h-pixel">Unscheduled</h2>'
      : '<h2 class="h-pixel">' + dayLabel(n) + '<br><span class="meta">' + esc(stopFor(n)) + ' · ' + esc(tzLabel(stopByName(stopFor(n)).zone)) + ' local time</span></h2>';
    var pre = n > 0 && isOwner() ? '<button class="btn" data-act="preset-open">Pre-set a slot</button>' : '';
    var planned = plannedOn(n), slots = S.data.ideas.filter(function (d) { return d.status === 'suggested' && d.day === n; });
    var items = planned.map(plannedCard).join('') + slots.map(slotCard).join('');
    if (!items) {
      items = stateBlock(n === 0 ? 'Nothing waiting' : 'Nothing planned yet',
        n === 0 ? 'Ideas with no day land here.' : 'Open an idea and give it a time to put it on this day.',
        '<button class="btn" data-act="tab" data-tab="ideas">Go to the pool</button>');
    }
    return chips + head + pre + items + (n > 0 ? nearbyHTML(stopFor(n)) : '');
  }

  // Now: the day as a line Rommel walks down, stopping where you are.
  function nowHTML() {
    var today = todayDay();
    var n = today || (S.day > 0 ? S.day : 1);
    var stop = stopFor(n), zone = stopByName(stop).zone, now = nowMinutes(zone);
    var running = today === n;
    var started = today > 0;
    var items = plannedOn(n).filter(function (d) { return d.start_time; });
    var clock = String(Math.floor(now / 60)).padStart(2, '0') + ':' + String(now % 60).padStart(2, '0');
    var head = '<h2 class="h-pixel">' + (running ? 'Today' : dayLabel(n))
      + '<br><span class="meta">' + esc(stop) + ' · '
      + (running ? 'now ' + clock + ' ' + tzLabel(zone)
         : started ? 'the trip has moved on' : 'the trip has not started')
      + '</span></h2>';

    if (!items.length) {
      return head + stateBlock('Nothing with a time', 'Give an idea a time and it turns up here on the day.',
        '<button class="btn" data-act="tab" data-tab="days">Open the day</button>');
    }

    // Where he stands: the thing happening now, else the next one up, else the start.
    var at = 0;
    if (running) {
      at = items.length - 1;
      for (var i = 0; i < items.length; i++) {
        var st = mins(items[i].start_time);
        if (now < st + (items[i].duration_min || 60)) { at = i; break; }
      }
    }
    var pose = running ? 'idle' : started ? 'sleepy' : 'alert';

    var rows = items.map(function (d, i) {
      var st = mins(d.start_time), en = st + (d.duration_min || 60);
      var past = running && now >= en;
      var here = i === at;
      var rail = here
        ? '<span class="tl-rail">' + dogSVG(pose, 30) + '</span>'
        : '<span class="tl-rail"><span class="tl-dot' + (past ? ' done' : '') + '"></span></span>';
      return rail + '<button class="card tl-item' + (past ? ' past' : '') + (here ? ' here' : '') + '" data-act="open-idea" data-id="' + esc(d.id) + '">'
        + '<span class="inf"><span class="tl-time">' + hhmm(d.start_time) + '</span>'
        + '<span class="ttl clip">' + esc(d.title) + '</span>'
        + '<span class="meta">' + (d.duration_min || 60) + ' min' + (d.booked ? ' · booked' : '') + '</span></span></button>';
    }).join('');

    var foot = running ? '' : '<p class="meta">He walks the line on the day itself.</p>';
    return head + '<div class="tl">' + rows + '</div>' + foot;
  }

  function mapHTML() {
    if (!CFG.MAPS_KEY) return stateBlock('No map key yet', 'Add MAPS_KEY to config.js to show the trip map.');
    var legend = plan().stops.map(function (st, i) {
      var cnt = S.data.ideas.filter(function (d) { return d.stop === st.name && d.status !== 'removed'; }).length;
      return '<div class="card static"><span class="glyph">' + (i + 1) + '</span><span class="inf">'
        + '<span class="ttl">' + esc(st.name) + '</span>'
        + '<span class="meta">Days ' + st.from + ' to ' + st.to + ' · ' + esc(tzLabel(st.zone))
        + ' · ' + cnt + ' item' + (cnt === 1 ? '' : 's')
        + (st.lat == null ? ' · not on the map' : '') + '</span></span></div>';
    }).join('');
    return '<h2 class="h-pixel">The route</h2><div id="mapbox"></div>'
      + '<p class="meta">Pins are the stops, in order. Open an idea for its own link.</p>' + legend;
  }

  var mapsReady = false, mapObj = null;
  function mapFailed() {
    var box = document.getElementById('mapbox');
    if (box && !mapsReady) box.innerHTML = '<p class="empty">The map could not load. Check the key in config.js, and that Maps JavaScript API is on.</p>';
  }
  function drawMap() {
    var box = document.getElementById('mapbox');
    if (!box || !CFG.MAPS_KEY) return;
    if (!mapsReady) {
      if (!window.__walkiesMapsLoading) {
        window.__walkiesMapsLoading = true;
        window.__walkiesMapsDone = function () {
          if (!(window.google && google.maps)) return;   // script answered but the library is not there
          mapsReady = true;
          if (S.tab === 'map') drawMap();
        };
        var sc = document.createElement('script');
        sc.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(CFG.MAPS_KEY) + '&callback=__walkiesMapsDone&loading=async';
        sc.async = true;
        sc.onerror = mapFailed;
        setTimeout(function () { if (!mapsReady) mapFailed(); }, 8000);
        document.head.appendChild(sc);
      }
      box.innerHTML = loadingBlock(3);
      return;
    }
    if (!(window.google && google.maps)) { box.innerHTML = '<p class="empty">The map could not load. Check the key in config.js.</p>'; return; }
    var pinned = plan().stops.filter(function (st) { return st.lat != null && st.lng != null; });
    if (!pinned.length) { box.innerHTML = '<p class="empty">No stop has a place on the map yet.</p>'; return; }
    box.innerHTML = '';
    var pts = pinned.map(function (st) { return { lat: Number(st.lat), lng: Number(st.lng) }; });
    mapObj = new google.maps.Map(box, { mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
    var bounds = new google.maps.LatLngBounds();
    pinned.forEach(function (st, i) {
      new google.maps.Marker({ position: pts[i], map: mapObj, label: String(i + 1), title: st.name });
      bounds.extend(pts[i]);
    });
    var shell = getComputedStyle(document.documentElement).getPropertyValue('--shell').trim() || '#F26B5B';
    new google.maps.Polyline({ path: pts, map: mapObj, strokeColor: shell, strokeWeight: 3 });
    mapObj.fitBounds(bounds, 32);
  }

  // ---------- Sheets ----------
  function sheetHTML() {
    var s = S.sheet;
    var inner = s.kind === 'idea' ? ideaSheet(ideaById(s.id))
      : s.kind === 'edit' ? editSheet(ideaById(s.id))
      : s.kind === 'add' ? addSheet(s.pre, s.day)
      : s.kind === 'plan' ? planSheet()
      : s.kind === 'settings' ? settingsSheet()
      : tripSheet();
    var opening = sheetKey() !== lastSheetKey;
    return '<div class="sheet-wrap" data-act="close-bg"><div class="sheet' + (opening ? ' opening' : '') + '" role="dialog" aria-modal="true">'
      + '<div class="sheet-top"><span class="grab"></span><button class="btn icon" data-act="close-sheet" data-sfx="back" aria-label="Close" title="Close">' + icon('close') + '</button></div>'
      + '<div class="sbody">' + inner + '</div></div></div>';
  }

  function ideaSheet(d) {
    if (!d) return '<p class="err">That idea is gone.</p>';
    var mine = d.created_by === S.user.id, manage = canManage();
    var v = votesFor(d.id).length, voted = iVoted(d.id);
    // Who, where and what state, as an avatar and two chips rather than a sentence.
    var status = d.status === 'approved'
      ? '<span class="tag ok">' + (d.day ? 'Day ' + d.day + (d.start_time ? ' ' + hhmm(d.start_time) : '') : 'Planned') + '</span>'
      : d.status === 'removed' ? '<span class="tag">Archived</span>'
      : maybeDay(d) || '<span class="tag maybe">In the pool</span>';
    var pu = photoUrl(d);
    var credit = !d.photo_path && d.auto_credit ? '<span class="credit">' + esc(d.auto_credit) + '</span>' : '';
    var h = '<div class="hero">' + sceneSVG(d.scene, 'meet') + (pu ? '<img src="' + esc(pu) + '" alt="' + esc(d.title) + '" onerror="this.remove()">' + credit : '') + '</div>'
      + '<h2 class="h-pixel lg">' + esc(d.title) + '</h2>'
      + '<p class="mrow">' + avatar(d.created_by) + '<span class="tag">' + esc(d.stop) + '</span>' + status + '</p>'
      + (d.status === 'removed' && d.archive_reason ? '<p class="meta">' + esc(d.archive_reason) + '</p>' : '')
      + (d.note ? '<div class="note">' + esc(d.note) + '</div>' : '')
      + (d.link ? '<div class="row"><a class="btn" href="' + esc(d.link) + '" target="_blank" rel="noopener">' + icon('link', 16) + (srcName(d.link) === 'Booking page' ? 'Open the booking page' : 'Open in ' + esc(srcName(d.link))) + '</a></div>' : '');

    if (d.status !== 'removed' && (mine || manage)) {
      h += '<div class="upl">'
        + '<label class="btn" for="photoIn">' + icon('plus') + (pu ? 'Change photo' : 'Add a photo') + '</label>'
        + '<input type="file" id="photoIn" accept="image/*" data-id="' + esc(d.id) + '">'
        + (pu ? '<button class="btn" data-act="photo-clear" data-id="' + esc(d.id) + '">Remove photo</button>' : '')
        + '</div><p class="meta" id="uplMsg"></p>';
    }

    if (d.status === 'removed') {
      h += '<div class="row"><button class="btn primary" data-act="restore" data-id="' + esc(d.id) + '"><span class="glyph">A</span>Restore</button></div>';
    } else {
      h += '<div class="row">'
        + '<button class="btn' + (voted ? ' on' : '') + '" data-act="vote" data-id="' + esc(d.id) + '"'
        + ' aria-pressed="' + (voted ? 'true' : 'false') + '"'
        + ' aria-label="' + (voted ? 'Remove your vote' : 'Vote for this') + '" title="' + (voted ? 'Voted' : 'Vote') + '">' + icon('up', 16) + (voted ? 'Upvoted' : 'Upvote') + ' <span class="num">' + v + '</span></button>'
        + ((mine || manage) ? '<button class="btn" data-act="edit-open" data-id="' + esc(d.id) + '">' + icon('pencil', 16) + 'Edit</button>' : '')
        + '</div>'
        + '<div class="plan">'
        + '<label class="lbl">Day<select id="dSel"' + (d.status === 'suggested' ? ' data-maybe="' + esc(d.id) + '"' : '') + '>' + dayOpts(d.day, d.stop) + '</select></label>'
        + '<label class="lbl"><span>Time <span class="dim">' + esc(tzLabel(stopByName(d.stop).zone)) + '</span></span><input id="tIn" type="time" value="' + hhmm(d.start_time) + '"></label>'
        + '<label class="lbl">Min<input id="mIn" type="number" min="15" step="15" value="' + (d.duration_min || 60) + '"></label></div>'
        + '<div class="row"><button class="btn primary" data-act="plan" data-id="' + esc(d.id) + '"><span class="glyph">A</span>' + (d.status === 'approved' ? 'Save' : 'Plan it') + '</button></div>';
      if (d.status === 'approved') {
        h += d.booked
          ? '<div class="row"><span class="tag booked">Booked' + (d.booking_ref ? ' · ' + esc(d.booking_ref) : '') + '</span></div>'
            + '<div class="row"><input id="cancelReason" placeholder="Why cancelled (required)">'
            + '<button class="btn" data-act="unbook" data-id="' + esc(d.id) + '">Booking cancelled</button></div>'
          : '<div class="row"><input id="bookRef" placeholder="Booking ref (optional)">'
            + '<button class="btn" data-act="book" data-id="' + esc(d.id) + '">Mark booked</button></div>';
      }
    }
    h += '<p class="err" id="sErr"></p>';

    if (d.status !== 'removed' && (mine || manage)) {
      h += '<div class="sugg"><p class="meta">' + (mine ? 'Remove' : 'Admin remove') + ' · needs a reason, kept in the log</p>'
        + '<input id="rIn" placeholder="Reason">'
        + (d.booked ? '<label class="meta"><input type="checkbox" id="cancelChk"> The real booking is cancelled</label>' : '')
        + '<button class="btn danger" data-act="remove" data-id="' + esc(d.id) + '">' + (mine ? 'Remove' : 'Remove (admin)') + '</button></div>';
    }

    var cs = commentsFor(d.id);
    h += '<div><p class="meta">Comments</p>'
      + (cs.length ? cs.map(function (c) {
          var canDel = c.user_id === S.user.id || manage;
          return '<div class="cm">' + avatar(c.user_id) + '<span class="inf">' + esc(c.body) + '</span>'
            + (canDel ? '<button class="btn icon" data-act="comment-del" data-id="' + esc(c.id) + '" aria-label="Delete this comment" title="Delete this comment">' + icon('close') + '</button>' : '')
            + '</div>';
        }).join('') : '<p class="meta">No comments yet.</p>')
      + '<div class="row"><input id="cIn" placeholder="Add a comment"><button class="btn icon" data-act="comment" data-id="' + esc(d.id) + '" aria-label="Post this comment" title="Post">' + icon('send') + '</button></div></div>';
    return h;
  }

  function editSheet(d) {
    if (!d) return '<p class="err">That idea is gone.</p>';
    return '<h2 class="h-pixel lg">Edit</h2>'
      + '<label class="lbl">Title<input id="eTitle" value="' + esc(d.title) + '"></label>'
      + '<label class="lbl">Link<input id="eLink" value="' + esc(d.link) + '"></label>'
      + '<label class="lbl">Stop<select id="eStop">' + stopOpts(d.stop) + '</select></label>'
      + (d.day > 0 ? '<p class="meta">Moving it to another stop takes it off ' + dayLabel(d.day) + '.</p>' : '')
      + '<label class="lbl">Note<textarea id="eNote" rows="3">' + esc(d.note) + '</textarea></label>'
      + '<p class="err" id="eErr"></p>'
      + '<div class="row"><button class="btn primary" data-act="edit-save" data-id="' + esc(d.id) + '"><span class="glyph">A</span>Save</button>'
      + '<button class="btn" data-act="open-idea" data-id="' + esc(d.id) + '" data-sfx="back">' + icon('back') + 'Back</button></div>';
  }

  function addSheet(pre, day) {
    return '<h2 class="h-pixel lg">' + (pre ? 'Pre-set a slot' : 'Add to the trip') + '</h2>'
      + '<label class="lbl">Link<input id="fLink" placeholder="Google Maps, Instagram, TikTok or airline link"></label>'
      + '<label class="lbl">Title<input id="fTitle" data-suggest="place" autocomplete="off" placeholder="Name it"></label>'
      + '<div class="suggest" role="listbox"></div>'
      + '<label class="lbl">Type<select id="fKind"><option value="idea">Idea</option><option value="travel">Travel (flight or transfer)</option></select></label>'
      + '<label class="lbl">Stop<select id="fStop">' + stopOpts(stopFor(day || 1)) + '</select></label>'
      + '<label class="lbl">' + (pre ? 'Day' : 'Maybe day') + '<select id="fDay">' + dayOpts(day || 0, stopFor(day || 1)) + '</select></label>'
      + (pre ? '<div class="row"><label class="lbl">Time<input id="fTime" type="time"></label>'
        + '<label class="lbl">Min<input id="fDur" type="number" min="15" step="15" value="60"></label></div>' : '')
      + '<label class="lbl">Booking ref<input id="fRef" placeholder="Optional"></label>'
      + '<label class="lbl">Note<textarea id="fNote" rows="2" placeholder="Why, or flight details"></textarea></label>'
      + '<p class="err" id="fErr"></p>'
      + '<div class="row"><button class="btn primary" data-act="add-submit" data-pre="' + (pre ? '1' : '0') + '"><span class="glyph">A</span>' + (pre ? 'Plan it' : 'Add') + '</button></div>';
  }

  // Every zone the phone knows, so nobody types one. Older Safari lacks the list.
  var ZONES = (function () {
    try { if (Intl.supportedValuesOf) return Intl.supportedValuesOf('timeZone'); } catch (e) {}
    return ['Asia/Tokyo', 'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Vientiane', 'Asia/Singapore',
            'Asia/Seoul', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Manila', 'Asia/Kolkata',
            'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth',
            'Pacific/Auckland', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'UTC'];
  })();

  function planSheet() {
    var d = S.planDraft;
    var total = d.stops.reduce(function (a, x) { return a + Math.max(1, Number(x.days) || 1); }, 0);
    var h = '<h2 class="h-pixel lg">Dates and stops</h2>'
      + '<label class="lbl">First day of the trip<input id="pStart" type="date" value="' + esc(d.start) + '"></label>'
      + '<p class="meta">Stops in the order you visit them. Day numbers follow on from one stop to the next.</p>';
    var day = 1;
    d.stops.forEach(function (st, i) {
      var n = Math.max(1, Number(st.days) || 1);
      // Browsers list some zones under older names (Chrome has Asia/Saigon, not
      // Asia/Ho_Chi_Minh). A zone missing from the list made the select fall back
      // to its first entry, so saving moved Vietnam to Africa/Abidjan. A stop's own
      // zone is always offered.
      var list = st.zone && ZONES.indexOf(st.zone) < 0 ? [st.zone].concat(ZONES) : ZONES;
      var zones = list.map(function (z) {
        return '<option' + (z === st.zone ? ' selected' : '') + '>' + esc(z) + '</option>';
      }).join('');
      h += '<div class="sugg" data-stop-row="' + i + '">'
        + '<div class="row"><span class="glyph">' + (i + 1) + '</span>'
        + '<input data-f="name" data-suggest="city" autocomplete="off" autocorrect="off" value="' + esc(st.name) + '" placeholder="Search a city, or type any place" aria-label="Stop ' + (i + 1) + ' name">'
        + '<button class="btn icon" data-act="plan-del" data-i="' + i + '" aria-label="Remove stop ' + (i + 1) + '" title="Remove"'
        + (d.stops.length < 2 ? ' disabled' : '') + '>' + icon('close') + '</button></div>'
        + '<div class="suggest" role="listbox"></div>'
        + '<div class="row"><label class="lbl">Days<input data-f="days" type="number" min="1" max="60" value="' + n + '"></label>'
        + '<label class="lbl" style="flex:1">Time zone<select data-f="zone">' + zones + '</select></label></div>'
        + '<p class="meta">Day ' + day + (n > 1 ? ' to ' + (day + n - 1) : '')
        + '<span data-hint>' + (cityByName(st.name) ? ' · ' + esc(cityByName(st.name).country) : '') + '</span></p>'
        + '</div>';
      day += n;
    });
    h += '<div class="row"><button class="btn" data-act="plan-add">' + icon('plus') + 'Add a stop</button>'
      + '<span class="meta">' + total + ' days in all</span></div>'
      + '<p class="err" id="pErr"></p>'
      + '<div class="row"><button class="btn primary" data-act="plan-save"><span class="glyph">A</span>Save</button>'
      + '<button class="btn" data-act="trip-open" data-sfx="back">' + icon('back') + 'Back</button></div>';
    return h;
  }

  // ---------- Settings: grouped, in the kit's order. Everything applies at once; there is no Save. ----------
  function toggleRow(act, label, on) {
    return '<div class="setrow"><button class="toggle" type="button" role="switch" aria-checked="' + on + '" data-act="' + act + '" data-sfx="none">'
      + '<span class="track"><span class="knob"></span></span>' + label + '</button></div>';
  }
  function settingsSheet() {
    var th = themePref();
    var seg = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(function (x) {
      return '<button type="button" data-act="set-theme" data-theme="' + x[0] + '" aria-pressed="' + (th === x[0]) + '">' + x[1] + '</button>';
    }).join('');
    return '<h2 class="h-pixel lg">Settings</h2>'
      + '<span class="label">Sound</span>'
      + toggleRow('set-sound', 'Sound', prefs.sound)
      + '<div class="setrow"><span>Volume</span><div class="detent"><input type="range" min="0" max="10" step="1" value="' + prefs.vol + '" id="setVol" aria-label="Volume"></div></div>'
      + toggleRow('set-dog', 'Dog sounds', prefs.dog)
      + '<hr class="hair"><span class="label">Appearance</span>'
      + '<div class="seg" role="group" aria-label="Theme">' + seg + '</div>'
      + (S.tripId ? '<hr class="hair"><span class="label">Notifications</span>'
          + '<div class="row"><button class="btn" type="button" id="pushBtn" data-act="push">Turn on notifications</button></div>'
          + '<p class="meta" id="pushHelp"></p>' : '')
      + '<hr class="hair"><span class="label">Account</span>'
      + '<p class="meta">Signed in as ' + esc((S.user && S.user.email) || displayName()) + '</p>'
      + '<div class="row"><button class="btn" type="button" data-act="signout" data-sfx="back">Sign out</button></div>'
      + '<hr class="hair">'
      + '<button class="tile" type="button" data-act="about"><span class="ic">' + icon('info') + '</span>'
      + '<span class="tt"><b>About Walkies</b><span>Version and credits</span></span></button>';
  }

  function tripSheet() {
    var m = myMember(), owner = isOwner(), manage = canManage(), admin = isSecretAdmin();
    var active = S.data.members.filter(isActive).length;
    var h = '<h2 class="h-pixel lg">' + esc(S.data.trip.name) + '</h2>'
      + '<p class="meta">' + active + ' people · one invite link · the owner approves joins</p>'
      + '<div class="note">' + S.data.members.map(function (x) {
          return esc(x.display_name) + (x.user_id === S.data.trip.owner_id ? ' (owner)' : '') + (isActive(x) ? '' : ' (former)');
        }).join(' · ') + '</div>';

    if (manage) {
      var link = location.origin + location.pathname + '?join=' + S.data.trip.invite_token;
      h += '<p class="meta">Invite link, one link for the whole trip</p><div class="note code">' + esc(link) + '</div>'
        + '<div class="row"><button class="btn" data-act="copy-invite" data-link="' + esc(link) + '">Copy link</button></div>'
        + '<p class="meta">Join queue</p>';
      if (!S.data.requests.length) h += '<p class="meta">Nobody waiting.</p>';
      S.data.requests.forEach(function (r) {
        h += '<div class="row"><span class="inf"><span class="ttl">' + esc(r.display_name) + '</span></span>'
          + '<button class="btn icon" data-act="join-decide" data-id="' + esc(r.id) + '" data-approve="1" aria-label="Let ' + esc(r.display_name) + ' in" title="Approve">' + icon('check') + '</button>'
          + '<button class="btn icon" data-act="join-decide" data-id="' + esc(r.id) + '" data-approve="0" aria-label="Turn ' + esc(r.display_name) + ' away" title="Decline">' + icon('close') + '</button></div>';
      });
    }

    if (admin) {
      h += '<div class="sugg"><p class="meta">Admin · kick a member, with a reason</p>';
      S.data.members.filter(function (x) { return isActive(x) && x.user_id !== S.data.trip.owner_id && x.user_id !== S.user.id; })
        .forEach(function (x) {
          h += '<div class="row"><span class="inf"><span class="ttl">' + esc(x.display_name) + '</span></span>'
            + '<button class="btn danger" data-act="kick" data-id="' + esc(x.user_id) + '">Kick</button></div>';
        });
      h += '<input id="kickReason" placeholder="Reason"></div>';
    }

    if (owner) {
      var pl = plan();
      h += '<div class="row"><button class="btn" data-act="plan-open">' + icon('pencil', 16) + 'Edit dates and stops</button>'
        + '<span class="meta">' + pl.ndays + ' days from ' + esc(dayLabel(1).split(' · ')[1]) + '</span></div>';
    }
    var archived = S.data.ideas.filter(function (x) { return x.status === 'removed'; }).length;
    h += '<div class="row"><button class="btn" data-act="tab" data-tab="archive">Open archive (' + archived + ')</button>'
      + (owner ? '<button class="btn" data-act="delete-trip">Delete trip</button>'
               : (m && isActive(m) ? '<button class="btn" data-act="leave">Leave trip</button>' : ''))
      + '</div>';

    h += '<p class="meta">Activity</p>'
      + (S.data.activity.length
          ? S.data.activity.slice(0, 12).map(function (a) { return '<div class="log">' + esc(a.msg) + '</div>'; }).join('')
          : '<div class="log">Nothing yet.</div>');
    h += '<p class="err" id="tErr"></p>';
    return h;
  }

  // ---------- Actions ----------
  var H = {};

  H.signin = async function () {
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  };
  H.signout = async function () { await sb.auth.signOut(); };
  H.about = function () {
    paintLock();
    document.getElementById('about').showModal();
  };
  H['settings-open'] = function () { S.sheet = { kind: 'settings' }; render(); pushBtnLabel(); };
  H['set-sound'] = function () { prefs.sound = !prefs.sound; savePrefs(); if (prefs.sound) SFX.on(); render(); };
  H['set-dog'] = function () { prefs.dog = !prefs.dog; savePrefs(); if (prefs.dog) SFX.on(); else SFX.off(); render(); };
  H['set-theme'] = function (el) {
    var th = el.dataset.theme;
    try { localStorage.setItem('walkies_theme', th); } catch (e) {}
    if (th === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = th;
    render(); paintLock();
  };

  H['new-trip'] = async function () {
    var name = val('newTripName');
    if (!name) return setErr('tripErr', 'Name the trip first.');
    var id = check(await sb.rpc('create_trip', { p_name: name, p_display: displayName() }));
    toast('Trip created. Share the invite link from Trip.', 'success');
    await openTrip(id);
  };

  H['open-trip'] = function (el) { return openTrip(el.dataset.id); };
  H.tab = function (el) {
    S.tab = el.dataset.tab;
    S.sheet = null;
    if (el.dataset.tab === 'map') bark('sniff');
    render();
    window.scrollTo(0, 0);   // a different view, so start at its top
  };
  H.day = function (el) { S.day = Number(el.dataset.id); render(); };
  H['open-idea'] = function (el) { S.sheet = { kind: 'idea', id: el.dataset.id }; render(); };
  H['edit-open'] = function (el) { S.sheet = { kind: 'edit', id: el.dataset.id }; render(); };
  H['close-sheet'] = function () { S.sheet = null; render(); };
  H['close-bg'] = function (el, ev) { if (ev.target === el) { S.sheet = null; SFX.back(); render(); } };
  H['add-open'] = function () { S.sheet = { kind: 'add', pre: false, day: S.day }; render(); };
  H['preset-open'] = function () { S.sheet = { kind: 'add', pre: true, day: S.day }; render(); };
  H['trip-open'] = function () { S.tab = 'trip'; S.sheet = null; render(); };
  H['sug-pick'] = function (el) {
    var box = el.closest('.suggest');
    var input = box.previousElementSibling.querySelector('[data-suggest]');
    input.value = el.dataset.v;
    box.innerHTML = '';
    applyCity(input);
    input.focus({ preventScroll: true });
  };

  // The editor works on a copy, so nothing changes until Save, and adding or
  // removing a row keeps what has already been typed.
  function readPlanDraft() {
    var d = S.planDraft;
    var st = document.getElementById('pStart');
    if (st) d.start = st.value;
    document.querySelectorAll('[data-stop-row]').forEach(function (row) {
      var x = d.stops[Number(row.dataset.stopRow)];
      if (!x) return;
      var name = row.querySelector('[data-f="name"]').value.trim();
      var city = cityByName(name);
      if (city) {
        name = city.name;                                     // "kyoto" -> "Kyoto"
        if (name !== x.name || x.lat == null) { x.lat = city.lat; x.lng = city.lng; }
      } else if (name !== x.name) { x.lat = null; x.lng = null; }   // a new name needs a new pin
      x.name = name;
      x.days = Math.max(1, Number(row.querySelector('[data-f="days"]').value) || 1);
      x.zone = row.querySelector('[data-f="zone"]').value;
    });
  }
  H['plan-open'] = function () {
    var p = plan();
    S.planDraft = {
      start: p.start,
      stops: p.stops.map(function (x) { return { name: x.name, days: x.days, zone: x.zone, lat: x.lat, lng: x.lng }; })
    };
    S.sheet = { kind: 'plan' };
    render();
  };
  H['plan-add'] = function () {
    readPlanDraft();
    var last = S.planDraft.stops[S.planDraft.stops.length - 1];
    S.planDraft.stops.push({ name: '', days: 1, zone: last ? last.zone : 'UTC', lat: null, lng: null });
    render();
    var rows = document.querySelectorAll('[data-stop-row]'), row = rows[rows.length - 1];
    if (row) {
      row.scrollIntoView({ block: 'nearest' });
      row.querySelector('[data-f="name"]').focus({ preventScroll: true });
    }
  };
  H['plan-del'] = function (el) {
    readPlanDraft();
    if (S.planDraft.stops.length > 1) S.planDraft.stops.splice(Number(el.dataset.i), 1);
    render();
  };
  H['plan-save'] = async function () {
    readPlanDraft();
    var d = S.planDraft;
    if (!d.start) return setErr('pErr', 'Pick the first day of the trip.');
    if (d.stops.some(function (x) { return !x.name; })) return setErr('pErr', 'Every stop needs a name.');
    var names = d.stops.map(function (x) { return x.name.toLowerCase(); });
    if (names.some(function (n, i) { return names.indexOf(n) !== i; })) return setErr('pErr', 'Two stops have the same name.');

    // Ideas keep the stop they were filed under. Say which would be left behind.
    var kept = d.stops.map(function (x) { return x.name; });
    var stray = {};
    S.data.ideas.forEach(function (i) { if (i.status !== 'removed' && kept.indexOf(i.stop) < 0) stray[i.stop] = (stray[i.stop] || 0) + 1; });
    var lost = Object.keys(stray);
    if (lost.length && !(await confirmAct({
        title: 'Take ' + lost.join(', ') + ' off the trip?',
        body: lost.map(function (k) { return k + ' has ' + stray[k] + (stray[k] === 1 ? ' idea' : ' ideas'); }).join('. ')
          + '. They stay under the old stop until someone edits them.',
        keep: 'Keep the stops', act: 'Save without them' }))) return;

    // New or renamed stops get a map pin. A stop we cannot place still saves.
    setErr('pErr', '');
    for (var i = 0; i < d.stops.length; i++) {
      var x = d.stops[i];
      if (x.lat != null && x.lng != null) continue;
      try {
        var r = await sb.functions.invoke('preview', { body: { geocode: x.name } });
        if (r && r.data && r.data.lat != null) { x.lat = r.data.lat; x.lng = r.data.lng; }
      } catch (e) { /* no pin for this one; it is still a stop */ }
    }
    var save = await sb.rpc('set_trip_plan', { p_trip: S.tripId, p_start: d.start, p_stops: d.stops });
    if (save.error) return setErr('pErr', save.error.message);
    var unpinned = d.stops.filter(function (x) { return x.lat == null; }).map(function (x) { return x.name; });
    S.sheet = null;
    S.planDraft = null;
    toast(unpinned.length ? 'Saved. Not on the map: ' + unpinned.join(', ') + '.' : 'Saved. The days have moved to match.',
          unpinned.length ? 'new' : 'success');
    await refresh();
  };

  H['add-submit'] = async function (el) {
    var pre = el.dataset.pre === '1';
    var link = cleanLink(val('fLink')), title = val('fTitle'), kind = val('fKind') || 'idea';
    if (!link) return setErr('fErr', 'Paste a link first.');
    if (!validLink(link)) return setErr('fErr', 'We can’t read that link. Use a Google Maps, Instagram, TikTok or airline link.');
    if (!title) return setErr('fErr', 'Give it a title.');
    var day = Number(val('fDay')) || 0;
    if (pre && day < 1) return setErr('fErr', 'Pick a day for the slot.');
    var r = check(await sb.rpc('add_idea', {
      p_trip: S.tripId, p_kind: kind, p_title: title, p_stop: val('fStop'), p_link: link,
      p_note: val('fNote'), p_scene: sceneFor(kind), p_day: day,
      p_time: pre ? (val('fTime') || null) : null,
      p_dur: pre ? (Number(val('fDur')) || 60) : 60,
      p_ref: val('fRef'), p_preset: pre
    }));
    S.sheet = null;
    if (pre) { S.tab = 'days'; S.day = day; } else S.tab = 'ideas';
    toast(r && r.merged ? 'Already in the pool. Added your vote and note.'
      : pre ? 'Slot planned. Everyone can see it.'
      : 'Added. Anyone can vote, plan it or comment.', 'success');
    await refresh();
  };

  H['edit-save'] = async function (el) {
    var title = val('eTitle'), link = cleanLink(val('eLink'));
    if (!title) return setErr('eErr', 'Give it a title.');
    if (link && !validLink(link)) return setErr('eErr', 'We can’t read that link. Use a Google Maps, Instagram, TikTok or airline link.');
    var r = await sb.rpc('update_idea', { p_idea: el.dataset.id, p_title: title, p_stop: val('eStop'), p_link: link, p_note: val('eNote') });
    if (r.error) return setErr('eErr', r.error.message);
    S.sheet = { kind: 'idea', id: el.dataset.id };
    toast('Saved.', 'success');
    await refresh();
  };

  H.vote = async function (el) {
    var id = el.dataset.id, had = iVoted(id);
    var mine = function (v) { return v.idea_id === id && v.user_id === S.user.id; };
    // Show it immediately. A vote is safe to undo, and the wait is the annoying part.
    if (had) S.data.votes = S.data.votes.filter(function (v) { return !mine(v); });
    else { S.data.votes.push({ idea_id: id, user_id: S.user.id }); react('happy', 600); }
    render();
    var r = had
      ? await sb.from('votes').delete().eq('idea_id', id).eq('user_id', S.user.id)
      : await sb.from('votes').insert({ idea_id: id, user_id: S.user.id });
    if (r.error) {
      if (had) S.data.votes.push({ idea_id: id, user_id: S.user.id });
      else S.data.votes = S.data.votes.filter(function (v) { return !mine(v); });
      toast(r.error.message, 'error');
      render();
    }
  };

  H.plan = async function (el) {
    var day = Number(val('dSel')) || 0, time = val('tIn') || null, dur = Number(val('mIn')) || 60;
    var r = await sb.rpc('place_idea', { p_idea: el.dataset.id, p_day: day, p_time: time, p_dur: dur });
    if (r.error) { setErr('sErr', r.error.message); react('sad', 900); SFX.error(); return; }
    var warn = r.data && r.data.warn;
    if (day) S.day = day;
    S.sheet = null;
    toast(warn || (day ? 'Saved to ' + dayLabel(day) + '.' : 'Saved, unscheduled.'), warn ? 'new' : 'success');
    await refresh();
  };

  H.take = async function (el) {
    var r = await sb.rpc('place_idea', { p_idea: el.dataset.id, p_day: Number(el.dataset.day), p_time: null, p_dur: Number(el.dataset.dur) || 60 });
    if (r.error) return toast(r.error.message, 'error');
    toast('Taken. It is on the plan now.', 'success');
    await refresh();
  };

  H.book = async function (el) {
    var r = await sb.rpc('set_booking', { p_idea: el.dataset.id, p_booked: true, p_ref: val('bookRef'), p_reason: '' });
    if (r.error) return setErr('sErr', r.error.message);
    toast('Marked booked. It stays put until the booking is cancelled.', 'success');
    await refresh();
  };

  H.unbook = async function (el) {
    var r = await sb.rpc('set_booking', { p_idea: el.dataset.id, p_booked: false, p_ref: '', p_reason: val('cancelReason') });
    if (r.error) return setErr('sErr', r.error.message);
    toast('Booking cancelled. You can move it now.', 'new');
    await refresh();
  };

  H.remove = async function (el) {
    var chk = document.getElementById('cancelChk');
    var r = await sb.rpc('remove_idea', { p_idea: el.dataset.id, p_reason: val('rIn'), p_cancel_confirmed: !!(chk && chk.checked) });
    if (r.error) { setErr('sErr', r.error.message); react('sad', 900); SFX.error(); return; }
    S.sheet = null;
    var id = el.dataset.id, title = (ideaById(id) || {}).title || 'it';
    toast('Removed ' + title + '. It’s in the archive.', null, { undo: async function () {
      var u = await sb.rpc('restore_idea', { p_idea: id });
      toast(u.error ? u.error.message : 'Put ' + title + ' back.', u.error ? 'error' : 'success');
      await refresh();
    } });
    await refresh();
  };

  H.restore = async function (el) {
    var r = await sb.rpc('restore_idea', { p_idea: el.dataset.id });
    S.sheet = null;
    toast(r.error ? r.error.message : (r.data || 'Restored.'), r.error ? 'error' : 'success');
    await refresh();
  };

  H.comment = async function (el) {
    var body = val('cIn');
    if (!body) return setErr('sErr', 'Write something first.');
    var r = await sb.from('comments').insert({ idea_id: el.dataset.id, user_id: S.user.id, body: body });
    if (r.error) return setErr('sErr', r.error.message);
    await refresh();
  };

  H['comment-del'] = async function (el) {
    var r = await sb.from('comments').delete().eq('id', el.dataset.id);
    if (r.error) return setErr('sErr', r.error.message);
    await refresh();
  };

  H['sugg-add'] = async function (el) {
    var r = await sb.rpc('add_idea', {
      p_trip: S.tripId, p_kind: 'idea', p_title: el.dataset.title, p_stop: el.dataset.stop,
      p_link: '', p_note: 'Suggested from nearby ideas.', p_scene: el.dataset.scene || 'walk',
      p_day: S.day, p_time: null, p_dur: 60, p_ref: '', p_preset: false
    });
    if (r.error) return toast(r.error.message, 'error');
    S.tab = 'ideas';
    toast('Added to the pool' + (S.day ? ' for ' + dayLabel(S.day) : '') + '.', 'success');
    await refresh();
  };

  H['sugg-hide'] = async function (el) {
    check(await sb.from('hidden_suggestions').insert({ trip_id: S.tripId, stop: el.dataset.stop, title: el.dataset.title }));
    toast('Hidden for everyone.', 'new');
    await refresh();
  };

  H['join-decide'] = async function (el) {
    var r = await sb.rpc('decide_join', { p_request: el.dataset.id, p_approve: el.dataset.approve === '1' });
    if (r.error) return setErr('tErr', r.error.message);
    toast(el.dataset.approve === '1' ? 'They are in.' : 'Not let in.', 'success');
    await refresh();
  };

  H.kick = async function (el) {
    var reason = val('kickReason');
    if (!reason) return setErr('tErr', 'Give a reason before you kick someone.');
    var r = await sb.rpc('kick_member', { p_trip: S.tripId, p_user: el.dataset.id, p_reason: reason });
    if (r.error) return setErr('tErr', r.error.message);
    toast('Kicked. Their ideas stay, marked as former member.', 'new');
    await refresh();
  };

  H.leave = async function () {
    if (!(await confirmAct({ title: 'Leave ' + S.data.trip.name + '?', body: 'Your ideas stay. Getting back in needs the owner to let you in again.',
      keep: 'Stay', act: 'Leave trip' }))) return;
    check(await sb.rpc('leave_trip', { p_trip: S.tripId }));
    backToTrips();
    S.notice = 'You left the trip.';
  };

  H['delete-trip'] = async function () {
    if (!(await confirmAct({ title: 'Delete ' + S.data.trip.name + '?', body: 'Everyone loses it: the ideas, the plan, the photos and the comments.',
      keep: 'Keep it', act: 'Delete trip' }))) return;
    check(await sb.rpc('delete_trip', { p_trip: S.tripId }));
    backToTrips();
    S.notice = 'Trip deleted.';
  };

  H['copy-invite'] = async function (el) {
    try { await navigator.clipboard.writeText(el.dataset.link); toast('Link copied.', 'success'); }
    catch (e) { toast('Press and hold the link to copy it.', 'new'); }
  };

  // Five quick taps on Rommel. The database still decides what an admin may do.
  H.secret = function () {
    var m = S.data && myMember();
    var now = Date.now();
    S.taps = S.taps.filter(function (t) { return now - t < 1500; });
    S.taps.push(now);
    if (S.taps.length >= 5) {
      S.taps = [];
      if (!m || !m.is_admin) return bubbles();      // not an admin: he just wants to play
      S.adminShown = !S.adminShown;
      toast(S.adminShown ? 'Admin tools on.' : 'Admin tools off.', 'new');
      return render();
    }
    hop(); react('alert', 450); if (prefs.dog) DOG.woof();
  };

  // ---------- Photos ----------
  // iPhone photos are far bigger than this needs. Shrink to 1200px before sending.
  // Two sizes from one pick: a big one for the sheet, a small one for the 52px card.
  // Supabase only resizes on paid plans, so the phone does it.
  function resize(file, max, quality) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('That photo would not convert.')); }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read.')); };
      img.src = url;
    });
  }
  async function uploadPhoto(ideaId, file) {
    var msg = document.getElementById('uplMsg');
    if (msg) msg.textContent = 'Uploading…';
    var stamp = Date.now();
    var base = S.tripId + '/' + ideaId + '-' + stamp;
    var pair = await Promise.all([resize(file, 1400, 0.82), resize(file, 220, 0.7)]);
    var put = function (path, blob) {
      return sb.storage.from('idea-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    };
    var ups = await Promise.all([put(base + '.jpg', pair[0]), put(base + THUMB_SUFFIX, pair[1])]);
    for (var i = 0; i < ups.length; i++) if (ups[i].error) throw ups[i].error;
    var r = await sb.rpc('set_idea_photo', { p_idea: ideaId, p_path: base + '.jpg' });
    if (r.error) throw r.error;
    toast('Photo added.', 'success');
    await refresh();
  }
  H['photo-clear'] = async function (el) {
    var r = await sb.rpc('set_idea_photo', { p_idea: el.dataset.id, p_path: '' });
    if (r.error) return setErr('sErr', r.error.message);
    toast('Photo removed. The drawing is back.', 'new');
    await refresh();
  };

  // ---------- Finding a photo by the place's name ----------
  // auto_photo is null until we have looked, then '' for nothing found, so a
  // miss is remembered and never asked about again. Bounded per load, because
  // a quiet trickle beats a burst on hotel wifi.
  var lookingUp = false, moanedAboutPhotos = false;
  // A photo is a nicety, so a failure must not interrupt anyone. It must also
  // not be invisible: silence here hid a broken call through a whole release.
  function photoLookupBroken(why) {
    if (moanedAboutPhotos) return;
    moanedAboutPhotos = true;
    if (window.console) console.warn('Walkies: photo lookup failed -', why);
  }
  async function findPhotos() {
    if (lookingUp || !S.data) return;
    var todo = S.data.ideas.filter(function (d) {
      return d.auto_photo == null && !d.photo_path && d.kind !== 'travel' && d.status !== 'removed';
    }).slice(0, 4);
    if (!todo.length) return;
    lookingUp = true;
    var found = 0;
    try {
      for (var i = 0; i < todo.length; i++) {
        var d = todo[i];
        var r = await sb.functions.invoke('preview', { body: { title: d.title, stop: d.stop, kind: d.kind } });
        // A failed call is not a miss: record nothing, so the next load asks again.
        if (r.error || !r.data || r.data.error) { photoLookupBroken((r.error && r.error.message) || (r.data && r.data.error) || 'no answer'); break; }
        var hit = r.data;
        var save = await sb.rpc('set_auto_photo', {
          p_idea: d.id, p_url: hit.thumbnail || '', p_credit: hit.credit || ''
        });
        if (save.error) { photoLookupBroken(save.error.message); break; }
        d.auto_photo = hit.thumbnail || '';
        d.auto_credit = hit.credit || '';
        if (hit.thumbnail) found++;
      }
    } catch (e) {
      photoLookupBroken(e && e.message);
    }
    lookingUp = false;
    if (found) render();
  }

  // ---------- Push notifications ----------
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && CFG.VAPID_PUBLIC; }
  function b64ToU8(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
  }
  async function pushBtnLabel() {
    var btn = document.getElementById('pushBtn');
    if (!btn) return;
    var help = document.getElementById('pushHelp');
    if (!pushSupported() || !S.tripId) {
      btn.hidden = true;
      if (help) help.textContent = 'Add Walkies to your home screen, then turn them on here.';
      return;
    }
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    btn.disabled = false;
    btn.textContent = sub ? 'Notifications are on' : 'Turn on notifications';
  }
  H.push = async function () {
    if (!pushSupported() || !S.tripId) return;
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications stayed off. Allow them for Walkies in your phone’s settings, then try again.', 'new');
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CFG.VAPID_PUBLIC) });
    var j = sub.toJSON();
    var r = await sb.from('push_subscriptions').upsert({
      endpoint: sub.endpoint, user_id: S.user.id, trip_id: S.tripId, p256dh: j.keys.p256dh, auth: j.keys.auth
    });
    if (r.error) return toast(r.error.message, 'error');
    toast('Notifications are on for this trip.', 'success');
    pushBtnLabel();
  };

  // ---------- Events ----------
  function applyCity(f) {
    var row = f.closest('[data-stop-row]');
    if (!row) return;
    var city = cityByName(f.value);
    var hint = row.querySelector('[data-hint]');
    if (hint) hint.textContent = city ? ' · ' + city.country : '';
    if (!city) return;
    var sel = row.querySelector('[data-f="zone"]');
    var has = [].some.call(sel.options, function (o) { return o.value === city.zone; });
    if (!has) sel.insertAdjacentHTML('afterbegin', '<option>' + esc(city.zone) + '</option>');
    sel.value = city.zone;
  }
  app.addEventListener('input', function (ev) {
    var f = ev.target;
    if (!f.dataset || !f.dataset.suggest) return;
    showSuggestions(f);
    applyCity(f);
    if (f.dataset.suggest === 'place') askLive(f);
  });

  // On a suggestion, picking a day is the whole action: it saves as the day
  // hoped for, without planning it. Planning still takes the button below.
  app.addEventListener('change', async function (ev) {
    var f = ev.target;
    if (f.id !== 'dSel' || !f.dataset.maybe) return;
    var day = Number(f.value) || 0;
    var r = await sb.rpc('set_maybe_day', { p_idea: f.dataset.maybe, p_day: day });
    if (r.error) { toast(r.error.message, 'error'); SFX.error(); await refresh(); return; }
    SFX.tick();
    toast(day ? 'Moved to maybe ' + dayLabel(day) + '.' : 'Moved to any day.', 'success');
    await refresh();
  });

  // A new stop brings its own days; keep the picked day only if it belongs.
  app.addEventListener('change', function (ev) {
    if (ev.target.id !== 'fStop') return;
    var day = document.getElementById('fDay');
    if (day) day.innerHTML = dayOpts(Number(day.value) || 0, ev.target.value);
    var t = document.getElementById('fTitle');
    if (t && t.value) showSuggestions(t);
  });

  app.addEventListener('change', function (ev) {
    var f = ev.target.closest('#photoIn');
    if (!f || !f.files || !f.files[0]) return;
    SFX.tick();
    uploadPhoto(f.dataset.id, f.files[0]).catch(function (e) {
      var m = document.getElementById('uplMsg');
      if (m) m.textContent = '';
      toast((e && e.message) || 'That photo would not upload.', 'error');
    });
  });

  app.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el || el.disabled || el.dataset.busy) return;
    var fn = H[el.dataset.act];
    if (!fn) return;
    // Abroad, on hotel wifi, a save can take seconds with nothing to show for it.
    // Hold the button down for the duration so nobody taps it three times.
    var lock = el.tagName === 'BUTTON';
    if (lock) { el.dataset.busy = '1'; el.disabled = true; }
    Promise.resolve()
      .then(function () { return fn(el, ev); })
      .catch(function (e) { toast((e && e.message) || 'Something went wrong. Try again.', 'error'); })
      .then(function () { if (lock) { el.disabled = false; delete el.dataset.busy; } });
  });
  // Volume: 11 detents, each a click a little higher
  app.addEventListener('input', function (ev) {
    if (ev.target.id !== 'setVol') return;
    prefs.vol = Number(ev.target.value); savePrefs(); SFX.detent(prefs.vol);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { render(); paintLock(); });

  // ---------- Boot screen: once per launch, never on focus or resume. Skippable after 300 ms, ends on the logo. ----------
  function boot() {
    var el = document.getElementById('boot');
    if (!el) return;
    var timers = [], t0 = Date.now(), done = false, $ = function (id) { return document.getElementById(id); };
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('bootDog').innerHTML = dog('sleepy'); $('bootWord').innerHTML = word('#16181D', 12, 4);
    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function finish() { if (done) return; done = true; timers.forEach(clearTimeout); el.remove(); }
    function skip() { if (Date.now() - t0 > 300) finish(); }
    el.addEventListener('click', skip);
    document.addEventListener('keydown', skip, { once: true });
    if (ctx && ctx.state === 'running') SFX.startup();            // browsers allow sound only after an input
    if (reduce) { el.classList.add('done', 'named'); $('bootDog').innerHTML = dog('idle'); at(800, finish); return; }
    el.classList.add('booting');
    // The LCD ghosts each jump for three frames (50 ms): a faint copy where the word just was
    [[0, -24], [110, -18], [220, -12], [330, -6]].forEach(function (j) {
      at(j[0], function () { $('bootGhost').innerHTML = word('#16181D', 12, 4 + j[1]); });
      at(j[0] + 50, function () { $('bootGhost').innerHTML = ''; });
    });
    at(510, function () { $('bootDog').innerHTML = dog('alert'); $('bootEmote').classList.add('show'); el.classList.add('wiping'); });
    at(800, function () { $('bootDog').innerHTML = dog('idle'); $('bootEmote').classList.remove('show'); });
    at(900, function () { el.classList.add('named'); });
    at(1100, finish);
  }

  // ---------- Easter egg: bubbles. He would smile and try to eat them as they floated by. ----------
  var BUB = false, SVGNS = 'http://www.w3.org/2000/svg';
  function bubbleSvg(size) {
    var b = document.createElementNS(SVGNS, 'svg'); b.setAttribute('class', 'bub'); b.setAttribute('width', size); b.setAttribute('height', size); b.setAttribute('viewBox', '0 0 8 8');
    b.innerHTML = '<path fill="currentColor" d="M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v4H0zM7 2h1v4H7zM1 6h1v1H1zM6 6h1v1H6zM2 7h4v1H2z"/><path fill="#ECEEF1" opacity=".7" d="M2 1h4v1H2zM1 2h6v4H1zM2 6h4v1H2z"/><path fill="#7AA7F2" d="M2 2h2v1H2zM2 3h1v1H2z"/>';
    return b;
  }
  function sparks(x, y) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]].forEach(function (d) {
      var sp = document.createElement('span'), dist = Math.random() < .5 ? 32 : 64;
      sp.className = 'spark'; sp.style.left = x + 'px'; sp.style.top = y + 'px';
      sp.style.setProperty('--dx', d[0] * dist + 'px'); sp.style.setProperty('--dy', d[1] * dist + 'px');
      document.body.appendChild(sp); setTimeout(function () { sp.remove(); }, 480);
    });
  }
  function bubbles() {
    if (BUB) return; BUB = true;
    var dk = isDark(), layer = document.createElement('div'), stage = document.createElement('div'), ds = document.createElementNS(SVGNS, 'svg');
    layer.className = 'bubbles'; layer.setAttribute('aria-hidden', 'true'); stage.className = 'bubdog'; stage.setAttribute('aria-hidden', 'true');
    ds.setAttribute('class', 'px'); ds.setAttribute('viewBox', dk ? '-1 -1 12 12' : '0 0 10 10'); ds.setAttribute('width', dk ? 96 : 80); ds.setAttribute('height', dk ? 96 : 80);
    function face(p) { ds.innerHTML = dog(p, 0, 0, dk); }
    face('grin'); stage.appendChild(ds); document.body.appendChild(layer); document.body.appendChild(stage);
    void stage.offsetWidth; stage.classList.add('in'); bark('yip'); toast('Bubbles. He loved these.');
    var list = [], t0 = Date.now(), spawnAt = 0, caught = 0;
    var tick = setInterval(function () {
      var now = Date.now(), el = now - t0, W = innerWidth, H = innerHeight, r = ds.getBoundingClientRect(), m = { x: r.left + r.width / 2, y: r.top + r.height * 0.75, r: r.width / 2 };
      if (el < 7000 && now >= spawnAt) {           // bubbles rise for 7 s
        spawnAt = now + 260 + Math.random() * 340;
        var size = [16, 24, 32][Math.floor(Math.random() * 3)], px = size / 8;
        var b = { el: bubbleSvg(size), size: size, px: px, x: Math.round((W * 0.3 + Math.random() * W * 0.66) / px) * px, y: Math.round(H / px) * px + size, drift: Math.random() < .5 ? -1 : 1, n: 0 };
        b.el.style.left = b.x + 'px'; b.el.style.top = b.y + 'px'; layer.appendChild(b.el); list.push(b);
      }
      list.forEach(function (b) {
        b.n++; b.y -= b.px; if (b.n % 6 === 0) b.x += b.drift * b.px; if (b.n % 36 === 0) b.drift = -b.drift;
        b.el.style.left = b.x + 'px'; b.el.style.top = b.y + 'px'; var cx = b.x + b.size / 2, cy = b.y + b.size / 2;
        if (!b.dead && Math.abs(cx - m.x) < m.r + b.size / 2 && Math.abs(cy - m.y) < m.r * 0.6) {
          b.dead = true; caught++; tone(300, 0.06, { v: 0.12, to: 140 }); tone(1400, 0.035, { v: 0.07, to: 2100 });
          stage.classList.remove('chomp'); void stage.offsetWidth; stage.classList.add('chomp'); face('happy'); setTimeout(function () { face('grin'); }, 160); sparks(cx, cy);
        }
        if (b.dead || b.y < -b.size) { b.el.remove(); b.gone = true; }
      });
      list = list.filter(function (b) { return !b.gone; });
      if (el > 7000 && !list.length) {             // he leaves once the last bubble is gone
        clearInterval(tick); stage.classList.remove('in'); stage.classList.add('out'); bark('woof');
        toast(caught ? 'He got ' + caught + (caught === 1 ? ' bubble.' : ' bubbles.') + ' Good boy.' : 'He missed every one. He never minded.');
        setTimeout(function () { layer.remove(); stage.remove(); BUB = false; }, 300);
      }
    }, 50);
  }
  var eggTyped = '';
  document.addEventListener('keydown', function (e) {
    var tg = e.target;
    if (tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable)) return;
    if (e.key.length !== 1) return;
    eggTyped = (eggTyped + e.key.toLowerCase()).slice(-7);
    if (eggTyped === 'bubbles') { eggTyped = ''; bubbles(); }
  });

  // ---------- Glyph keys, fixed in every ROWMI app: A Enter, B Esc, X Delete, Y Ctrl+comma, L/R Ctrl+Tab ----------
  document.addEventListener('keydown', function (e) {
    if (document.querySelector('dialog[open]')) return;
    var tg = e.target, typing = tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName);
    // B: close the sheet that's open
    if (e.key === 'Escape' && S.sheet) { e.preventDefault(); SFX.back(); S.sheet = null; render(); return; }
    // L / R: the tabs
    if (e.key === 'Tab' && e.ctrlKey && S.data && !S.sheet) {
      e.preventDefault();
      var T = ['ideas', 'days', 'now', 'map', 'trip'], i = Math.max(0, T.indexOf(S.tab === 'archive' ? 'trip' : S.tab));
      var b = document.querySelector('[data-act="tab"][data-tab="' + T[(i + (e.shiftKey ? T.length - 1 : 1)) % T.length] + '"]');
      if (b) b.click();
      return;
    }
    if (S.sheet) return;   // a sheet's own buttons take Enter; the bar waits underneath
    var key = (e.key === 'Delete' && !typing) ? 'x' : (e.key === ',' && (e.ctrlKey || e.metaKey)) ? 'y' : null;
    if (key) { var k = document.querySelector('.actbar [data-key="' + key + '"]:not([disabled])'); if (k) { e.preventDefault(); k.click(); } }
  });

  // ---------- Start ----------
  async function onSession(user) {
    if (S.user && user && S.user.id === user.id) return;
    S.user = user || null;
    if (!S.user) { S.trips = []; S.tripId = null; S.data = null; return renderSignIn(); }
    await processPendingJoin();
    try { await loadTrips(); } catch (e) { S.notice = e.message; }
    render();
  }
  async function processPendingJoin() {
    var token = null;
    try { token = sessionStorage.getItem(JOIN_KEY); sessionStorage.removeItem(JOIN_KEY); } catch (e) {}
    if (!token) return;
    var r = await sb.rpc('request_join', { p_token: token, p_name: displayName() });
    S.notice = r.error ? r.error.message : 'Request sent. The owner will let you in.';
  }

  function start() {
    boot();
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) return renderSetup();
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    var join = new URLSearchParams(location.search).get('join');
    if (join) {
      try { sessionStorage.setItem(JOIN_KEY, join); } catch (e) {}
      history.replaceState(null, '', location.pathname);
    }
    sb.auth.onAuthStateChange(function (_e, session) { onSession(session && session.user); });
  }

  window.ROWMI = { dog: dog, word: word, react: react, toast: toast, SFX: SFX, bubbles: bubbles };
  start();
})();
