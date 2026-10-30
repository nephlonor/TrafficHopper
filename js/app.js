import { recommend, laneName, observationBalance, TRAFFIC, OBSERVATION_TAU_MS } from './advisor.js';

const STORAGE_KEY = 'traffichopper:v1';
const ARROWS = { left: '←', right: '→', stay: '↑' };

const defaults = () => ({
  laneCount: 3,
  currentLane: 1,
  traffic: TRAFFIC.STOPGO,
  observations: [],
  factors: { truckLanes: [], onRamp: false, exitJam: false, laneEnds: null, incident: null },
  safetyAccepted: false,
});

const state = load();
const $ = (id) => document.getElementById(id);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      const merged = { ...defaults(), ...saved, factors: { ...defaults().factors, ...saved.factors } };
      // Drop stale observations from a previous jam.
      merged.observations = (merged.observations ?? []).filter((o) => Date.now() - o.t < OBSERVATION_TAU_MS * 5);
      return merged;
    }
  } catch {
    // Storage unavailable or corrupt — start fresh.
  }
  return defaults();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore: private mode or blocked storage.
  }
}

function clampFactorsToLanes() {
  const n = state.laneCount;
  const f = state.factors;
  f.truckLanes = f.truckLanes.filter((l) => l < n);
  if (f.laneEnds !== null && f.laneEnds >= n) f.laneEnds = null;
  if (f.incident !== null && f.incident >= n) f.incident = null;
  if (state.currentLane >= n) state.currentLane = n - 1;
}

function renderSegmented(container, value) {
  for (const btn of container.querySelectorAll('button')) {
    const selected = btn.dataset.value === String(value);
    btn.setAttribute('aria-checked', String(selected));
    btn.classList.toggle('is-selected', selected);
  }
}

function renderLaneOptions(select, value) {
  const options = ['<option value="">— keine —</option>'];
  for (let i = 0; i < state.laneCount; i++) {
    options.push(`<option value="${i}">${laneName(i, state.laneCount)}</option>`);
  }
  select.innerHTML = options.join('');
  select.value = value === null ? '' : String(value);
}

function render() {
  const n = state.laneCount;
  const result = recommend({ ...state, now: Date.now() });

  // Verdict
  const arrow = $('verdict-arrow');
  arrow.textContent = ARROWS[result.action];
  arrow.dataset.action = result.action;
  $('verdict-text').textContent =
    result.action === 'stay'
      ? `Bleib ${n > 1 ? `auf ${laneName(state.currentLane, n)}` : 'auf deiner Spur'}`
      : `Wechsle nach ${result.action === 'left' ? 'links' : 'rechts'} → ${laneName(result.nextLane, n)}`;
  $('verdict-confidence').textContent = `Sicherheit: ${result.confidence}`;
  document.body.dataset.action = result.action;

  // Road
  const road = $('road');
  road.style.setProperty('--lanes', n);
  road.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const lane = document.createElement('button');
    lane.type = 'button';
    lane.className = 'lane';
    lane.dataset.lane = i;
    if (i === state.currentLane) lane.classList.add('is-current');
    if (i === result.nextLane && result.action !== 'stay') lane.classList.add('is-next');
    if (i === result.targetLane && result.targetLane !== result.nextLane) lane.classList.add('is-target');
    if (state.factors.incident === i) lane.classList.add('is-blocked');
    lane.setAttribute('aria-pressed', String(i === state.currentLane));
    lane.setAttribute('aria-label', `${laneName(i, n)}${i === state.currentLane ? ' (deine Spur)' : ''}`);
    lane.innerHTML = `
      <span class="lane__name">${laneName(i, n)}</span>
      ${i === state.currentLane ? '<span class="lane__car" aria-hidden="true">🚗</span>' : ''}
      ${state.factors.truckLanes.includes(i) ? '<span class="lane__badge" aria-hidden="true">🚚</span>' : ''}
      ${state.factors.incident === i ? '<span class="lane__badge" aria-hidden="true">⚠️</span>' : ''}
      ${state.factors.laneEnds === i ? '<span class="lane__badge" aria-hidden="true">⛔</span>' : ''}`;
    road.append(lane);
  }

  // Observation buttons only make sense when that neighbor lane exists.
  for (const side of document.querySelectorAll('.observe__side')) {
    const exists = side.dataset.side === 'left' ? state.currentLane > 0 : state.currentLane < n - 1;
    side.classList.toggle('is-disabled', !exists);
    const neighbor = state.currentLane + (side.dataset.side === 'left' ? -1 : 1);
    side.querySelector('.observe__label').textContent =
      `Spur ${side.dataset.side === 'left' ? 'links' : 'rechts'}${exists ? ` (${laneName(neighbor, n)})` : ' – keine'}`;
    for (const btn of side.querySelectorAll('button')) btn.disabled = !exists;
  }
  const now = Date.now();
  const left = observationBalance(state.observations, 'left', now);
  const right = observationBalance(state.observations, 'right', now);
  const fresh = state.observations.filter((o) => now - o.t < OBSERVATION_TAU_MS * 2).length;
  $('observe-count').textContent =
    fresh === 0
      ? 'Noch keine Beobachtungen. Tippe jedes Mal, wenn es passiert.'
      : `${fresh} aktuelle Beobachtung${fresh === 1 ? '' : 'en'} · links ${fmt(left.sum)} · rechts ${fmt(right.sum)}`;

  // Setup controls
  const lanes = $('lanes');
  if (!lanes.children.length) {
    lanes.innerHTML = [2, 3, 4, 5].map((k) => `<button type="button" role="radio" data-value="${k}">${k}</button>`).join('');
  }
  renderSegmented(lanes, n);
  renderSegmented($('traffic'), state.traffic);
  $('onRamp').checked = state.factors.onRamp;
  $('exitJam').checked = state.factors.exitJam;
  renderLaneOptions($('laneEnds'), state.factors.laneEnds);
  renderLaneOptions($('incident'), state.factors.incident);

  const trucks = $('trucks');
  trucks.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.lane = i;
    chip.textContent = laneName(i, n);
    const on = state.factors.truckLanes.includes(i);
    chip.classList.toggle('is-selected', on);
    chip.setAttribute('aria-pressed', String(on));
    trucks.append(chip);
  }

  // Reasons
  $('reasons').innerHTML = result.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('');
}

