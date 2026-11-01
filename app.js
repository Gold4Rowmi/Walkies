(function () {
  'use strict';

  var CFG = window.WALKIES_CONFIG || {};
  var app = document.getElementById('app');
  var JOIN_KEY = 'walkies_join';

  // ---------- Trip shape (this build: Japan then Vietnam) ----------
  var STOP_ORDER = ['Tokyo', 'Kyoto', 'Kawaguchiko', 'Hoi An', 'Ha Long'];
  var STOPS = {
    'Tokyo': { from: 1, to: 4, tz: 'JST' },
    'Kyoto': { from: 5, to: 7, tz: 'JST' },
    'Kawaguchiko': { from: 8, to: 9, tz: 'JST' },
    'Hoi An': { from: 10, to: 14, tz: 'ICT' },
    'Ha Long': { from: 15, to: 18, tz: 'ICT' }
  };
  var NDAYS = 18;
  function stopFor(n) {
    for (var i = 0; i < STOP_ORDER.length; i++) {
      var s = STOP_ORDER[i];
      if (n >= STOPS[s].from && n <= STOPS[s].to) return s;
    }
    return 'Tokyo';
  }
  function dayLabel(n) { return 'Day ' + n + ' · ' + (11 + n) + ' Apr'; }

  var LINK_RE = /^https?:\/\/(www\.)?(google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|instagram\.com|tiktok\.com|jal\.co\.jp|ana\.co\.jp|vietjetair\.com|vietnamairlines\.com)\b/i;
  function validLink(u) { return LINK_RE.test(u || ''); }
  function srcName(u) {
    return /instagram/i.test(u) ? 'Instagram' : /tiktok/i.test(u) ? 'TikTok' : /maps|goo\.gl/i.test(u) ? 'Google Maps' : 'Booking page';
  }

  // ---------- Pixel art: Rommel and the scenes ----------
  var DOG = ['..##..##..', '##########', '###t##t###', '##########', '#.#e##e#.#', '..t####t..', '..#tttt#..', '...t##t...', '....##....', '..........'];
  var DOG_C = { '#': '#16181D', t: '#D9893B', e: '#F4F5F7' };
  function dogSVG(size) {
    var out = '';
    DOG.forEach(function (row, y) {
      for (var x = 0; x < 10; x++) {
        if (row[x] !== '.') out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + DOG_C[row[x]] + '"/>';
      }
    });
    return '<svg viewBox="0 0 10 10" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" aria-hidden="true">' + out + '</svg>';
  }

  var PAL = { s: '#D7E6F5', g: '#8FB069', d: '#3E4A59', t: '#D9893B', w: '#6FA8DC', r: '#E0533F', l: '#4E9A5B', m: '#5B6B7F', c: '#F4F5F7' };
  var SC = {
    temple: ['ssssssssssssssss','ssssssssssssssss','sssssccsssssssss','ssssddddddsssssss','ssssdccccdssssss','sssdddddddddsssss','ssssddcddcdsssssss','sssssddddssssssss','gggggggggggggggg','gggggggggggggggg'],
    torii: ['ssssssssssssssss','ssssrrrrrrrssssss','ssssrrrrrrrssssss','ssssrrrrrrrssssss','sssrrssssrrssssss','sssrrssssrrssssss','sssrrssssrrssssss','ssssssssssssssss','gggggggggggggggg','gggggggggggggggg'],
    bowl: ['ssssssssssssssss','ssssssssssssssss','ssssssssssssssss','ssssssssssssssss','sssssssttttssssss','ssssssdddddsssssss','ssssddttttttddssss','ssssddtttttttddsss','ssssssdddddssssss','gggggggggggggggg'],
    beach: ['ssssssssssssssss','ssssssssssssssss','ssssssssssssssss','ssssssssssssssss','wwwwwwwwwwwwwwww','wwwwwwwwwwwwwwww','tttttttttttttttt','tttttttttttttttt','tttttttttttttttt','tttttttttttttttt'],
    fuji: ['ssssssssssssssss','ssssssssccssssss','ssssssccccssssss','sssssccccccssssss','ssssmmccccmmsssss','sssmmmmmmmmmmssss','ssmmmmmmmmmmmmsss','mmmmmmmmmmmmmmmss','wwwwwwwwwwwwwwwww','wwwwwwwwwwwwwwww'],
    walk: ['ssssssssssssssss','ssssssssssssssss','ssssllllsssssssss','sssllllllllsssss','ssssrrrrrrrssssss','sssrrrrrrrrrrssss','ssssrrrrrrrssssss','sssrrrrrrrrrrssss','gggggggggggggggg','gggggggggggggggg'],
    plane: ['ssssssssssssssss','ssssssssssssssss','ssssssssssssssss','wwwwwwwwwwwwwwww','sssssssssssssssss','ssssssssssssssss','ssssssssssssssss','ssssssssssssssss','gggggggggggggggg','gggggggggggggggg']
  };
  function sceneSVG(k) {
    var g = SC[k] || SC.walk, out = '';
    g.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + PAL[row[x]] + '"/>';
    });
    return '<svg viewBox="0 0 16 10" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + out + '</svg>';
  }
  function sceneFor(kind) { return kind === 'travel' ? 'plane' : 'walk'; }

  // ---------- Helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hhmm(t) { return t ? String(t).slice(0, 5) : ''; }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function setErr(id, msg) { var el = document.getElementById(id); if (el) el.textContent = msg; else S.msg = msg; }
  function check(r) { if (r.error) throw r.error; return r.data; }
  function dayOpts(sel) {
    var o = '<option value="0"' + (sel == 0 ? ' selected' : '') + '>Unscheduled</option>';
    for (var n = 1; n <= NDAYS; n++) {
      o += '<option value="' + n + '"' + (sel == n ? ' selected' : '') + '>' + dayLabel(n) + ' (' + stopFor(n) + ')</option>';
    }
    return o;
  }
  function bars(n) {
    var s = '<span class="bar">';
    for (var k = 0; k < 10; k++) s += '<i class="' + (k < n ? 'on' : '') + '"></i>';
    return s + '</span>';
  }
  function displayName() {
    var m = S.user && S.user.user_metadata || {};
    return m.full_name || m.name || ((S.user && S.user.email) || 'Someone').split('@')[0];
  }

  // ---------- State ----------
  var sb = null;
  var S = {
    user: null, trips: [], tripId: null, data: null,
    tab: 'ideas', day: 0, sheet: null,
    adminShown: false, taps: [], msg: '', notice: ''
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
    try {
      await loadTrip(S.tripId);
    } catch (e) {
      S.tripId = null; S.data = null; S.sheet = null;
      S.notice = 'That trip is gone, or you are no longer in it.';
      try { await loadTrips(); } catch (e2) {}
    }
    render();
  }

  async function openTrip(id) {
    S.tripId = id; S.data = null; S.sheet = null; S.tab = 'ideas'; S.day = 0; S.adminShown = false; S.notice = '';
    await refresh();
  }

  function backToTrips() {
    S.tripId = null; S.data = null; S.sheet = null; S.msg = '';
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

  // ---------- Renders ----------
  function toastHTML() { return S.msg ? '<div class="toast" role="status">' + esc(S.msg) + '</div>' : ''; }

  function render() {
    if (!S.user) return renderSignIn();
    if (!S.tripId || !S.data) return renderTrips();
    renderTrip();
  }

  function renderSetup() {
    app.innerHTML = '<div class="screen"><header class="top"><span class="px brand">Walkies</span></header>'
      + '<section class="stack"><h2 class="px">Connect the backend first</h2>'
      + '<p>Open <code>config.js</code> and paste your Supabase URL and anon key. The README has the steps.</p></section></div>';
  }

  function renderSignIn() {
    app.innerHTML = '<div class="screen center">'
      + '<div class="brand-big">' + dogSVG(72) + '<span class="px big">Walkies</span></div>'
      + '<p class="muted">Family trip planning. Family only.</p>'
      + (sessionStorage.getItem(JOIN_KEY) ? '<p class="muted">Sign in to ask to join the trip.</p>' : '')
      + '<button class="btn primary" data-act="signin">Sign in with Google</button>'
      + (S.notice ? '<p class="err">' + esc(S.notice) + '</p>' : '')
      + '</div>';
  }

  function renderTrips() {
    var list = S.trips.map(function (t) {
      return '<button class="trip-row" data-act="open-trip" data-id="' + esc(t.id) + '">'
        + '<span class="px">' + esc(t.name) + '</span>'
        + '<small>' + (t.owner_id === S.user.id ? 'You own this' : 'Family trip') + '</small></button>';
    }).join('') || '<p class="muted">No trips yet.</p>';
    app.innerHTML = '<div class="screen">'
      + '<header class="top"><span class="px brand">Walkies</span><span class="grow"></span>'
      + '<button class="btn small" data-act="signout">Sign out</button></header>'
      + (S.notice ? '<p class="notice">' + esc(S.notice) + '</p>' : '')
      + toastHTML()
      + '<section class="stack"><h2 class="px">Your trips</h2>' + list + '</section>'
      + '<section class="stack"><h3>New trip</h3>'
      + '<input id="newTripName" placeholder="Name the trip" aria-label="Trip name">'
      + '<button class="btn primary" data-act="new-trip">Create trip</button>'
      + '<p class="err" id="tripErr"></p></section>'
      + '</div>';
    S.msg = ''; S.notice = '';
  }

  function renderTrip() {
    var tabs = [['ideas', 'Ideas'], ['days', 'Days'], ['archive', 'Archive']].map(function (x) {
      return '<button class="' + (S.tab === x[0] ? 'on' : '') + '" data-act="tab" data-tab="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    var body = S.tab === 'days' ? daysHTML() : S.tab === 'archive' ? archiveHTML() : ideasHTML();
    app.innerHTML = '<div class="screen">'
      + '<header class="top">'
      +   '<button class="dog" data-act="secret" aria-label="Rommel">' + dogSVG(34) + '</button>'
      +   '<div class="titles"><span class="px brand">Walkies</span><small>' + esc(S.data.trip.name) + '</small></div>'
      +   '<span class="grow"></span>'
      +   '<button class="btn small" data-act="back">Trips</button>'
      +   '<button class="btn small primary" data-act="add-open">+ Add</button>'
      +   '<button class="btn small" data-act="trip-open">Trip</button>'
      + '</header>'
      + (isSecretAdmin() ? '<div class="adminbar">Admin tools on</div>' : '')
      + toastHTML()
      + '<nav class="tabs">' + tabs + '</nav>'
      + '<div class="body">' + body + '</div>'
      + (S.sheet ? sheetHTML() : '')
      + '</div>';
    S.msg = '';
  }

  // Ideas: the pool, grouped by stop
  function ideaCard(d) {
    var v = votesFor(d.id).length;
    var meta = 'by ' + nameOf(d.created_by) + ' · ' + (d.day ? 'maybe ' + dayLabel(d.day) : 'any day') + ' · ' + v + ' vote' + (v === 1 ? '' : 's');
    return '<button class="card" data-act="open-idea" data-id="' + esc(d.id) + '">'
      + '<span class="sc">' + sceneSVG(d.scene) + '</span>'
      + '<span class="inf"><span class="ttl">' + esc(d.title) + '</span>'
      + '<span class="meta">' + esc(meta) + '</span>' + bars(v) + '</span></button>';
  }
  function ideasHTML() {
    var pool = S.data.ideas.filter(function (d) { return d.status === 'suggested'; });
    if (!pool.length) return '<p class="empty">Nothing in the pool. Tap + Add to suggest an idea.</p>';
    return STOP_ORDER.map(function (s) {
      var items = pool.filter(function (d) { return d.stop === s; });
      if (!items.length) return '';
      return '<h3 class="stopname">' + esc(s) + '</h3>' + items.map(ideaCard).join('');
    }).join('');
  }

  function archiveHTML() {
    var list = S.data.ideas.filter(function (d) { return d.status === 'removed'; });
    if (!list.length) return '<p class="empty">Nothing archived. Removed items land here and stay until the trip ends.</p>';
    return list.map(function (d) {
      return '<div class="card static"><span class="sc">' + sceneSVG(d.scene) + '</span>'
        + '<span class="inf"><span class="ttl">' + esc(d.title) + '</span>'
        + '<span class="meta">removed · ' + esc(d.stop) + (d.archive_reason ? ' · ' + esc(d.archive_reason) : '') + '</span>'
        + '<button class="btn small" data-act="restore" data-id="' + esc(d.id) + '">Restore</button></span></div>';
    }).join('');
  }

  function dayChip(n) {
    var planned = S.data.ideas.filter(function (d) { return d.status === 'approved' && d.day === n; }).length;
    var slots = S.data.ideas.filter(function (d) { return d.status === 'suggested' && d.day === n; }).length;
    var small = n === 0 ? planned + ' waiting' : planned ? planned + ' planned' : slots ? slots + ' slot' : stopFor(n);
    return '<button class="chip' + (S.day === n ? ' on' : '') + '" data-act="day" data-id="' + n + '">'
      + '<span>' + (n || 'Open') + '</span><small>' + esc(small) + '</small></button>';
  }

  function plannedCard(d) {
    var tags = (d.start_time ? '<span class="tag ok">' + hhmm(d.start_time) + '</span>' : '<span class="tag">no time</span>')
      + (d.booked ? ' <span class="tag booked">Booked' + (d.booking_ref ? ' · ' + esc(d.booking_ref) : '') + '</span>' : '')
      + (d.kind === 'travel' ? ' <span class="tag">Travel</span>' : '');
    return '<button class="card' + (d.kind === 'travel' ? ' travel' : '') + '" data-act="open-idea" data-id="' + esc(d.id) + '">'
      + '<span class="sc">' + sceneSVG(d.scene) + '</span>'
      + '<span class="inf"><span class="ttl">' + esc(d.title) + '</span>'
      + '<span class="meta">' + esc(nameOf(d.created_by)) + ' · ' + esc(d.stop) + ' · ' + STOPS[d.stop].tz + '</span>'
      + tags + '</span></button>';
  }

  function slotCard(d) {
    var v = votesFor(d.id).length;
    return '<div class="card slot"><span class="sc">' + sceneSVG(d.scene) + '</span>'
      + '<span class="inf"><span class="ttl">' + esc(d.title) + '</span>'
      + '<span class="meta">Suggested by ' + esc(nameOf(d.created_by)) + ' · ' + v + ' votes</span>'
      + '<span class="row"><span class="tag slot">Slot suggested</span>'
      + '<button class="btn small" data-act="take" data-id="' + esc(d.id) + '" data-day="' + d.day + '" data-dur="' + (d.duration_min || 60) + '">Take slot</button></span>'
      + '</span></div>';
  }

  function nearbyHTML(stop) {
    var hiddenTitles = S.data.hidden.filter(function (h) { return h.stop === stop; }).map(function (h) { return h.title; });
    var list = S.data.nearby.filter(function (n) { return n.stop === stop && hiddenTitles.indexOf(n.title) < 0; });
    if (!list.length) return '';
    return '<div class="sugg"><p class="meta">Nearby in ' + esc(stop) + ' · AI suggestions, check before you go</p>'
      + list.map(function (n) {
        return '<div class="nearby"><span class="inf">' + esc(n.title) + ' <span class="meta">· ' + esc(n.kind) + '</span></span>'
          + '<span class="row">'
          + '<button class="btn small" data-act="sugg-add" data-title="' + esc(n.title) + '" data-stop="' + esc(n.stop) + '" data-scene="' + esc(n.scene) + '">Suggest this</button>'
          + '<button class="btn small" data-act="sugg-hide" data-title="' + esc(n.title) + '" data-stop="' + esc(n.stop) + '">Not for us</button>'
          + '</span></div>';
      }).join('') + '</div>';
  }

  function daysHTML() {
    var n = S.day;
    var chips = '<div class="daybar">' + dayChip(0);
    for (var k = 1; k <= NDAYS; k++) chips += dayChip(k);
    chips += '</div>';
    var head = n === 0
      ? '<h2 class="dayhead">Unscheduled</h2>'
      : '<h2 class="dayhead">' + dayLabel(n) + '<small>' + esc(stopFor(n)) + ' · ' + STOPS[stopFor(n)].tz + ' local time</small></h2>';
    var pre = n > 0 && isOwner() ? '<button class="btn small" data-act="preset-open">Pre-set a slot</button>' : '';
    var planned = S.data.ideas
      .filter(function (d) { return d.status === 'approved' && d.day === n; })
      .sort(function (a, b) { return (hhmm(a.start_time) || '99:99').localeCompare(hhmm(b.start_time) || '99:99'); });
    var slots = S.data.ideas.filter(function (d) { return d.status === 'suggested' && d.day === n; });
    var items = planned.map(plannedCard).join('') + slots.map(slotCard).join('');
    if (!items) items = '<p class="empty">' + (n === 0 ? 'Nothing waiting for a day.' : 'Nothing planned yet. Plan an idea onto this day.') + '</p>';
    return chips + head + pre + items + (n > 0 ? nearbyHTML(stopFor(n)) : '');
  }

  // ---------- Sheets ----------
  function sheetHTML() {
    var s = S.sheet;
    var inner = s.kind === 'idea' ? ideaSheet(ideaById(s.id)) : s.kind === 'add' ? addSheet(s.pre, s.day) : tripSheet();
    return '<div class="sheet-wrap"><div class="sheet" role="dialog" aria-modal="true">'
      + '<div class="sheet-top"><span class="grab"></span><button class="btn small" data-act="close-sheet">Close</button></div>'
      + '<div class="sbody">' + inner + '</div></div></div>';
  }

  function ideaSheet(d) {
    if (!d) return '<p class="err">That idea is gone.</p>';
    var mine = d.created_by === S.user.id, manage = canManage();
    var v = votesFor(d.id).length, voted = iVoted(d.id);
    var statusText = d.status === 'approved'
      ? (d.day ? 'Planned on ' + dayLabel(d.day) + (d.start_time ? ' at ' + hhmm(d.start_time) : '') : 'Planned, no day yet')
      : d.status === 'removed' ? 'In the archive' + (d.archive_reason ? ' · ' + esc(d.archive_reason) : '') : 'In the pool';
    var h = '<div class="hero">' + sceneSVG(d.scene) + '</div>'
      + '<h2 class="ttl big">' + esc(d.title) + '</h2>'
      + '<p class="meta">' + esc(d.stop) + ' · ' + STOPS[d.stop].tz + ' · by ' + esc(nameOf(d.created_by)) + '</p>'
      + '<p class="meta">' + statusText + '</p>'
      + (d.note ? '<div class="note">' + esc(d.note) + '</div>' : '')
      + (d.link ? '<a class="src" href="' + esc(d.link) + '" target="_blank" rel="noopener">Open ' + esc(srcName(d.link)) + ' ↗</a>' : '');

    if (d.status === 'removed') {
      h += '<div class="row"><button class="btn primary" data-act="restore" data-id="' + esc(d.id) + '">Restore</button></div>';
    } else {
      h += '<div class="row"><button class="btn' + (voted ? ' primary' : '') + '" data-act="vote" data-id="' + esc(d.id) + '">'
        + (voted ? 'Voted' : 'Vote') + ' · ' + v + '</button></div>';
      h += '<div class="plan">'
        + '<label class="lbl">Day<select id="dSel">' + dayOpts(d.day) + '</select></label>'
        + '<label class="lbl">Time<input id="tIn" type="time" value="' + hhmm(d.start_time) + '"></label>'
        + '<label class="lbl">Min<input id="mIn" type="number" min="15" step="15" value="' + (d.duration_min || 60) + '"></label></div>';
      h += '<div class="row"><button class="btn primary" data-act="plan" data-id="' + esc(d.id) + '">' + (d.status === 'approved' ? 'Save' : 'Plan it') + '</button></div>';
      if (d.status === 'approved') {
        h += d.booked
          ? '<div class="row"><span class="tag booked">Booked' + (d.booking_ref ? ' · ' + esc(d.booking_ref) : '') + '</span></div>'
            + '<div class="row"><input id="cancelReason" placeholder="Why cancelled (required)">'
            + '<button class="btn small" data-act="unbook" data-id="' + esc(d.id) + '">Booking cancelled</button></div>'
          : '<div class="row"><input id="bookRef" placeholder="Booking ref (optional)">'
            + '<button class="btn small" data-act="book" data-id="' + esc(d.id) + '">Mark booked</button></div>';
      }
    }
    h += '<p class="err" id="sErr"></p>';

    if (d.status !== 'removed' && (mine || manage)) {
      h += '<div class="sugg"><p class="meta">' + (mine ? 'Remove' : 'Admin remove') + ' · needs a reason, shown in the log</p>'
        + '<input id="rIn" placeholder="Reason">'
        + (d.booked ? '<label class="meta"><input type="checkbox" id="cancelChk"> The real booking is cancelled</label>' : '')
        + '<div class="row"><button class="btn danger small" data-act="remove" data-id="' + esc(d.id) + '">' + (mine ? 'Remove' : 'Remove (admin)') + '</button></div></div>';
    }

    var cs = commentsFor(d.id);
    h += '<div class="comments"><p class="meta">Comments</p>'
      + (cs.length ? cs.map(function (c) { return '<div class="cm"><b>' + esc(nameOf(c.user_id)) + '</b> ' + esc(c.body) + '</div>'; }).join('') : '<p class="meta">No comments yet.</p>')
      + '<div class="row"><input id="cIn" placeholder="Add a comment"><button class="btn small" data-act="comment" data-id="' + esc(d.id) + '">Post</button></div></div>';
    return h;
  }

  function addSheet(pre, day) {
    var stopDefault = stopFor(day || 1);
    return '<h2 class="ttl big">' + (pre ? 'Pre-set a slot' : 'Add to the trip') + '</h2>'
      + '<label class="lbl">Link<input id="fLink" placeholder="Google Maps, Instagram, TikTok or airline link"></label>'
      + '<label class="lbl">Title<input id="fTitle" placeholder="Name it"></label>'
      + '<label class="lbl">Type<select id="fKind"><option value="idea">Idea</option><option value="travel">Travel (flight or transfer)</option></select></label>'
      + '<label class="lbl">Stop<select id="fStop">' + STOP_ORDER.map(function (s) {
          return '<option' + (s === stopDefault ? ' selected' : '') + '>' + esc(s) + '</option>';
        }).join('') + '</select></label>'
      + '<label class="lbl">' + (pre ? 'Day' : 'Maybe day') + '<select id="fDay">' + dayOpts(day || 0) + '</select></label>'
      + (pre ? '<div class="row"><label class="lbl">Time<input id="fTime" type="time"></label>'
        + '<label class="lbl">Min<input id="fDur" type="number" min="15" step="15" value="60"></label></div>' : '')
      + '<label class="lbl">Booking ref<input id="fRef" placeholder="Optional"></label>'
      + '<label class="lbl">Note<textarea id="fNote" rows="2" placeholder="Why, or flight details"></textarea></label>'
      + '<p class="err" id="fErr"></p>'
      + '<div class="row"><button class="btn primary" data-act="add-submit" data-pre="' + (pre ? '1' : '0') + '">' + (pre ? 'Plan it' : 'Add') + '</button></div>';
  }

  function tripSheet() {
    var m = myMember(), owner = isOwner(), manage = canManage(), admin = isSecretAdmin();
    var active = S.data.members.filter(isActive).length;
    var h = '<h2 class="ttl big">' + esc(S.data.trip.name) + '</h2>'
      + '<p class="meta">' + active + ' people · one invite link · owner approves joins</p>'
      + '<div class="note">' + S.data.members.map(function (x) {
          return esc(x.display_name) + (x.user_id === S.data.trip.owner_id ? ' (owner)' : '') + (isActive(x) ? '' : ' (former)');
        }).join(' · ') + '</div>';

    if (manage) {
      var link = location.origin + location.pathname + '?join=' + S.data.trip.invite_token;
      h += '<p class="meta">Invite link (one link, permanent)</p><div class="note code">' + esc(link) + '</div>'
        + '<div class="row"><button class="btn small" data-act="copy-invite" data-link="' + esc(link) + '">Copy link</button></div>'
        + '<p class="meta">Join queue</p>';
      if (!S.data.requests.length) h += '<p class="meta">Nobody waiting.</p>';
      S.data.requests.forEach(function (r) {
        h += '<div class="row"><span class="inf">' + esc(r.display_name) + '</span>'
          + '<button class="btn small primary" data-act="join-decide" data-id="' + esc(r.id) + '" data-approve="1">Approve</button>'
          + '<button class="btn small" data-act="join-decide" data-id="' + esc(r.id) + '" data-approve="0">Decline</button></div>';
      });
    }

    if (admin) {
      h += '<div class="sugg"><p class="meta">Admin · kick a member (needs a reason)</p>';
      S.data.members.filter(function (x) {
        return isActive(x) && x.user_id !== S.data.trip.owner_id && x.user_id !== S.user.id;
      }).forEach(function (x) {
        h += '<div class="row"><span class="inf">' + esc(x.display_name) + '</span>'
          + '<button class="btn small danger" data-act="kick" data-id="' + esc(x.user_id) + '">Kick</button></div>';
      });
      h += '<input id="kickReason" placeholder="Reason"></div>';
    }

    if (owner) h += '<div class="row"><button class="btn danger" data-act="delete-trip">Delete trip</button></div>';
    else if (m && isActive(m)) h += '<div class="row"><button class="btn" data-act="leave">Leave trip</button></div>';

    h += '<p class="meta">Activity</p>'
      + (S.data.activity.length ? S.data.activity.slice(0, 12).map(function (a) { return '<div class="log">' + esc(a.msg) + '</div>'; }).join('') : '<div class="log">Nothing yet.</div>');
    h += '<p class="err" id="tErr"></p>';
    return h;
  }

  // ---------- Actions ----------
  var handlers = {};

  handlers.signin = async function () {
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname }
    });
  };

  handlers.signout = async function () {
    await sb.auth.signOut();
  };

  handlers['new-trip'] = async function () {
    var name = val('newTripName');
    if (!name) return setErr('tripErr', 'Name the trip first.');
    var id = check(await sb.rpc('create_trip', { p_name: name, p_display: displayName() }));
    await openTrip(id);
  };

  handlers['open-trip'] = function (el) { return openTrip(el.dataset.id); };
  handlers.back = function () { backToTrips(); };
  handlers.tab = function (el) { S.tab = el.dataset.tab; S.sheet = null; render(); };
  handlers.day = function (el) { S.day = Number(el.dataset.id); render(); };
  handlers['open-idea'] = function (el) { S.sheet = { kind: 'idea', id: el.dataset.id }; render(); };
  handlers['close-sheet'] = function () { S.sheet = null; render(); };
  handlers['add-open'] = function () { S.sheet = { kind: 'add', pre: false, day: 0 }; render(); };
  handlers['preset-open'] = function () { S.sheet = { kind: 'add', pre: true, day: S.day }; render(); };
  handlers['trip-open'] = function () { S.sheet = { kind: 'trip' }; render(); };

  handlers['add-submit'] = async function (el) {
    var pre = el.dataset.pre === '1';
    var link = val('fLink'), title = val('fTitle'), note = val('fNote'), kind = val('fKind') || 'idea';
    if (!link) return setErr('fErr', 'Paste a link first.');
    if (!validLink(link)) return setErr('fErr', 'We can’t read that link. Use a Google Maps, Instagram, TikTok or airline link.');
    if (!title) return setErr('fErr', 'Give it a title.');
    var day = Number(val('fDay')) || 0;
    if (pre && day < 1) return setErr('fErr', 'Pick a day for the slot.');
    var r = check(await sb.rpc('add_idea', {
      p_trip: S.tripId, p_kind: kind, p_title: title, p_stop: val('fStop'), p_link: link,
      p_note: note, p_scene: sceneFor(kind), p_day: day,
      p_time: pre ? (val('fTime') || null) : null,
      p_dur: pre ? (Number(val('fDur')) || 60) : 60,
      p_ref: val('fRef'), p_preset: pre
    }));
    S.sheet = null;
    if (pre) { S.tab = 'days'; S.day = day; }
    else S.tab = 'ideas';
    S.msg = r && r.merged ? 'Already in the pool. Added your vote and note.'
      : pre ? 'Slot planned. Everyone can see it.'
      : 'Added. Anyone can vote, plan it or comment.';
    await refresh();
  };

  handlers.vote = async function (el) {
    var id = el.dataset.id;
    if (iVoted(id)) check(await sb.from('votes').delete().eq('idea_id', id).eq('user_id', S.user.id));
    else check(await sb.from('votes').insert({ idea_id: id, user_id: S.user.id }));
    await refresh();
  };

  handlers.plan = async function (el) {
    var day = Number(val('dSel')) || 0, time = val('tIn') || null, dur = Number(val('mIn')) || 60;
    var r = await sb.rpc('place_idea', { p_idea: el.dataset.id, p_day: day, p_time: time, p_dur: dur });
    if (r.error) return setErr('sErr', r.error.message);
    var warn = r.data && r.data.warn;
    S.msg = warn || (day ? 'Saved to ' + dayLabel(day) + '.' : 'Saved, unscheduled.');
    if (day) S.day = day;
    S.sheet = null;
    await refresh();
  };

  handlers['take'] = async function (el) {
    var r = await sb.rpc('place_idea', { p_idea: el.dataset.id, p_day: Number(el.dataset.day), p_time: null, p_dur: Number(el.dataset.dur) || 60 });
    if (r.error) { S.msg = r.error.message; return render(); }
    S.msg = 'Taken. It is on the plan now.';
    await refresh();
  };

  handlers.book = async function (el) {
    var r = await sb.rpc('set_booking', { p_idea: el.dataset.id, p_booked: true, p_ref: val('bookRef'), p_reason: '' });
    if (r.error) return setErr('sErr', r.error.message);
    S.msg = 'Marked booked. It is locked in until the booking is cancelled.';
    await refresh();
  };

  handlers.unbook = async function (el) {
    var r = await sb.rpc('set_booking', { p_idea: el.dataset.id, p_booked: false, p_ref: '', p_reason: val('cancelReason') });
    if (r.error) return setErr('sErr', r.error.message);
    S.msg = 'Booking cancelled. You can move it now.';
    await refresh();
  };

  handlers.remove = async function (el) {
    var chk = document.getElementById('cancelChk');
    var r = await sb.rpc('remove_idea', {
      p_idea: el.dataset.id, p_reason: val('rIn'), p_cancel_confirmed: !!(chk && chk.checked)
    });
    if (r.error) return setErr('sErr', r.error.message);
    S.sheet = null;
    S.msg = 'Moved to the archive. Restore it any time.';
    await refresh();
  };

  handlers.restore = async function (el) {
    var r = await sb.rpc('restore_idea', { p_idea: el.dataset.id });
    S.msg = r.error ? r.error.message : (r.data || 'Restored.');
    S.sheet = null;
    await refresh();
  };

  handlers.comment = async function (el) {
    var body = val('cIn');
    if (!body) return setErr('sErr', 'Write something first.');
    var r = await sb.from('comments').insert({ idea_id: el.dataset.id, user_id: S.user.id, body: body });
    if (r.error) return setErr('sErr', r.error.message);
    await refresh();
  };

  handlers['sugg-add'] = async function (el) {
    var r = await sb.rpc('add_idea', {
      p_trip: S.tripId, p_kind: 'idea', p_title: el.dataset.title, p_stop: el.dataset.stop,
      p_link: '', p_note: 'Suggested from nearby ideas.', p_scene: el.dataset.scene || 'walk',
      p_day: S.day, p_time: null, p_dur: 60, p_ref: '', p_preset: false
    });
    if (r.error) { S.msg = r.error.message; return render(); }
    S.msg = 'Added to the pool' + (S.day ? ' for ' + dayLabel(S.day) : '') + '.';
    S.tab = 'ideas';
    await refresh();
  };

  handlers['sugg-hide'] = async function (el) {
    check(await sb.from('hidden_suggestions').insert({ trip_id: S.tripId, stop: el.dataset.stop, title: el.dataset.title }));
    S.msg = 'Hidden for everyone.';
    await refresh();
  };

  handlers['join-decide'] = async function (el) {
    var r = await sb.rpc('decide_join', { p_request: el.dataset.id, p_approve: el.dataset.approve === '1' });
    if (r.error) return setErr('tErr', r.error.message);
    await refresh();
  };

  handlers.kick = async function (el) {
    var reason = val('kickReason');
    if (!reason) return setErr('tErr', 'Give a reason before you kick someone.');
    var r = await sb.rpc('kick_member', { p_trip: S.tripId, p_user: el.dataset.id, p_reason: reason });
    if (r.error) return setErr('tErr', r.error.message);
    S.msg = 'Kicked. Their ideas stay, marked as former member.';
    await refresh();
  };

  handlers.leave = async function () {
    if (!window.confirm('Leave the trip? Your ideas stay, marked as former member.')) return;
    check(await sb.rpc('leave_trip', { p_trip: S.tripId }));
    backToTrips();
    S.notice = 'You left the trip.';
    render();
  };

  handlers['delete-trip'] = async function () {
    if (!window.confirm('Delete this trip for everyone? Nobody will see it any more.')) return;
    check(await sb.rpc('delete_trip', { p_trip: S.tripId }));
    backToTrips();
    S.notice = 'Trip deleted.';
    render();
  };

  handlers['copy-invite'] = async function (el) {
    try { await navigator.clipboard.writeText(el.dataset.link); S.msg = 'Link copied.'; }
    catch (e) { S.msg = 'Long-press the link to copy it.'; }
    render();
  };

  // Secret admin: five quick taps on Rommel. Server rules still decide what is allowed.
  handlers.secret = function () {
    if (!myMember() || !myMember().is_admin) return;
    var now = Date.now();
    S.taps = S.taps.filter(function (t) { return now - t < 1500; });
    S.taps.push(now);
    if (S.taps.length >= 5) {
      S.taps = [];
      S.adminShown = !S.adminShown;
      S.msg = S.adminShown ? 'Admin tools on.' : 'Admin tools off.';
      render();
    }
  };

  // ---------- Events ----------
  app.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var fn = handlers[el.dataset.act];
    if (!fn) return;
    S.msg = '';
    Promise.resolve().then(function () { return fn(el); }).catch(function (e) {
      S.msg = (e && e.message) || 'Something went wrong. Try again.';
      render();
    });
  });

  // Close the sheet on the dim background.
  app.addEventListener('click', function (ev) {
    if (ev.target.classList && ev.target.classList.contains('sheet-wrap')) { S.sheet = null; render(); }
  });

  // ---------- Boot ----------
  async function onSession(user) {
    if (S.user && user && S.user.id === user.id) return;
    S.user = user || null;
    if (!S.user) {
      S.trips = []; S.tripId = null; S.data = null;
      return renderSignIn();
    }
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

  function boot() {
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) return renderSetup();
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

    var params = new URLSearchParams(location.search);
    var join = params.get('join');
    if (join) {
      try { sessionStorage.setItem(JOIN_KEY, join); } catch (e) {}
      history.replaceState(null, '', location.pathname);
    }
    sb.auth.onAuthStateChange(function (_event, session) {
      onSession(session && session.user);
    });
  }

  boot();
})();
