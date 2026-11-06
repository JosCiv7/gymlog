// Made-up history on top of the real plan, for testing the layout. Not your real numbers.

import { localDate, round2 } from './logic.js';
import { EXERCISES, PLAN } from './plan.js';

const START_WEIGHTS = {
  bench: 60, 'db-bench': 24, 'smith-press': 50, 'incline-db': 22, 'chest-press': 45, 'pec-deck': 40, 'cable-fly': 12,
  'low-high-fly': 9, 'lat-pulldown': 55, 'single-lat': 15, 'seated-row': 50, 'chest-row': 45, 'cable-lateral': 6,
  'incline-curl': 10, hammer: 12, 'oh-triceps': 20, 'hack-squat': 40, squat: 70, 'leg-press': 110, 'angled-press': 80,
  'split-squat': 14, 'leg-extension': 40, rdl: 70, 'seated-curl': 35, 'lying-curl': 30, 'calf-raise': 60,
  'cable-crunch': 30, 'leg-raise': 0, spin: 0, stairmaster: 0, rowing: 0,
};

export function buildDemo() {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const stateFor = new Map(EXERCISES.map((e) => [e.id, {
    weight: START_WEIGHTS[e.id] ?? 20,
    step: e.perSide ? e.step * 2 : e.step,
    cardio: e.kind === 'cardio',
    reps: null,
  }]));
  const workouts = [];
  const sets = [];

  const today = new Date();
  today.setHours(18, 0, 0, 0);
  const SESSIONS = 100; // about six months, four times a week
  for (let n = SESSIONS; n >= 1; n -= 1) {
    const day = PLAN.days[(SESSIONS - n) % PLAN.days.length];
    const when = new Date(today);
    when.setDate(when.getDate() - Math.round((n * 7) / 4));
    const date = localDate(when);
    const workoutId = `demo-w${n}`;
    let ts = when.getTime();
    workouts.push({ id: workoutId, date, dayId: day.id, dayName: day.name, startedAt: ts, finishedAt: ts + 3600000 });
    for (const it of day.items) {
      const st = stateFor.get(it.exerciseId);
      const repMin = it.repMin ?? 8;
      const repMax = it.repMax ?? 15;
      st.reps = st.reps ?? repMin;
      const push = (i, weight, reps) => {
        ts += 150000;
        sets.push({ id: `demo-s${n}-${it.exerciseId}-${i}`, exerciseId: it.exerciseId, workoutId, date, ts, weight, reps });
      };
      if (st.cardio) {
        push(0, 0, 40 + 5 * Math.floor(rand() * 5));
        continue;
      }
      const value = Math.min(repMax, st.reps);
      push(0, st.weight, value);
      if (st.weight > 0 && rand() < 0.15) push(1, round2(st.weight + st.step), Math.max(1, value - 3));
      if (value >= repMax && st.weight > 0) {
        st.weight = round2(st.weight + st.step);
        st.reps = repMin;
      } else if (rand() < 0.7) {
        st.reps = Math.min(repMax, st.reps + 1);
      }
    }
  }

  const notes = [{ id: 'demo-n1', exerciseId: 'leg-press', date: workouts.at(-3).date, text: 'Seat on position 4' }];
  return { exercises: EXERCISES, workouts, sets, notes, schema: PLAN };
}
