// Pure recommendation logic — no DOM access, so it can be unit-tested with `node --test`.
// Lanes are indexed from the left: 0 = leftmost lane.

export const TRAFFIC = Object.freeze({
  SLOW: 'slow', // zähfließend
  STOPGO: 'stopgo', // Stop-and-Go
  STANDSTILL: 'standstill', // Stillstand
});

// Observations older than this barely count any more (exponential decay time constant).
export const OBSERVATION_TAU_MS = 120_000;
// Score gained per (fresh) overtake observed in an adjacent lane.
const OBSERVATION_WEIGHT = 0.8;
const OBSERVATION_CAP = 3;
// Cost of a single lane change (time lost, risk, disturbing the flow).
const SWITCH_COST = { [TRAFFIC.SLOW]: 0.6, [TRAFFIC.STOPGO]: 0.9 };
// Minimum net gain before we recommend leaving the current lane.
const MIN_GAIN = 0.4;

export function laneName(index, laneCount) {
  const names = {
    1: ['Einzige Spur'],
    2: ['Links', 'Rechts'],
    3: ['Links', 'Mitte', 'Rechts'],
    4: ['Links', 'Mitte-links', 'Mitte-rechts', 'Rechts'],
    5: ['Links', '2. von links', 'Mitte', '2. von rechts', 'Rechts'],
  };
  return names[laneCount]?.[index] ?? `Spur ${index + 1}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Weighted sum of overtake observations for one side.
 * observation: { t: timestamp ms, side: 'left' | 'right', neighborFaster: boolean }
 */
export function observationBalance(observations, side, now) {
  let sum = 0;
  let weight = 0;
  for (const o of observations) {
    if (o.side !== side) continue;
    const w = Math.exp(-Math.max(0, now - o.t) / OBSERVATION_TAU_MS);
    sum += (o.neighborFaster ? 1 : -1) * w;
    weight += w;
  }
  return { sum, weight };
}

/**
 * @param {object} input
 * @param {number} input.laneCount 1–5
 * @param {number} input.currentLane 0-based from the left
 * @param {string} input.traffic one of TRAFFIC
 * @param {Array} input.observations overtake taps, see observationBalance
 * @param {object} input.factors
 * @param {number[]} [input.factors.truckLanes] lanes dominated by trucks
 * @param {boolean} [input.factors.onRamp] on-ramp (Einfahrt) ahead
 * @param {boolean} [input.factors.exitJam] exit ahead with traffic backing up onto the motorway
 * @param {number|null} [input.factors.laneEnds] lane that ends ahead (construction, lane drop)
 * @param {number|null} [input.factors.incident] lane blocked by accident/breakdown ahead
 * @param {number} input.now timestamp ms
 */
export function recommend({ laneCount, currentLane, traffic, observations = [], factors = {}, now = Date.now() }) {
  const n = clamp(Math.round(laneCount), 1, 5);
  const current = clamp(Math.round(currentLane), 0, n - 1);
  const scores = new Array(n).fill(0);
  const reasons = [];
  const rightmost = n - 1;

  if (n === 1) {
    return result('stay', current, current, scores, ['Nur eine Spur — nichts zu entscheiden.'], 'hoch');
  }

  if (traffic === TRAFFIC.STANDSTILL) {
    return result(
      'stay',
      current,
      current,
      scores,
      [
        'Im Stillstand keine Spurwechsel: Rettungsgasse bilden (zwischen der linken Spur und allen anderen).',
        'Wechsel bringen jetzt nichts und blockieren Einsatzfahrzeuge.',
      ],
      'hoch',
    );
  }

  const add = (lane, delta) => {
    if (lane >= 0 && lane < n) scores[lane] += delta;
  };

  for (const lane of new Set(factors.truckLanes ?? [])) {
    if (lane < 0 || lane >= n) continue;
    add(lane, -1.5);
    reasons.push(`${laneName(lane, n)}: viele LKW — beschleunigen langsam, große Lücken im Stop-and-Go.`);
  }

  if (factors.onRamp) {
    add(rightmost, -1.2);
    if (n >= 3) add(rightmost - 1, -0.4);
    reasons.push('Einfahrt voraus: Einfädelnde bremsen die rechte Spur.');
  }

  if (factors.exitJam) {
    add(rightmost, -2);
    reasons.push('Rückstau von der Ausfahrt: rechte Spur meiden (außer du willst raus).');
  }

  if (Number.isInteger(factors.laneEnds) && factors.laneEnds >= 0 && factors.laneEnds < n) {
    const ending = factors.laneEnds;
    add(ending, -0.5);
    add(ending - 1, -0.8);
    add(ending + 1, -0.8);
    reasons.push(
      `${laneName(ending, n)} endet: Nachbarspuren werden durch den Reißverschluss gebremst. ` +
        'Wer schon auf der endenden Spur ist, fährt bis zum Ende und fädelt dort ein.',
    );
  }

  if (Number.isInteger(factors.incident) && factors.incident >= 0 && factors.incident < n) {
    const blocked = factors.incident;
    add(blocked, -3);
    add(blocked - 1, -0.7);
    add(blocked + 1, -0.7);
    reasons.push(`${laneName(blocked, n)}: Hindernis/Unfall voraus — Spur meiden, Nachbarspuren leiden mit (Gaffer, Einfädeln).`);
  }

  let observationWeight = 0;
  for (const [side, lane] of [['left', current - 1], ['right', current + 1]]) {
    if (lane < 0 || lane >= n) continue;
    const { sum, weight } = observationBalance(observations, side, now);
    observationWeight += weight;
    if (weight < 0.05) continue;
    const delta = clamp(sum * OBSERVATION_WEIGHT, -OBSERVATION_CAP, OBSERVATION_CAP);
    add(lane, delta);
    if (Math.abs(sum) >= 0.5) {
      reasons.push(
        sum > 0
          ? `${laneName(lane, n)} zieht an dir vorbei (deine Beobachtung).`
          : `Du überholst ${laneName(lane, n)} (deine Beobachtung).`,
      );
    }
  }

  const switchCost = SWITCH_COST[traffic] ?? SWITCH_COST[TRAFFIC.SLOW];
  let best = current;
  let bestValue = scores[current];
  for (let i = 0; i < n; i++) {
    const value = scores[i] - switchCost * Math.abs(i - current);
    // Prefer staying, then the closer lane, on ties.
    if (value > bestValue + 1e-9) {
      best = i;
      bestValue = value;
    }
  }

  const gain = bestValue - scores[current];
  const hasFactors = reasons.length > 0;

  if (best === current || gain < MIN_GAIN) {
    if (!hasFactors) {
      reasons.push('Noch keine Hinweise. Tippe an, wenn eine Nachbarspur an dir vorbeizieht oder du sie überholst.');
    } else if (best !== current) {
      reasons.push('Der Vorteil ist zu klein, um den Spurwechsel zu rechtfertigen.');
    }
    return result('stay', current, current, scores, reasons, confidence(0, observationWeight, hasFactors));
  }

  // Only ever advise the next single step; re-evaluate after each change.
  const next = current + Math.sign(best - current);
  return result(
    best < current ? 'left' : 'right',
    next,
    best,
    scores,
    reasons,
    confidence(gain, observationWeight, hasFactors),
  );
}

function confidence(gain, observationWeight, hasFactors) {
  if (gain >= 1.5 || (gain >= 0.8 && observationWeight >= 3)) return 'hoch';
  if (gain >= 0.8 || observationWeight >= 2 || hasFactors) return 'mittel';
  return 'niedrig';
}

function result(action, nextLane, targetLane, scores, reasons, confidenceLevel) {
  return { action, nextLane, targetLane, scores, reasons, confidence: confidenceLevel };
}
