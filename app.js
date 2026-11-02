(function () {
  'use strict';

  var CFG = window.WALKIES_CONFIG || {};
  var app = document.getElementById('app');
  var JOIN_KEY = 'walkies_join';

  // ---------- Trip shape ----------
  var STOP_ORDER = ['Tokyo', 'Kyoto', 'Kawaguchiko', 'Hoi An', 'Ha Long'];
  var STOPS = {
    'Tokyo':       { from: 1,  to: 4,  tz: 'JST', zone: 'Asia/Tokyo',       lat: 35.6762, lng: 139.6503 },
    'Kyoto':       { from: 5,  to: 7,  tz: 'JST', zone: 'Asia/Tokyo',       lat: 35.0116, lng: 135.7681 },
    'Kawaguchiko': { from: 8,  to: 9,  tz: 'JST', zone: 'Asia/Tokyo',       lat: 35.5104, lng: 138.7689 },
    'Hoi An':      { from: 10, to: 14, tz: 'ICT', zone: 'Asia/Ho_Chi_Minh', lat: 15.8801, lng: 108.3380 },
    'Ha Long':     { from: 15, to: 18, tz: 'ICT', zone: 'Asia/Ho_Chi_Minh', lat: 20.9101, lng: 107.1839 }
  };
  var NDAYS = 18;
  var TRIP_START = CFG.TRIP_START || '2027-04-12';
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function stopFor(n) {
    for (var i = 0; i < STOP_ORDER.length; i++) {
      var s = STOP_ORDER[i];
      if (n >= STOPS[s].from && n <= STOPS[s].to) return s;
    }
    return STOP_ORDER[0];
  }
  function dayDate(n) {
    var d = new Date(TRIP_START + 'T00:00:00');
    d.setDate(d.getDate() + n - 1);
    return d;
  }
  function dayLabel(n) {
    var d = dayDate(n);
    return 'Day ' + n + ' · ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  // Where we are in the trip, by the clock at that stop.
  function todayDay() {
    var zone = STOPS[STOP_ORDER[0]].zone;
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    var diff = Math.round((new Date(p + 'T00:00:00') - new Date(TRIP_START + 'T00:00:00')) / 86400000) + 1;
    return diff >= 1 && diff <= NDAYS ? diff : 0;
  }
  function nowMinutes(zone) {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    var h = 0, m = 0;
    p.forEach(function (x) { if (x.type === 'hour') h = +x.value; if (x.type === 'minute') m = +x.value; });
    return h * 60 + m;
  }

  // Share links come from all sorts of subdomains: vt.tiktok.com, vm.tiktok.com,
  // google.com.au/maps. Allow any subdomain on the hosts we know.
  var SOCIAL_RE = /^https?:\/\/([a-z0-9-]+\.)*(tiktok\.com|instagram\.com|instagr\.am|jal\.co\.jp|ana\.co\.jp|vietjetair\.com|vietnamairlines\.com)(\/|$)/i;
  var MAPS_RE = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|([a-z0-9-]+\.)*google\.[a-z.]{2,6}\/maps|maps\.google\.[a-z.]{2,6})/i;
  function validLink(u) { return SOCIAL_RE.test(u || '') || MAPS_RE.test(u || ''); }
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
  var reactT;
  function react(pose, ms) {
    var el = document.getElementById('headDog');
    if (!el) return;
    el.innerHTML = dogSVG(pose, 40, true);
    clearTimeout(reactT);
    reactT = setTimeout(function () {
      var e = document.getElementById('headDog');
      if (e) e.innerHTML = dogSVG('idle', 40, true);
    }, ms || 700);
  }

  // ---------- Chip sounds ----------
  var ac = null;
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  var DUTY = { 12: 0.125, 25: 0.25, 50: 0.5, 75: 0.75 }, waves = {};
  function pulseWave(c, duty) {
    if (waves[duty]) return waves[duty];
    var n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (var i = 1; i < n; i++) { im[i] = 2 / (i * Math.PI) * Math.sin(i * Math.PI * duty); re[i] = 0; }
    return (waves[duty] = c.createPeriodicWave(re, im));
  }
  function blip(freq, dur, opt) {
    opt = opt || {};
    var c = audio(); if (!c) return;
    var t = c.currentTime + (opt.at || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.setPeriodicWave(pulseWave(c, DUTY[opt.duty || 50]));
    o.frequency.setValueAtTime(freq, t);
    var vol = opt.vol == null ? 10 : opt.vol, steps = Math.max(1, Math.round(dur * 64));
    for (var i = 0; i <= steps; i++) {
      var v = Math.max(0, vol - (opt.fade === false ? 0 : Math.round(i * vol / steps)));
      g.gain.setValueAtTime(v / 15 * 0.12, t + i / 64);
    }
    g.gain.setValueAtTime(0, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function tap(at, vol) {
    var c = audio(); if (!c) return;
    var n = Math.floor(c.sampleRate * 0.008), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), l = 0x7FFF;
    for (var i = 0; i < n; i++) { var bit = (l ^ (l >> 1)) & 1; l = (l >> 1) | (bit << 14); d[i] = ((l & 1) ? -1 : 1) * vol / 15 * 0.12; }
    var s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(c.currentTime + at);
  }
  var SFX = {
    tick:    function () { blip(2093, 0.03, { duty: 12, vol: 7 }); },
    confirm: function () { blip(988, 0.05, { duty: 25, vol: 8 }); blip(1319, 0.07, { duty: 25, vol: 8, at: 0.05 }); },
    back:    function () { blip(988, 0.05, { duty: 25, vol: 8 }); blip(659, 0.07, { duty: 25, vol: 8, at: 0.05 }); },
    error:   function () { blip(147, 0.09, { duty: 50, vol: 11 }); blip(110, 0.12, { duty: 50, vol: 11, at: 0.1 }); },
    success: function () { [523, 659, 784, 1047].forEach(function (f, i) { blip(f, 0.09, { duty: 50, vol: 9, at: i * 0.06 }); }); },
    yip:     function () { blip(1319, 0.05, { duty: 25, vol: 9 }); blip(1568, 0.06, { duty: 25, vol: 9, at: 0.07 }); },
    chomp:   function () { blip(220, 0.04, { duty: 50, vol: 10 }); },
    pop:     function () { blip(2637, 0.02, { duty: 12, vol: 6 }); tap(0.01, 4); },
    woof:    function () { blip(392, 0.06, { duty: 50, vol: 10 }); blip(262, 0.08, { duty: 50, vol: 10, at: 0.06 }); },
    sniff:   function () { blip(1047, 0.04, { duty: 12, vol: 6 }); blip(1245, 0.04, { duty: 12, vol: 6, at: 0.05 }); },
    startup: function () {
      [0, .11, .22, .33].forEach(function (t, i) { tap(t, 5 + i); });
      blip(784, 0.09, { duty: 50, vol: 12, at: .42, fade: false });
      blip(1047, 0.55, { duty: 50, vol: 13, at: .51 });
    }
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button, [role="button"], label.btn, a.btn');
    if (!b || b.closest('#boot')) return;
    if (b.dataset.sfx) SFX[b.dataset.sfx]();
    else if (b.classList.contains('primary')) SFX.confirm();
    else SFX.tick();
  }, true);

  // ---------- Toast ----------
  var toastT;
  function toast(msg, kind) {
    var t = document.getElementById('toast');
    if (!t || !msg) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 2600);
    if (kind === 'error') { react('sad', 900); SFX.error(); }
    else if (kind === 'success') { react('happy', 700); SFX.success(); }
    else if (kind === 'new') { react('alert', 700); }
  }

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
    // Uploads from before the small file existed fall back to the big one.
    var full = photoUrl(d);
    return '<img src="' + esc(t) + '" alt="" loading="lazy" decoding="async" width="52" height="52"'
      + (full && full !== t ? ' onerror="this.onerror=null;this.src=\'' + esc(full) + '\'"' : '') + '>';
  }

  // ---------- Icons, on an 8 x 8 grid like the rest of the art ----------
  var ICONS = {
    close: ['........','.#....#.','..#..#..','...##...','...##...','..#..#..','.#....#.','........'],
    check: ['........','.......#','......##','.#...##.','.##.##..','..###...','...#....','........'],
    paw:   ['........','.##..##.','.##..##.','........','..####..','.######.','.######.','..####..'],
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
  var AV = ['#F26B5B', '#2FC7A1', '#F0548C', '#9BCB3B', '#F4C430', '#B497F2'];
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
  function dayOpts(sel) {
    var o = '<option value="0"' + (sel == 0 ? ' selected' : '') + '>Unscheduled</option>';
    for (var n = 1; n <= NDAYS; n++) o += '<option value="' + n + '"' + (sel == n ? ' selected' : '') + '>' + dayLabel(n) + ' (' + stopFor(n) + ')</option>';
    return o;
  }
  function stopOpts(sel) {
    return STOP_ORDER.map(function (s) { return '<option' + (s === sel ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  }
  function bars(n) {
    var s = '<span class="bar">';
    for (var k = 0; k < 10; k++) s += '<i class="' + (k < n ? 'on' : '') + '"></i>';
    return s + '</span>';
  }
  function displayName() {
    var m = (S.user && S.user.user_metadata) || {};
    return m.full_name || m.name || ((S.user && S.user.email) || 'Someone').split('@')[0];
  }
  function stateBlock(title, line, action) {
    return '<div class="state">' + dogSVG('sleepy', 60) + '<b>' + esc(title) + '</b><span>' + esc(line) + '</span>' + (action || '') + '</div>';
  }
  function loadingBlock(line) {
    var bars = '';
    for (var i = 0; i < 10; i++) bars += '<i class="' + (i < 4 ? 'on' : '') + '"></i>';
    return '<div class="state"><div class="launchbar">' + bars + '</div><span>' + esc(line || 'Loading…') + '</span></div>';
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
  function render() {
    if (!S.user) return renderSignIn();
    if (!S.tripId) return renderTrips();
    if (!S.data) return renderTripLoading();
    renderTrip();
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

  function headerHTML(inTrip) {
    return '<header class="head">'
      + '<button class="dogbtn" id="headDog" data-act="secret" aria-label="Rommel">' + dogSVG('idle', 40, true) + '</button>'
      + '<span class="pixel appname">Walkies</span><span class="spacer"></span>'
      + (inTrip
          ? '<button class="btn icon" data-act="add-open" aria-label="Add something to the trip" title="Add">' + icon('plus') + '</button>'
            + '<button class="btn icon" data-act="trip-open" aria-label="Trip, people and settings" title="Trip">' + icon('menu') + '</button>'
          : '<button class="btn icon" data-act="about" aria-label="About Walkies" title="About">' + icon('info') + '</button>'
            + '<button class="btn" data-act="signout" data-sfx="back">Sign out</button>')
      + '</header>';
  }

  function renderTrips() {
    var list = S.trips.map(function (t) {
      return '<button class="card trip-row" data-act="open-trip" data-id="' + esc(t.id) + '">'
        + '<span class="pixel" style="font-size:16px">' + esc(t.name) + '</span>'
        + '<span class="meta">' + (t.owner_id === S.user.id ? 'You own this' : 'Family trip') + '</span></button>';
    }).join('');
    app.innerHTML = '<div class="screen">' + headerHTML(false)
      + (S.notice ? '<p class="notice">' + esc(S.notice) + '</p>' : '')
      + '<div class="body">'
      + (list
          ? '<h2 class="h-pixel">Your trips</h2>' + list
          : stateBlock('No trips yet', 'Name one below and it is yours to share.'))
      + '<h3 class="h-pixel">New trip</h3>'
      + '<input id="newTripName" placeholder="Name the trip" aria-label="Trip name">'
      + '<button class="btn primary wide" data-act="new-trip"><span class="glyph">A</span>Create trip</button>'
      + '<p class="err" id="tripErr"></p>'
      + '</div></div>';
    S.notice = '';
    paintLock();
  }

  function renderTripLoading() {
    app.innerHTML = '<div class="screen">' + headerHTML(false) + '<div class="body">' + loadingBlock('Fetching the trip…') + '</div></div>';
  }

  function renderTrip() {
    var tabs = [['ideas', 'Ideas'], ['days', 'Days'], ['now', 'Now'], ['map', 'Map']].map(function (x) {
      return '<button class="' + (S.tab === x[0] ? 'on' : '') + '" data-act="tab" data-tab="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    var body = S.tab === 'days' ? daysHTML()
      : S.tab === 'now' ? nowHTML()
      : S.tab === 'map' ? mapHTML()
      : S.tab === 'archive' ? archiveHTML()
      : ideasHTML();
    app.innerHTML = '<div class="screen">' + headerHTML(true)
      + (isSecretAdmin() ? '<div class="adminbar">Admin tools on</div>' : '')
      + '<nav class="tabs">' + tabs + '</nav>'
      + '<div class="body">' + body + '</div>'
      + (S.sheet ? sheetHTML() : '')
      + '</div>';
    paintLock();
  }

  function ideaCard(d) {
    var v = votesFor(d.id).length;
    return '<button class="card" data-act="open-idea" data-id="' + esc(d.id) + '">'
      + '<span class="sc">' + thumb(d) + '</span>'
      + '<span class="inf"><span class="ttl clip">' + esc(d.title) + '</span>'
      + '<span class="meta">' + avatar(d.created_by) + (d.day ? 'maybe day ' + d.day : 'any day') + ' · ' + v + ' vote' + (v === 1 ? '' : 's') + '</span>'
      + bars(v) + '</span></button>';
  }

  function ideasHTML() {
    var pool = S.data.ideas.filter(function (d) { return d.status === 'suggested'; });
    var head = '<h2 class="h-pixel">' + esc(S.data.trip.name) + '</h2>';
    if (!pool.length) {
      return head + stateBlock('Nothing in the pool', 'Anyone can suggest a place. Paste a link and it lands here.',
        '<button class="btn primary" data-act="add-open"><span class="glyph">A</span>Suggest an idea</button>');
    }
    return head + STOP_ORDER.map(function (s) {
      var items = pool.filter(function (d) { return d.stop === s; });
      if (!items.length) return '';
      return '<h3 class="h-pixel">' + esc(s) + '</h3>' + items.map(ideaCard).join('');
    }).join('');
  }

  function archiveHTML() {
    var list = S.data.ideas.filter(function (d) { return d.status === 'removed'; });
    var back = '<div class="row"><button class="btn" data-act="tab" data-tab="ideas" data-sfx="back">' + icon('back') + 'Pool</button></div>';
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
    var slots = S.data.ideas.filter(function (d) { return d.status === 'suggested' && d.day === n; }).length;
    var small = n === 0 ? planned + ' waiting' : planned ? planned + ' planned' : slots ? slots + ' slot' : stopFor(n);
    return '<button class="chip' + (S.day === n ? ' on' : '') + (n === todayDay() ? ' today' : '') + '" data-act="day" data-id="' + n + '">'
      + '<span>' + (n || 'Open') + '</span><small>' + esc(small) + '</small></button>';
  }

  function plannedCard(d) {
    var tags = (d.start_time ? '<span class="tag ok">' + hhmm(d.start_time) + '</span>' : '<span class="tag">no time</span>')
      + (d.booked ? ' <span class="tag booked">Booked' + (d.booking_ref ? ' · ' + esc(d.booking_ref) : '') + '</span>' : '')
      + (d.kind === 'travel' ? ' <span class="tag">Travel</span>' : '');
    return '<button class="card' + (d.kind === 'travel' ? ' travel' : '') + '" data-act="open-idea" data-id="' + esc(d.id) + '">'
      + '<span class="sc">' + thumb(d) + '</span>'
      + '<span class="inf"><span class="ttl clip">' + esc(d.title) + '</span>'
      + '<span class="meta">' + avatar(d.created_by) + esc(d.stop) + ' · ' + STOPS[d.stop].tz + '</span>'
      + '<span class="row">' + tags + '</span></span></button>';
  }

  function slotCard(d) {
    var v = votesFor(d.id).length;
    return '<div class="card slot"><span class="sc">' + thumb(d) + '</span>'
      + '<span class="inf"><span class="ttl clip">' + esc(d.title) + '</span>'
      + '<span class="meta">' + avatar(d.created_by) + v + ' votes</span>'
      + '<span class="row"><span class="tag slot">Slot suggested</span>'
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
    for (var k = 1; k <= NDAYS; k++) chips += dayChip(k);
    chips += '</div>';
    var head = n === 0
      ? '<h2 class="h-pixel">Unscheduled</h2>'
      : '<h2 class="h-pixel">' + dayLabel(n) + '<br><span class="meta">' + esc(stopFor(n)) + ' · ' + STOPS[stopFor(n)].tz + ' local time</span></h2>';
    var pre = n > 0 && isOwner() ? '<button class="btn" data-act="preset-open">Pre-set a slot</button>' : '';
    var planned = plannedOn(n), slots = S.data.ideas.filter(function (d) { return d.status === 'suggested' && d.day === n; });
    var items = planned.map(plannedCard).join('') + slots.map(slotCard).join('');
    if (!items) {
      items = stateBlock(n === 0 ? 'Nothing waiting' : 'Nothing planned yet',
        n === 0 ? 'Ideas with no day land here.' : 'Open an idea and give it a time to put it on this day.',
        '<button class="btn primary" data-act="tab" data-tab="ideas"><span class="glyph">A</span>Go to the pool</button>');
    }
    return chips + head + pre + items + (n > 0 ? nearbyHTML(stopFor(n)) : '');
  }

  // Now: the day as a line Rommel walks down, stopping where you are.
  function nowHTML() {
    var today = todayDay();
    var n = today || (S.day > 0 ? S.day : 1);
    var stop = stopFor(n), zone = STOPS[stop].zone, now = nowMinutes(zone);
    var running = today === n;
    var started = today > 0;
    var items = plannedOn(n).filter(function (d) { return d.start_time; });
    var clock = String(Math.floor(now / 60)).padStart(2, '0') + ':' + String(now % 60).padStart(2, '0');
    var head = '<h2 class="h-pixel">' + (running ? 'Today' : dayLabel(n))
      + '<br><span class="meta">' + esc(stop) + ' · '
      + (running ? 'now ' + clock + ' ' + STOPS[stop].tz
         : started ? 'the trip has moved on' : 'the trip has not started')
      + '</span></h2>';

    if (!items.length) {
      return head + stateBlock('Nothing with a time', 'Give an idea a time and it turns up here on the day.',
        '<button class="btn primary" data-act="tab" data-tab="days"><span class="glyph">A</span>Open the day</button>');
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
    var legend = STOP_ORDER.map(function (s, i) {
      var cnt = S.data.ideas.filter(function (d) { return d.stop === s && d.status !== 'removed'; }).length;
      return '<div class="card static"><span class="glyph">' + (i + 1) + '</span><span class="inf">'
        + '<span class="ttl">' + esc(s) + '</span>'
        + '<span class="meta">Days ' + STOPS[s].from + ' to ' + STOPS[s].to + ' · ' + STOPS[s].tz + ' · ' + cnt + ' item' + (cnt === 1 ? '' : 's') + '</span></span></div>';
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
      box.innerHTML = loadingBlock('Loading the map…');
      return;
    }
    if (!(window.google && google.maps)) { box.innerHTML = '<p class="empty">The map could not load. Check the key in config.js.</p>'; return; }
    box.innerHTML = '';
    var pts = STOP_ORDER.map(function (s) { return { lat: STOPS[s].lat, lng: STOPS[s].lng }; });
    mapObj = new google.maps.Map(box, { mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
    var bounds = new google.maps.LatLngBounds();
    STOP_ORDER.forEach(function (s, i) {
      new google.maps.Marker({ position: pts[i], map: mapObj, label: String(i + 1), title: s });
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
      : tripSheet();
    return '<div class="sheet-wrap" data-act="close-bg"><div class="sheet" role="dialog" aria-modal="true">'
      + '<div class="sheet-top"><span class="grab"></span><button class="btn icon" data-act="close-sheet" data-sfx="back" aria-label="Close" title="Close">' + icon('close') + '</button></div>'
      + '<div class="sbody">' + inner + '</div></div></div>';
  }

  function ideaSheet(d) {
    if (!d) return '<p class="err">That idea is gone.</p>';
    var mine = d.created_by === S.user.id, manage = canManage();
    var v = votesFor(d.id).length, voted = iVoted(d.id);
    var status = d.status === 'approved'
      ? (d.day ? 'Planned on ' + dayLabel(d.day) + (d.start_time ? ' at ' + hhmm(d.start_time) : '') : 'Planned, no day yet')
      : d.status === 'removed' ? 'In the archive' + (d.archive_reason ? ' · ' + d.archive_reason : '') : 'In the pool';
    var pu = photoUrl(d);
    var credit = !d.photo_path && d.auto_credit ? '<span class="credit">' + esc(d.auto_credit) + '</span>' : '';
    var h = '<div class="hero">' + (pu ? '<img src="' + esc(pu) + '" alt="' + esc(d.title) + '">' + credit : sceneSVG(d.scene, 'meet')) + '</div>'
      + '<h2 class="h-pixel lg">' + esc(d.title) + '</h2>'
      + '<p class="meta">' + esc(d.stop) + ' · ' + STOPS[d.stop].tz + ' · by ' + esc(nameOf(d.created_by)) + '</p>'
      + '<p class="meta">' + esc(status) + '</p>'
      + (d.note ? '<div class="note">' + esc(d.note) + '</div>' : '')
      + (d.link ? '<a class="src" href="' + esc(d.link) + '" target="_blank" rel="noopener">Open ' + esc(srcName(d.link)) + ' ↗</a>' : '');

    if (d.status !== 'removed' && (mine || manage)) {
      h += '<div class="upl">'
        + '<label class="btn" for="photoIn">' + icon('plus') + (pu ? 'Change photo' : 'Add a photo') + '</label>'
        + '<input type="file" id="photoIn" accept="image/*" data-id="' + esc(d.id) + '">'
        + (pu ? '<button class="btn" data-act="photo-clear" data-id="' + esc(d.id) + '">Remove photo</button>' : '')
        + '</div><p class="meta" id="uplMsg">Your own photo. It shows on the card and here.</p>';
    }

    if (d.status === 'removed') {
      h += '<div class="row"><button class="btn primary" data-act="restore" data-id="' + esc(d.id) + '"><span class="glyph">A</span>Restore</button></div>';
    } else {
      h += '<div class="row">'
        + '<button class="btn' + (voted ? ' primary' : '') + '" data-act="vote" data-id="' + esc(d.id) + '"'
        + ' aria-label="' + (voted ? 'Remove your vote' : 'Vote for this') + '" title="' + (voted ? 'Voted' : 'Vote') + '">' + icon('paw') + v + '</button>'
        + ((mine || manage) ? '<button class="btn icon" data-act="edit-open" data-id="' + esc(d.id) + '" aria-label="Edit this" title="Edit">' + icon('pencil') + '</button>' : '')
        + '</div>'
        + '<div class="plan">'
        + '<label class="lbl">Day<select id="dSel">' + dayOpts(d.day) + '</select></label>'
        + '<label class="lbl">Time<input id="tIn" type="time" value="' + hhmm(d.start_time) + '"></label>'
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
      + '<label class="lbl">Note<textarea id="eNote" rows="3">' + esc(d.note) + '</textarea></label>'
      + '<p class="err" id="eErr"></p>'
      + '<div class="row"><button class="btn primary" data-act="edit-save" data-id="' + esc(d.id) + '"><span class="glyph">A</span>Save</button>'
      + '<button class="btn" data-act="open-idea" data-id="' + esc(d.id) + '" data-sfx="back">' + icon('back') + 'Back</button></div>';
  }

  function addSheet(pre, day) {
    return '<h2 class="h-pixel lg">' + (pre ? 'Pre-set a slot' : 'Add to the trip') + '</h2>'
      + '<label class="lbl">Link<input id="fLink" placeholder="Google Maps, Instagram, TikTok or airline link"></label>'
      + '<label class="lbl">Title<input id="fTitle" placeholder="Name it"></label>'
      + '<label class="lbl">Type<select id="fKind"><option value="idea">Idea</option><option value="travel">Travel (flight or transfer)</option></select></label>'
      + '<label class="lbl">Stop<select id="fStop">' + stopOpts(stopFor(day || 1)) + '</select></label>'
      + '<label class="lbl">' + (pre ? 'Day' : 'Maybe day') + '<select id="fDay">' + dayOpts(day || 0) + '</select></label>'
      + (pre ? '<div class="row"><label class="lbl">Time<input id="fTime" type="time"></label>'
        + '<label class="lbl">Min<input id="fDur" type="number" min="15" step="15" value="60"></label></div>' : '')
      + '<label class="lbl">Booking ref<input id="fRef" placeholder="Optional"></label>'
      + '<label class="lbl">Note<textarea id="fNote" rows="2" placeholder="Why, or flight details"></textarea></label>'
      + '<p class="err" id="fErr"></p>'
      + '<div class="row"><button class="btn primary" data-act="add-submit" data-pre="' + (pre ? '1' : '0') + '"><span class="glyph">A</span>' + (pre ? 'Plan it' : 'Add') + '</button></div>';
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
          + '<button class="btn primary icon" data-act="join-decide" data-id="' + esc(r.id) + '" data-approve="1" aria-label="Let ' + esc(r.display_name) + ' in" title="Approve">' + icon('check') + '</button>'
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

    var archived = S.data.ideas.filter(function (x) { return x.status === 'removed'; }).length;
    h += '<div class="row"><button class="btn" data-act="tab" data-tab="archive">Archive · ' + archived + '</button>'
      + '<button class="btn" data-act="about">About Walkies</button>'
      + (owner ? '<button class="btn danger" data-act="delete-trip">Delete trip</button>'
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
    paintLock(); pushBtnLabel(); themeBtnLabel();
    document.getElementById('about').showModal();
  };
  function themeBtnLabel() {
    var b = document.getElementById('themeBtn');
    if (b) b.textContent = isDark() ? 'Light mode' : 'Dark mode';
  }

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
    if (el.dataset.tab === 'map') SFX.sniff();
    render();
  };
  H.theme = function () {
    var next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('walkies_theme', next); } catch (e) {}
    themeBtnLabel();
    render();
    paintLock();
  };
  H.day = function (el) { S.day = Number(el.dataset.id); render(); };
  H['open-idea'] = function (el) { S.sheet = { kind: 'idea', id: el.dataset.id }; render(); };
  H['edit-open'] = function (el) { S.sheet = { kind: 'edit', id: el.dataset.id }; render(); };
  H['close-sheet'] = function () { S.sheet = null; render(); };
  H['close-bg'] = function (el, ev) { if (ev.target === el) { S.sheet = null; SFX.back(); render(); } };
  H['add-open'] = function () { S.sheet = { kind: 'add', pre: false, day: S.day }; render(); };
  H['preset-open'] = function () { S.sheet = { kind: 'add', pre: true, day: S.day }; render(); };
  H['trip-open'] = function () { S.sheet = { kind: 'trip' }; render(); };

  H['add-submit'] = async function (el) {
    var pre = el.dataset.pre === '1';
    var link = val('fLink'), title = val('fTitle'), kind = val('fKind') || 'idea';
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
    var title = val('eTitle'), link = val('eLink');
    if (!title) return setErr('eErr', 'Give it a title.');
    if (link && !validLink(link)) return setErr('eErr', 'We can’t read that link. Use a Google Maps, Instagram, TikTok or airline link.');
    var r = await sb.rpc('update_idea', { p_idea: el.dataset.id, p_title: title, p_stop: val('eStop'), p_link: link, p_note: val('eNote') });
    if (r.error) return setErr('eErr', r.error.message);
    S.sheet = { kind: 'idea', id: el.dataset.id };
    toast('Saved.', 'success');
    await refresh();
  };

  H.vote = async function (el) {
    var id = el.dataset.id;
    if (iVoted(id)) check(await sb.from('votes').delete().eq('idea_id', id).eq('user_id', S.user.id));
    else { check(await sb.from('votes').insert({ idea_id: id, user_id: S.user.id })); react('happy', 600); }
    await refresh();
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
    toast('Moved to the archive. Restore it any time.', 'new');
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
    if (!confirm('Leave the trip? Your ideas stay, marked as former member.')) return;
    check(await sb.rpc('leave_trip', { p_trip: S.tripId }));
    backToTrips();
    S.notice = 'You left the trip.';
  };

  H['delete-trip'] = async function () {
    if (!confirm('Delete this trip for everyone? Nobody will see it any more.')) return;
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
    react('alert', 300);
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
  var lookingUp = false;
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
        var hit = (r && r.data) || {};
        var save = await sb.rpc('set_auto_photo', {
          p_idea: d.id, p_url: hit.thumbnail || '', p_credit: hit.credit || ''
        });
        if (save.error) break;
        d.auto_photo = hit.thumbnail || '';
        d.auto_credit = hit.credit || '';
        if (hit.thumbnail) found++;
      }
    } catch (e) {
      // A photo is a nicety. If the lookup fails the drawing stays.
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
    if (!pushSupported() || !S.tripId) {
      btn.textContent = 'Notifications need the home screen app';
      btn.disabled = true;
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
    if (perm !== 'granted') return toast('Notifications stayed off. You can turn them on in Settings.', 'new');
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
    if (!el || el.disabled) return;
    var fn = H[el.dataset.act];
    if (!fn) return;
    Promise.resolve().then(function () { return fn(el, ev); }).catch(function (e) {
      toast((e && e.message) || 'Something went wrong. Try again.', 'error');
    });
  });
  document.getElementById('pushBtn').addEventListener('click', function () { H.push(); });
  document.getElementById('themeBtn').addEventListener('click', function () { H.theme(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { render(); paintLock(); });

  // ---------- Boot screen ----------
  function boot() {
    var el = document.getElementById('boot');
    if (!el) return;
    var timers = [], t0 = Date.now(), done = false;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('bootDog').innerHTML = dog('sleepy');
    document.getElementById('bootWord').innerHTML = word('#16181D', 12, 4);
    function at(ms, fn) { timers.push(setTimeout(fn, ms)); }
    function finish() { if (done) return; done = true; timers.forEach(clearTimeout); el.remove(); }
    function skip() { if (Date.now() - t0 > 300) finish(); }
    el.addEventListener('click', skip);
    document.addEventListener('keydown', skip, { once: true });
    if (audio() && ac.state === 'running') SFX.startup();
    if (reduce) {
      el.classList.add('done', 'named');
      document.getElementById('bootDog').innerHTML = dog('idle');
      at(800, finish); return;
    }
    el.classList.add('booting');
    at(510, function () {
      document.getElementById('bootDog').innerHTML = dog('alert');
      document.getElementById('bootEmote').classList.add('show');
      el.classList.add('wiping');
    });
    at(800, function () {
      document.getElementById('bootDog').innerHTML = dog('idle');
      document.getElementById('bootEmote').classList.remove('show');
    });
    at(900, function () { el.classList.add('named'); });
    at(1100, finish);
  }

  // ---------- Bubbles: he would try to eat them as they floated by ----------
  var BUB = false, SVGNS = 'http://www.w3.org/2000/svg';
  function bubbleSvg(size) {
    var b = document.createElementNS(SVGNS, 'svg');
    b.setAttribute('class', 'bub'); b.setAttribute('width', size); b.setAttribute('height', size); b.setAttribute('viewBox', '0 0 8 8');
    b.innerHTML = '<path fill="currentColor" d="M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v4H0zM7 2h1v4H7zM1 6h1v1H1zM6 6h1v1H6zM2 7h4v1H2z"/>'
      + '<path fill="#ECEEF1" opacity=".7" d="M2 1h4v1H2zM1 2h6v4H1zM2 6h4v1H2z"/>'
      + '<path fill="#7AA7F2" d="M2 2h2v1H2zM2 3h1v1H2z"/>';
    return b;
  }
  function sparks(x, y) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]].forEach(function (d) {
      var s = document.createElement('span'), dist = Math.random() < .5 ? 32 : 64;
      s.className = 'spark'; s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--dx', d[0] * dist + 'px'); s.style.setProperty('--dy', d[1] * dist + 'px');
      document.body.appendChild(s);
      setTimeout(function () { s.remove(); }, 480);
    });
  }
  function bubbles() {
    if (BUB) return;
    BUB = true;
    var dk = isDark(), layer = document.createElement('div'), stage = document.createElement('div'), ds = document.createElementNS(SVGNS, 'svg');
    layer.className = 'bubbles'; layer.setAttribute('aria-hidden', 'true');
    stage.className = 'bubdog'; stage.setAttribute('aria-hidden', 'true');
    ds.setAttribute('class', 'px'); ds.setAttribute('viewBox', dk ? '-1 -1 12 12' : '0 0 10 10');
    ds.setAttribute('width', dk ? 96 : 80); ds.setAttribute('height', dk ? 96 : 80);
    function face(p) { ds.innerHTML = dog(p, 0, 0, dk); }
    face('grin'); stage.appendChild(ds);
    document.body.appendChild(layer); document.body.appendChild(stage);
    void stage.offsetWidth; stage.classList.add('in');
    SFX.yip(); toast('Bubbles. He loved these.');
    var list = [], t0 = Date.now(), spawnAt = 0, caught = 0, left = false;
    var tick = setInterval(function () {
      var now = Date.now(), el = now - t0, W = innerWidth, H = innerHeight;
      var r = ds.getBoundingClientRect(), m = { x: r.left + r.width / 2, y: r.top + r.height * 0.75, r: r.width / 2 };
      if (el < 6500 && now >= spawnAt) {
        spawnAt = now + 260 + Math.random() * 340;
        var size = [16, 24, 32][Math.floor(Math.random() * 3)], px = size / 8;
        var b = { el: bubbleSvg(size), size: size, px: px, x: Math.round((W * 0.3 + Math.random() * W * 0.66) / px) * px, y: Math.round(H / px) * px + size, drift: Math.random() < .5 ? -1 : 1, n: 0 };
        b.el.style.left = b.x + 'px'; b.el.style.top = b.y + 'px';
        layer.appendChild(b.el); list.push(b);
      }
      list.forEach(function (b) {
        b.n++; b.y -= b.px;
        if (b.n % 6 === 0) b.x += b.drift * b.px;
        if (b.n % 36 === 0) b.drift = -b.drift;
        b.el.style.left = b.x + 'px'; b.el.style.top = b.y + 'px';
        var cx = b.x + b.size / 2, cy = b.y + b.size / 2;
        if (!left && !b.dead && Math.abs(cx - m.x) < m.r + b.size / 2 && Math.abs(cy - m.y) < m.r * 0.6) {
          b.dead = true; caught++; SFX.chomp(); SFX.pop();
          stage.classList.remove('chomp'); void stage.offsetWidth; stage.classList.add('chomp');
          face('happy'); setTimeout(function () { face('grin'); }, 160);
          sparks(cx, cy);
        }
        if (b.dead || b.y < -b.size) { b.el.remove(); b.gone = true; }
      });
      list = list.filter(function (b) { return !b.gone; });
      if (el > 9000 && !left) {
        left = true; stage.classList.remove('in'); stage.classList.add('out'); SFX.woof();
        toast(caught ? 'He got ' + caught + (caught === 1 ? ' bubble.' : ' bubbles.') + ' Good boy.' : 'He missed every one. He never minded.');
        setTimeout(function () { stage.remove(); }, 300);
      }
      if (left && !list.length) { clearInterval(tick); layer.remove(); BUB = false; }
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
