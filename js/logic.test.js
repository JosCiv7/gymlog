import { applyFocus, coachSuggestions, exerciseRun, swapInPlan } from './coach.js';
import { alternatives, compareTop, e1rm, groupSessions, niceTicks, parseNumber, recordLabels, records, series, sideToTotal, summarizeSets, totalToSide } from './logic.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push(`ok    ${name}`);
  } catch (err) {
    results.push(`FAIL  ${name}: ${err.message}`);
  }
}
function eq(actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`got ${a}, expected ${b}`);
}

let ts = 0;
const set = (date, weight, reps, workoutId = date) => ({ date, weight, reps, workoutId, ts: (ts += 1) });
const session = (date, weight, ...reps) => reps.map((r) => set(date, weight, r));

test('sessions: newest first, sets in logged order', () => {
  const out = groupSessions([...session('2026-10-20', 60, 10), ...session('2026-11-01', 62.5, 8, 7)]);
  eq(out.map((s) => [s.date, s.sets.map((x) => x.reps)]), [['2026-11-01', [8, 7]], ['2026-10-20', [10]]]);
});

test('summary groups by weight', () => {
  eq(summarizeSets(session('2026-11-01', 60, 10, 9)), '60 kg × 10 · 9');
  eq(summarizeSets([set('2026-11-01', 60, 10), set('2026-11-01', 57.5, 9)]), '60 kg × 10, 57.5 kg × 9');
});

test('estimate: 1 rep is the weight itself, above 15 does not count', () => {
  eq(e1rm(100, 1), 100);
  eq(e1rm(100, 30 / 3), 100 * (1 + 10 / 30));
  eq(e1rm(100, 16), 0);
});

test('records: heaviest weight and best set', () => {
  const prior = [set('2026-10-01', 60, 10), set('2026-10-01', 65, 3)];
  const r = records(prior);
  eq([r.heaviest.weight, r.best.weight], [65, 60]);
  eq(recordLabels(set('2026-11-01', 67.5, 1), prior), ['Heaviest weight']);
  eq(recordLabels(set('2026-11-01', 60, 12), prior), ['Best set']);
  eq(recordLabels(set('2026-11-01', 60, 9), prior), []);
});

test('records: converted old-gym sets never count', () => {
  const prior = [{ ...set('2024-01-01', 30, 10), est: true, rawWeight: 59 }, set('2025-04-01', 25, 10)];
  eq(records(prior).heaviest.weight, 25);
  eq(recordLabels(set('2026-01-01', 27, 10), prior), ['Heaviest weight']);
});

test('first set of an exercise is no record', () => {
  eq(recordLabels(set('2026-11-01', 60, 10), []), []);
});

test('series: one point per workout, oldest first, with period filter', () => {
  const sets = [...session('2026-01-01', 50, 10), ...session('2026-06-01', 60, 8, 8)];
  eq(series(sets, 'heaviest').map((p) => [p.date, p.value]), [['2026-01-01', 50], ['2026-06-01', 60]]);
  eq(series(sets, 'heaviest', '2026-03-01').length, 1);
});

test('alternatives: plan first, then muscle group with history, excluding what is planned', () => {
  const exercises = new Map([
    ['leg', { id: 'leg', muscle: 'Quads' }], ['squat', { id: 'squat', muscle: 'Quads' }],
    ['ext', { id: 'ext', muscle: 'Quads' }], ['curl', { id: 'curl', muscle: 'Quads' }],
    ['nieuw', { id: 'nieuw', muscle: 'Quads' }], ['bench', { id: 'bench', muscle: 'Chest' }],
  ]);
  const last = new Map([['squat', '2026-10-01'], ['ext', '2026-09-01'], ['curl', '2026-10-20'], ['bench', '2026-11-01']]);
  const out = alternatives({ exerciseId: 'leg', plannedIds: ['squat'], exercises, lastDateByExercise: last, excludeIds: ['ext'] });
  eq(out, { planned: ['squat'], sameMuscle: ['curl'] });
});

