import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase, ref, get, set, runTransaction, onValue, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

var GROUPS = ['M', 'Q', 'U', 'C', 'S', 'A'];
var GROUP_COLOR_VARS = ['--g-m', '--g-q', '--g-u', '--g-c', '--g-s', '--g-a'];
var GROUP_LABELS = ['M', 'Q', 'U', 'C', 'S', 'A'];
var DEVICE_KEY = 'mqcssa_welcome_device_id';
var EVENT_NAME = 'MQCSSA Welcome Party';

var root = document.getElementById('root');
var configured = firebaseConfig.apiKey && firebaseConfig.apiKey !== 'REPLACE_ME';
var app = null, db = null;
if (configured) {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
}

function codeFor(n) {
  var idx = (n - 1) % GROUPS.length;
  var group = GROUPS[idx];
  var num = String(n);
  while (num.length < 2) num = '0' + num;
  return { group: group, groupIndex: idx, code: group + num };
}

function getDeviceId() {
  try {
    var id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() :
        ('d-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch (e) {
    if (!window.__mem_device_id) {
      window.__mem_device_id = 'd-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }
    return window.__mem_device_id;
  }
}

function el(tag, className, html) {
  var e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function clearRoot() { root.innerHTML = ''; }

function renderLoading(message) {
  clearRoot();
  var wrap = el('div', 'wrap');
  wrap.appendChild(el('div', 'eyebrow', EVENT_NAME));
  wrap.appendChild(el('div', 'loading-mark'));
  wrap.appendChild(el('p', 'sub', message || 'Finding your seat…'));
  root.appendChild(wrap);
}

function renderTicket(reg, already, confirming) {
  clearRoot();
  var wrap = el('div', 'wrap');
  wrap.appendChild(el('div', 'eyebrow', EVENT_NAME));

  var ticket = el('div', 'ticket');
  ticket.style.setProperty('--group-color', 'var(' + GROUP_COLOR_VARS[reg.groupIndex] + ')');
  ticket.appendChild(el('div', 'stripe'));
  ticket.appendChild(el('div', 'ticket-label', "You're checked in"));
  ticket.appendChild(el('div', 'ticket-code', reg.code));
  ticket.appendChild(el('div', 'ticket-group', 'Group ' + reg.group));
  ticket.appendChild(el('hr', 'divider'));

  var badge = el('div', 'badge');
  var dot = el('span', 'dot' + (confirming ? ' pulse' : ''));
  badge.appendChild(dot);
  badge.appendChild(document.createTextNode(
    confirming ? 'Saving your spot…' : ('Guest No. ' + String(reg.number))
  ));
  ticket.appendChild(badge);

  ticket.appendChild(el('div', 'ticket-foot',
    already
      ? "This is your number for today — it won't change if you scan again."
      : 'Screenshot this or keep the page open.'
  ));
  wrap.appendChild(ticket);
  wrap.appendChild(el('p', 'footnote', 'Show this screen at the welcome desk if asked.'));
  root.appendChild(wrap);
}

function renderUnavailable(reason) {
  clearRoot();
  var wrap = el('div', 'wrap');
  wrap.appendChild(el('div', 'eyebrow', EVENT_NAME));
  wrap.appendChild(el('div', 'unavailable-mark', '!'));
  wrap.appendChild(el('h1', 'headline', "Couldn't check you in"));
  wrap.appendChild(el('p', 'sub', reason));
  root.appendChild(wrap);
}

function renderDisplay() {
  clearRoot();
  var wrap = el('div', 'wrap');
  wrap.appendChild(el('div', 'eyebrow', EVENT_NAME));
  wrap.appendChild(el('h1', 'headline', 'Scan to check in'));

  var card = el('div', 'qr-card');
  var canvas = document.createElement('canvas');
  card.appendChild(canvas);
  wrap.appendChild(card);
  wrap.appendChild(el('p', 'qr-hint', 'You’ll get your group + number right away.'));
  root.appendChild(wrap);

  var target = location.origin + location.pathname;
  loadQrLib().then(function () {
    window.QRCode.toCanvas(canvas, target, { width: 260, margin: 1, color: { dark: '#241512', light: '#FBF5EC' } });
  });
}

var qrLibPromise = null;
function loadQrLib() {
  if (window.QRCode) return Promise.resolve();
  if (qrLibPromise) return qrLibPromise;
  qrLibPromise = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return qrLibPromise;
}

function renderAdmin() {
  clearRoot();
  var wrap = el('div', 'admin-wrap');
  var totalRow = el('div', 'admin-total');
  totalRow.appendChild(el('span', 'sub', 'Checked in'));
  var totalNum = el('span', 'num', '0');
  totalRow.appendChild(totalNum);
  wrap.appendChild(totalRow);

  var bars = el('div', 'bars');
  var fills = [], counts_el = [];
  GROUPS.forEach(function (g, idx) {
    var row = el('div', 'bar-row');
    row.style.setProperty('--bar-color', 'var(' + GROUP_COLOR_VARS[idx] + ')');
    row.appendChild(el('span', 'bar-letter', GROUP_LABELS[idx]));
    var track = el('div', 'bar-track');
    var fill = el('div', 'bar-fill');
    fill.style.width = '0%';
    track.appendChild(fill);
    row.appendChild(track);
    var countEl = el('span', 'bar-count', '0');
    row.appendChild(countEl);
    bars.appendChild(row);
    fills.push(fill);
    counts_el.push(countEl);
  });
  wrap.appendChild(bars);

  var actions = el('div', 'admin-actions');
  var qrBtn = el('button', 'link-btn', 'Open display view');
  qrBtn.addEventListener('click', function () {
    window.open(location.origin + location.pathname + '?display', '_blank');
  });
  var resetBtn = el('button', 'reset-btn', 'Reset event');
  resetBtn.addEventListener('click', function () {
    if (window.confirm('Reset check-in numbers to zero for everyone? This cannot be undone.')) {
      resetEvent();
    }
  });
  actions.appendChild(qrBtn);
  actions.appendChild(resetBtn);
  wrap.appendChild(actions);
  wrap.appendChild(el('div', 'admin-note',
    'Organizer view — anyone with this link and ?admin can see and reset counts.'));
  root.appendChild(wrap);

  if (!configured) {
    renderUnavailable('Firebase isn’t configured yet — fill in firebase-config.js.');
    return;
  }

  onValue(ref(db, 'registrations'), function (snap) {
    var counts = [0, 0, 0, 0, 0, 0];
    var total = 0;
    snap.forEach(function (child) {
      var r = child.val();
      if (r && typeof r.groupIndex === 'number') counts[r.groupIndex]++;
      total++;
    });
    var max = 1;
    counts.forEach(function (c) { if (c > max) max = c; });
    totalNum.textContent = String(total);
    counts.forEach(function (c, idx) {
      fills[idx].style.width = Math.round((c / max) * 100) + '%';
      counts_el[idx].textContent = String(c);
    });
  });
}

function resetEvent() {
  if (!configured) return;
  Promise.all([
    set(ref(db, 'registrations'), null),
    set(ref(db, 'counter'), 1)
  ]).then(function () {
    location.reload();
  }).catch(function () {
    window.alert('Could not reset — please try again.');
  });
}

function attemptRegister(deviceId, attempt) {
  runTransaction(ref(db, 'counter'), function (current) {
    return (current || 1) + 1;
  }).then(function (result) {
    var before = (result.snapshot.val() || 1) - 1;
    if (before < 1) before = 1;
    var assigned = codeFor(before);
    var reg = { number: before, code: assigned.code, group: assigned.group, groupIndex: assigned.groupIndex, ts: Date.now() };
    renderTicket(reg, false, true);
    return set(ref(db, 'registrations/' + deviceId), reg).then(function () {
      renderTicket(reg, false, false);
    });
  }).catch(function (err) {
    if (attempt < 4) {
      var delay = 500 * Math.pow(1.6, attempt) + Math.random() * 300;
      setTimeout(function () { attemptRegister(deviceId, attempt + 1); }, delay);
      return;
    }
    renderUnavailable("It's busy right now — please wait a moment and scan again, or ask event staff for your number.");
  });
}

function register(deviceId) {
  if (!configured) {
    renderUnavailable('Check-in isn’t set up yet — ask event staff for your group number.');
    return;
  }
  attemptRegister(deviceId, 0);
}

function init() {
  var params = new URLSearchParams(location.search);
  if (params.has('display')) { renderDisplay(); return; }
  if (params.has('admin')) { renderAdmin(); return; }

  if (!configured) {
    renderUnavailable('Check-in isn’t set up yet — ask event staff for your group number.');
    return;
  }

  var deviceId = getDeviceId();
  renderLoading();
  get(ref(db, 'registrations/' + deviceId)).then(function (snap) {
    if (snap.exists()) {
      renderTicket(snap.val(), true, false);
    } else {
      setTimeout(function () { register(deviceId); }, 500);
    }
  }).catch(function () {
    renderUnavailable('Could not reach check-in right now — please try again in a moment.');
  });
}

init();