function fmt(value) {
  if (Math.abs(value) < 0.05) return '±0';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function update(mutator) {
  mutator();
  clampFactorsToLanes();
  save();
  render();
}

function wire() {
  $('road').addEventListener('click', (e) => {
    const lane = e.target.closest('.lane');
    if (!lane) return;
    const next = Number(lane.dataset.lane);
    // Observations are relative to the lane you are in; a lane change invalidates them.
    update(() => {
      if (next !== state.currentLane) state.observations = [];
      state.currentLane = next;
    });
  });

  document.querySelector('.observe').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-side]');
    if (!btn || btn.disabled) return;
    update(() => {
      state.observations.push({ t: Date.now(), side: btn.dataset.side, neighborFaster: btn.dataset.faster === 'true' });
      state.observations = state.observations.slice(-60);
    });
    navigator.vibrate?.(15);
    btn.classList.remove('is-flash');
    void btn.offsetWidth;
    btn.classList.add('is-flash');
  });

  $('lanes').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) update(() => { state.laneCount = Number(btn.dataset.value); });
  });

  $('traffic').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (btn) update(() => { state.traffic = btn.dataset.value; });
  });

  for (const id of ['onRamp', 'exitJam']) {
    $(id).addEventListener('change', (e) => update(() => { state.factors[id] = e.target.checked; }));
  }
  for (const id of ['laneEnds', 'incident']) {
    $(id).addEventListener('change', (e) =>
      update(() => { state.factors[id] = e.target.value === '' ? null : Number(e.target.value); }),
    );
  }

  $('trucks').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const lane = Number(chip.dataset.lane);
    update(() => {
      const set = new Set(state.factors.truckLanes);
      set.has(lane) ? set.delete(lane) : set.add(lane);
      state.factors.truckLanes = [...set].sort();
    });
  });

  $('reset').addEventListener('click', () => {
    const { laneCount, safetyAccepted } = state;
    update(() => Object.assign(state, defaults(), { laneCount, safetyAccepted, currentLane: Math.floor((laneCount - 1) / 2) }));
  });

  $('safety-ok').addEventListener('click', () => {
    state.safetyAccepted = true;
    save();
    $('safety').hidden = true;
  });
}

wire();
clampFactorsToLanes();
render();
$('safety').hidden = state.safetyAccepted;
// Observations decay over time, so refresh the verdict periodically.
// Skip while a dropdown is focused, since re-rendering would close it.
setInterval(() => {
  if (document.activeElement?.tagName !== 'SELECT') render();
}, 5000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