test('per side: 20 kg with a 20 kg bar is 60 kg total, and back', () => {
  eq(sideToTotal(20, 20), 60);
  eq(totalToSide(60, 20), 20);
  eq(totalToSide(15, 20), 0);
});

test('compare: a lighter first line does not count as a drop', () => {
  const last = session('2026-10-01', 66, 8);
  eq(compareTop([...session('2026-11-01', 59, 10), ...session('2026-11-01', 66, 8)], last), 'same');
  eq(compareTop(session('2026-11-01', 59, 10), last), 'down');
  eq(compareTop(session('2026-11-01', 66, 7), last), 'down');
  eq(compareTop(session('2026-11-01', 66, 9), last), 'up');
  eq(compareTop(session('2026-11-01', 70, 1), last), 'up');
  eq(compareTop(session('2026-11-01', 66, 8), []), null);
});

// Coach: one session a week, oldest first, ending on the given date.
const weekly = (id, weeks, weightAt, end = '2026-11-06') => Array.from({ length: weeks }, (_, i) => {
  const d = new Date(`${end}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (weeks - 1 - i) * 7);
  const date = d.toISOString().slice(0, 10);
  return { exerciseId: id, date, workoutId: `${id}-${date}`, ts: d.getTime(), weight: weightAt(i), reps: 10 };
});
const COACH_TODAY = '2026-11-06';
const coachPlan = () => ({ days: [{ id: 'a', items: [
  { exerciseId: 'press', sets: 3, repMin: 8, repMax: 12, alt: ['fly'], hint: 'x' },
  { exerciseId: 'curl', sets: 2, repMin: 8, repMax: 12, alt: [] },
] }] });
const coachEx = new Map([
  ['press', { id: 'press', name: 'Press', muscle: 'Chest' }],
  ['fly', { id: 'fly', name: 'Fly', muscle: 'Chest' }],
  ['dip', { id: 'dip', name: 'Dip', muscle: 'Chest' }],
  ['curl', { id: 'curl', name: 'Curl', muscle: 'Biceps' }],
]);
const ask = (setsByEx, schema = coachPlan()) => coachSuggestions({ schema, exercises: coachEx, setsByEx: new Map(Object.entries(setsByEx)), today: COACH_TODAY });

test('coach: a stalled exercise of 8+ weeks gets a swap, plan alternative first', () => {
  const out = ask({ press: weekly('press', 10, () => 60) });
  eq(out.map((p) => [p.type, p.from, p.to]), [['swap', 'press', 'fly']]);
});

test('coach: no swap while the exercise still progresses', () => {
  eq(ask({ press: weekly('press', 10, (i) => 60 + i) }), []);
});

test('coach: a long run gets a swap even when it still progresses', () => {
  eq(ask({ press: weekly('press', 17, (i) => 60 + i) }).map((p) => p.from), ['press']);
});

test('coach: a main lift only swaps when stalled, and only to a plan alternative', () => {
  const plan = () => ({ days: [{ id: 'a', items: [{ exerciseId: 'press', sets: 3, first: true, alt: [] }] }] });
  eq(ask({ press: weekly('press', 17, (i) => 60 + i) }, plan()), []);
  eq(ask({ press: weekly('press', 10, () => 60) }, plan()), []);
  const withAlt = plan();
  withAlt.days[0].items[0].alt = ['dip'];
  eq(ask({ press: weekly('press', 10, () => 60) }, withAlt).map((p) => p.to), ['dip']);
});

test('coach: a replacement must train nearly the same muscles', () => {
  const exercises = new Map([
    ['ext', { id: 'ext', name: 'Extension', muscle: 'Quads', primary: ['quads'], secondary: [] }],
    ['split', { id: 'split', name: 'Split Squat', muscle: 'Quads', primary: ['quads', 'glutes'], secondary: ['hamstrings', 'adductors'] }],
  ]);
  const schema = { days: [{ id: 'a', items: [{ exerciseId: 'ext', sets: 3, alt: [] }] }] };
  const setsByEx = new Map([['ext', weekly('ext', 10, () => 40)]]);
  eq(coachSuggestions({ schema, exercises, setsByEx, today: COACH_TODAY }), []);
});

test('coach: too short a run or a past exercise gets no swap', () => {
  eq(ask({ press: weekly('press', 5, () => 60) }), []);
  eq(ask({ press: weekly('press', 12, () => 60, '2026-08-01') }), []);
});

test('coach: a real break starts a new run', () => {
  const run = exerciseRun([...weekly('press', 20, () => 60, '2026-07-01'), ...weekly('press', 3, () => 60)], COACH_TODAY);
  eq([run.sessions, run.weeks], [3, 2]);
});

test('coach: a muscle group that drops gets a focus, a general dip does not', () => {
  const steady = weekly('curl', 12, () => 20);
  const dropped = weekly('press', 8, (i) => 60 + i, '2026-09-20');
  const late = weekly('press', 1, () => 67);
  const out = ask({ curl: steady, press: [...dropped, ...late] });
  eq(out.filter((p) => p.type === 'focus').map((p) => p.muscle), ['Chest']);
  const bothLess = ask({ curl: weekly('curl', 8, () => 20, '2026-09-20'), press: weekly('press', 8, () => 60, '2026-09-20') });
  eq(bothLess.filter((p) => p.type === 'focus'), []);
});

test('coach: lower weights in a group also trigger a focus', () => {
  const out = ask({ press: weekly('press', 12, (i) => (i < 8 ? 100 : 80)), curl: weekly('curl', 12, () => 20) });
  eq(out.filter((p) => p.type === 'focus').map((p) => p.muscle), ['Chest']);
});

test('coach: not now hides a proposal, an active focus blocks another', () => {
  const sets = { press: weekly('press', 10, () => 60) };
  eq(ask(sets, { ...coachPlan(), snoozed: { 'swap:press': '2026-12-01' } }), []);
  const lower = { press: weekly('press', 12, (i) => (i < 8 ? 100 : 80)), curl: weekly('curl', 12, () => 20) };
  eq(ask(lower, { ...coachPlan(), focus: { muscle: 'Back', until: '2026-12-01' } }).filter((p) => p.type === 'focus'), []);
});

test('coach: swapping keeps the old exercise as an alternative', () => {
  const plan = swapInPlan(coachPlan(), 'press', 'fly');
  eq([plan.days[0].items[0].exerciseId, plan.days[0].items[0].alt, plan.days[0].items[0].hint], ['fly', ['press'], undefined]);
});

test('coach: focus moves the group up behind always-first and adds one set', () => {
  const items = [
    { exerciseId: 'dip', sets: 3, first: true },
    { exerciseId: 'curl', sets: 2 },
    { exerciseId: 'press', sets: 3 },
    { exerciseId: 'fly', sets: 3 },
  ];
  const out = applyFocus(items.slice(1).concat(), { muscle: 'Chest', until: '2026-12-01' }, coachEx, COACH_TODAY);
  eq(out.map((it) => [it.exerciseId, it.sets]), [['press', 4], ['fly', 3], ['curl', 2]]);
  const withFirst = applyFocus(items, { muscle: 'Biceps', until: '2026-12-01' }, coachEx, COACH_TODAY);
  eq(withFirst.map((it) => [it.exerciseId, it.sets]), [['dip', 3], ['curl', 3], ['press', 3], ['fly', 3]]);
  eq(applyFocus(items, { muscle: 'Chest', until: '2026-01-01' }, coachEx, COACH_TODAY), items);
});

test('numbers with comma or dot', () => {
  eq(parseNumber('62,5'), 62.5);
  eq(parseNumber('62.5'), 62.5);
  eq(parseNumber(''), null);
});

test('axis ticks are round and cover the data', () => {
  const ticks = niceTicks(62.5, 100);
  if (ticks[0] > 62.5 || ticks[ticks.length - 1] < 100) throw new Error(ticks.join());
  eq(niceTicks(50, 50).length >= 2, true);
});

const failed = results.filter((r) => r.startsWith('FAIL')).length;
document.getElementById('out').textContent = `${results.length - failed} passed, ${failed} failed\n\n${results.join('\n')}`;
window.testResult = { total: results.length, failed };
