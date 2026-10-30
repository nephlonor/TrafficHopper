import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, laneName, observationBalance, TRAFFIC, OBSERVATION_TAU_MS } from '../js/advisor.js';

const NOW = 1_000_000;
const base = { laneCount: 3, currentLane: 1, traffic: TRAFFIC.STOPGO, observations: [], factors: {}, now: NOW };

const taps = (side, neighborFaster, count, age = 0) =>
  Array.from({ length: count }, () => ({ t: NOW - age, side, neighborFaster }));

test('stays put without any information', () => {
  const r = recommend(base);
  assert.equal(r.action, 'stay');
  assert.equal(r.nextLane, 1);
  assert.equal(r.confidence, 'niedrig');
});

test('never advises a lane change in standstill (Rettungsgasse)', () => {
  const r = recommend({ ...base, traffic: TRAFFIC.STANDSTILL, observations: taps('left', true, 10) });
  assert.equal(r.action, 'stay');
  assert.match(r.reasons[0], /Rettungsgasse/);
});

test('single lane has nothing to decide', () => {
  assert.equal(recommend({ ...base, laneCount: 1, currentLane: 0 }).action, 'stay');
});

test('follows a neighbor lane that keeps passing', () => {
  const r = recommend({ ...base, observations: taps('left', true, 3) });
  assert.equal(r.action, 'left');
  assert.equal(r.nextLane, 0);
});

test('one fresh tap is not enough to justify a switch', () => {
  assert.equal(recommend({ ...base, observations: taps('right', true, 1) }).action, 'stay');
});

test('old observations decay', () => {
  const r = recommend({ ...base, observations: taps('left', true, 3, OBSERVATION_TAU_MS * 5) });
  assert.equal(r.action, 'stay');
});

test('overtaking a neighbor lane lowers its score', () => {
  const r = recommend({ ...base, observations: taps('right', false, 3) });
  assert.ok(r.scores[2] < 0);
  assert.equal(r.action, 'stay');
});

test('leaves a truck-dominated right lane', () => {
  const r = recommend({ ...base, currentLane: 2, factors: { truckLanes: [2] } });
  assert.equal(r.action, 'left');
  assert.equal(r.nextLane, 1);
});

test('exit jam pushes away from the rightmost lane', () => {
  const r = recommend({ ...base, currentLane: 2, factors: { exitJam: true } });
  assert.equal(r.action, 'left');
});

test('blocked lane ahead: moves away one step at a time', () => {
  const r = recommend({ ...base, laneCount: 4, currentLane: 0, factors: { incident: 0 } });
  assert.equal(r.action, 'right');
  assert.equal(r.nextLane, 1);
  assert.ok(r.targetLane >= 1);
});

test('ignores factors for lanes that do not exist', () => {
  const r = recommend({ ...base, factors: { incident: 7, laneEnds: -1, truckLanes: [9] } });
  assert.equal(r.action, 'stay');
  assert.deepEqual(r.scores, [0, 0, 0]);
});

test('ignores observations on a side without a lane', () => {
  const r = recommend({ ...base, currentLane: 0, observations: taps('left', true, 5) });
  assert.equal(r.action, 'stay');
});

test('observationBalance weighs by recency', () => {
  const { sum, weight } = observationBalance(
    [
      { t: NOW, side: 'left', neighborFaster: true },
      { t: NOW - OBSERVATION_TAU_MS, side: 'left', neighborFaster: false },
      { t: NOW, side: 'right', neighborFaster: true },
    ],
    'left',
    NOW,
  );
  assert.ok(sum > 0.6 && sum < 0.7);
  assert.ok(weight > 1.3 && weight < 1.4);
});

test('lane names', () => {
  assert.equal(laneName(0, 3), 'Links');
  assert.equal(laneName(1, 3), 'Mitte');
  assert.equal(laneName(2, 3), 'Rechts');
  assert.equal(laneName(1, 4), 'Mitte-links');
  assert.equal(laneName(0, 2), 'Links');
});
