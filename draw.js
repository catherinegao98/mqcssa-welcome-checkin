import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getDatabase, ref, get, set
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

var EVENT_NAME = 'MQCSSA Welcome Party';
var TIERS = [
  { key: 'third', label: 'Third Prize', count: 3, colorVar: '--tier-3' },
  { key: 'second', label: 'Second Prize', count: 2, colorVar: '--tier-2' },
  { key: 'first', label: 'First Prize', count: 1, colorVar: '--tier-1' }
];
var CONFETTI_VARS = ['--confetti-1', '--confetti-2', '--confetti-3', '--confetti-4'];
var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

var root = document.getElementById('root');
var configured = firebaseConfig.apiKey && firebaseConfig.apiKey !== 'REPLACE_ME';
var app = null, db = null;
if (configured) {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
}

// in-memory mirror of what's in the database, so we can render instantly
// without extra round trips after each write
var state = {
  poolSnapshot: null,   // { deviceId: {code, group, groupIndex} } once the draw has started
  peopleCount: 0,
  results: {}           // { third: [...], second: [...], first: [...] }
};

function el(tag, className, html) {
  var e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function clearRoot() { root.innerHTML = ''; }

function renderUnavailable(reason) {
  clearRoot();
  var wrap = el('div', 'wrap');
  wrap.appendChild(el('div', 'eyebrow', EVENT_NAME));
  wrap.appendChild(el('div', 'unavailable-mark', '!'));
  wrap.appendChild(el('h1', 'headline', "Draw isn't ready"));
  wrap.appendChild(el('p', 'sub', reason));
  root.appendChild(wrap);
}

function drawnDeviceIds(exceptTier) {
  var ids = {};
  TIERS.forEach(function (t) {
    if (t.key === exceptTier) return;
    (state.results[t.key] || []).forEach(function (w) { ids[w.deviceId] = true; });
  });
  return ids;
}

function tierIsUnlocked(index) {
  if (index === 0) return true;
  return !!state.results[TIERS[index - 1].key];
}

function launchConfetti() {
  if (reduceMotion) return;
  for (var i = 0; i < 60; i++) {
    var piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = 'var(' + CONFETTI_VARS[i % CONFETTI_VARS.length] + ')';
    piece.style.animationDuration = (2.2 + Math.random() * 1.4) + 's';
    piece.style.animationDelay = (Math.random() * 0.3) + 's';
    document.body.appendChild(piece);
    (function (p) {
      setTimeout(function () { p.remove(); }, 4200);
    })(piece);
  }
}

function renderAll() {
  clearRoot();
  var wrap = el('div', 'draw-wrap');
  wrap.appendChild(el('div', 'eyebrow', EVENT_NAME));
  wrap.appendChild(el('h1', 'headline', 'Lucky Draw'));

  if (!state.poolSnapshot) {
    wrap.appendChild(el('p', 'sub',
      state.peopleCount > 0
        ? (state.peopleCount + ' people are checked in and ready.')
        : 'No one has checked in yet — the pool is currently empty.'));
    var startBtn = el('button', 'draw-top-btn', 'Start the draw');
    startBtn.disabled = state.peopleCount < 1;
    startBtn.addEventListener('click', startDraw);
    wrap.appendChild(startBtn);
    root.appendChild(wrap);
    return;
  }

  wrap.appendChild(el('p', 'pool-note',
    Object.keys(state.poolSnapshot).length + ' people locked into tonight’s draw pool.'));

  TIERS.forEach(function (tier, idx) {
    var unlocked = tierIsUnlocked(idx);
    var results = state.results[tier.key];
    var tierEl = el('div', 'tier' + (unlocked ? '' : ' locked'));
    tierEl.style.setProperty('--tier-color', 'var(' + tier.colorVar + ')');
    tierEl.appendChild(el('div', 'tier-title', tier.label + ' · ' + tier.count + (tier.count === 1 ? ' winner' : ' winners')));

    var slotRow = el('div', 'slot-row');
    var count = tier.count;
    for (var i = 0; i < count; i++) {
      var winner = results ? results[i] : null;
      var slot = el('div', 'slot' + (winner ? '' : ' slot-placeholder'));
      slot.appendChild(el('div', 'slot-code', winner ? winner.code : '——'));
      slot.appendChild(el('div', 'slot-group', winner ? ('Group ' + winner.group) : (unlocked ? 'waiting' : 'locked')));
      slotRow.appendChild(slot);
    }
    tierEl.appendChild(slotRow);

    if (!results && unlocked) {
      var pool = poolForTier(tier.key);
      var drawBtn = el('button', 'draw-top-btn', 'Draw ' + tier.label);
      drawBtn.disabled = pool.length < tier.count;
      drawBtn.addEventListener('click', function (t) {
        return function () { runDraw(t); };
      }(tier));
      tierEl.appendChild(drawBtn);
      if (pool.length < tier.count) {
        tierEl.appendChild(el('div', 'tier-sub', 'Not enough people left in the pool for this tier.'));
      }
    } else if (!unlocked) {
      tierEl.appendChild(el('div', 'tier-sub', 'Unlocks after the previous prize is drawn.'));
    }

    wrap.appendChild(tierEl);
  });

  var actionsRow = el('div', 'admin-actions');
  var backBtn = el('button', 'draw-top-btn secondary', 'Back to dashboard');
  backBtn.addEventListener('click', function () {
    window.open('index.html?admin', '_blank');
  });
  var resetBtn = el('button', 'draw-top-btn secondary', 'Reset draw');
  resetBtn.addEventListener('click', function () {
    if (window.confirm('Clear the draw pool and all winners so far? This cannot be undone.')) {
      resetDraw();
    }
  });
  actionsRow.appendChild(backBtn);
  actionsRow.appendChild(resetBtn);
  wrap.appendChild(actionsRow);
  wrap.appendChild(el('div', 'admin-note',
    'This link isn’t password-protected — anyone with it can draw or reset. Keep it to event staff.'));

  root.appendChild(wrap);
}

function poolForTier(tierKey) {
  var excluded = drawnDeviceIds(tierKey);
  var pool = [];
  for (var deviceId in state.poolSnapshot) {
    if (!Object.prototype.hasOwnProperty.call(state.poolSnapshot, deviceId)) continue;
    if (excluded[deviceId]) continue;
    var p = state.poolSnapshot[deviceId];
    pool.push({ deviceId: deviceId, code: p.code, group: p.group, groupIndex: p.groupIndex });
  }
  return pool;
}

function pickRandom(pool, excludeIds) {
  var candidates = pool.filter(function (p) { return !excludeIds[p.deviceId]; });
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function cycleSlot(slotCodeEl, slotGroupEl, pool, excludeIds, durationMs) {
  var winner = pickRandom(pool, excludeIds);
  if (!winner) return Promise.resolve(null);
  if (reduceMotion) {
    slotCodeEl.textContent = winner.code;
    slotGroupEl.textContent = 'Group ' + winner.group;
    return Promise.resolve(winner);
  }
  var candidates = pool.filter(function (p) { return !excludeIds[p.deviceId]; });
  return new Promise(function (resolve) {
    var start = performance.now();
    function tick(now) {
      var elapsed = now - start;
      if (elapsed < durationMs) {
        var r = candidates[Math.floor(Math.random() * candidates.length)];
        slotCodeEl.textContent = r.code;
        slotGroupEl.textContent = 'Group ' + r.group;
        requestAnimationFrame(tick);
      } else {
        slotCodeEl.textContent = winner.code;
        slotGroupEl.textContent = 'Group ' + winner.group;
        resolve(winner);
      }
    }
    requestAnimationFrame(tick);
  });
}

function runDraw(tier) {
  var pool = poolForTier(tier.key);
  if (pool.length < tier.count) return;

  // find this tier's DOM row (last rendered "waiting" slots) to animate in place
  var tierBlocks = root.querySelectorAll('.tier');
  var tierIndex = TIERS.indexOf(tier);
  var tierEl = tierBlocks[tierIndex];
  var slotEls = tierEl.querySelectorAll('.slot');
  var btn = tierEl.querySelector('.draw-top-btn');
  if (btn) btn.disabled = true;

  var excludeIds = {};
  var winners = [];
  var chain = Promise.resolve();
  slotEls.forEach(function (slotEl) {
    var codeEl = slotEl.querySelector('.slot-code');
    var groupEl = slotEl.querySelector('.slot-group');
    chain = chain.then(function () {
      return cycleSlot(codeEl, groupEl, pool, excludeIds, 1300 + Math.random() * 400);
    }).then(function (winner) {
      if (winner) {
        excludeIds[winner.deviceId] = true;
        winners.push(winner);
        slotEl.classList.remove('slot-placeholder');
      }
    });
  });

  chain.then(function () {
    launchConfetti();
    return set(ref(db, 'draw/results/' + tier.key), winners);
  }).then(function () {
    state.results[tier.key] = winners;
    setTimeout(renderAll, 650);
  }).catch(function () {
    window.alert('Could not save the draw result — please check your connection and try again.');
    renderAll();
  });
}

function startDraw() {
  get(ref(db, 'registrations')).then(function (snap) {
    var pool = {};
    var count = 0;
    snap.forEach(function (child) {
      var r = child.val();
      pool[child.key] = { code: r.code, group: r.group, groupIndex: r.groupIndex };
      count++;
    });
    if (count < 1) {
      window.alert('No one has checked in yet.');
      return;
    }
    return set(ref(db, 'draw/poolSnapshot'), pool).then(function () {
      state.poolSnapshot = pool;
      renderAll();
    });
  }).catch(function () {
    window.alert('Could not start the draw — please check your connection and try again.');
  });
}

function resetDraw() {
  Promise.all([
    set(ref(db, 'draw/poolSnapshot'), null),
    set(ref(db, 'draw/results'), null)
  ]).then(function () {
    state.poolSnapshot = null;
    state.results = {};
    renderAll();
  }).catch(function () {
    window.alert('Could not reset — please try again.');
  });
}

function init() {
  if (!configured) {
    renderUnavailable('Firebase isn’t configured yet — fill in firebase-config.js.');
    return;
  }
  clearRoot();
  var wrap = el('div', 'wrap');
  wrap.appendChild(el('div', 'eyebrow', EVENT_NAME));
  wrap.appendChild(el('div', 'loading-mark'));
  wrap.appendChild(el('p', 'sub', 'Loading the draw…'));
  root.appendChild(wrap);

  Promise.all([
    get(ref(db, 'draw/poolSnapshot')),
    get(ref(db, 'draw/results')),
    get(ref(db, 'registrations'))
  ]).then(function (results) {
    var poolSnap = results[0], resultsSnap = results[1], regSnap = results[2];
    state.poolSnapshot = poolSnap.exists() ? poolSnap.val() : null;
    state.results = resultsSnap.exists() ? resultsSnap.val() : {};
    state.peopleCount = regSnap.exists() ? Object.keys(regSnap.val()).length : 0;
    renderAll();
  }).catch(function () {
    renderUnavailable('Could not reach the check-in database right now — please try again in a moment.');
  });
}

init();
