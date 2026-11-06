// Pure logic with no DOM or storage. Tested through test.html.

export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Cardio', 'Other'];
export const DEFAULT_STEP = 2.5;
const E1RM_MAX_REPS = 15; // the estimate is unreliable above 15 reps

export const round2 = (v) => Math.round(v * 100) / 100;

/** Sets always store the total weight. These convert for exercises entered per side of the bar. */
export const sideToTotal = (perSide, bar) => round2(perSide * 2 + bar);
export const totalToSide = (total, bar) => Math.max(0, round2((total - bar) / 2));

export function parseNumber(value) {
  const n = parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

const kgFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });
export const fmtNum = (n) => kgFormat.format(n);
export const fmtKg = (n) => `${kgFormat.format(n)} kg`;

const parseLocal = (date) => new Date(`${date}T12:00:00`);

export const fmtDate = (date) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(parseLocal(date));

export const fmtDateLong = (date) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseLocal(date));

export const fmtMonth = (date) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(parseLocal(date));

export const fmtShort = (date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).format(parseLocal(date));

export function fmtRelative(date, today = localDate()) {
  const d = daysBetween(date, today);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  const years = Math.round(d / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

export const fmtRange = (min, max) => (min === max ? `${min}` : `${min}–${max}`);

export function e1rm(weight, reps) {
  if (weight <= 0 || reps <= 0 || reps > E1RM_MAX_REPS) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/** Groups sets per workout, newest first. */
export function groupSessions(sets) {
  const map = new Map();
  for (const s of sets) {
    const key = s.workoutId || s.date;
    if (!map.has(key)) map.set(key, { key, date: s.date, sets: [] });
    map.get(key).sets.push(s);
  }
  const sessions = [...map.values()];
  for (const session of sessions) session.sets.sort((a, b) => a.ts - b.ts);
  return sessions.sort((a, b) => (b.date === a.date ? b.sets[0].ts - a.sets[0].ts : b.date.localeCompare(a.date)));
}

/** "30 kg × 10 · 10 · 9" or "30 kg × 10, 27.5 kg × 9 · 8" */
export function summarizeSets(sets) {
  const runs = [];
  for (const s of sets) {
    const run = runs[runs.length - 1];
    if (run && run.weight === s.weight) run.reps.push(s.reps);
    else runs.push({ weight: s.weight, reps: [s.reps] });
  }
  return runs
    .map((r) => `${r.weight > 0 ? fmtKg(r.weight) : 'Bodyweight'} × ${r.reps.join(' · ')}`)
    .join(', ');
}

export function records(sets) {
  const out = { heaviest: null, best: null, mostReps: null };
  for (const s of sets) {
    if (s.est) continue; // converted old-gym weights are estimates, so they never count as a record
    if (s.weight > 0 && (!out.heaviest || s.weight > out.heaviest.weight ||
        (s.weight === out.heaviest.weight && s.reps > out.heaviest.reps))) {
      out.heaviest = s;
    }
    const value = e1rm(s.weight, s.reps);
    if (value > 0 && (!out.best || value > out.best.value)) out.best = { ...s, value };
    if (!out.mostReps || s.reps > out.mostReps.reps) out.mostReps = s;
  }
  return out;
}

/** Which records does this set break against all earlier sets? The first time doesn't count. */
export function recordLabels(set, priorSets) {
  if (!priorSets.length) return [];
  const prior = records(priorSets);
  if (set.weight === 0) {
    return prior.heaviest || !prior.mostReps || set.reps <= prior.mostReps.reps ? [] : ['Most reps'];
  }
  if (prior.heaviest && set.weight > prior.heaviest.weight) return ['Heaviest weight'];
  const value = e1rm(set.weight, set.reps);
  if (prior.best && value > prior.best.value + 0.001) return ['Best set'];
  return [];
}

/** The heaviest line of a session; with equal weight, the one with the most reps. */
export function topSet(sets) {
  return sets.reduce((best, s) => (
    !best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best
  ), null);
}

/** Compares the best line of today with last time. Returns 'up', 'same', 'down' or null. */
export function compareTop(todaySets, lastSets) {
  const today = topSet(todaySets);
  const last = topSet(lastSets);
  if (!today || !last) return null;
  if (today.weight !== last.weight) return today.weight > last.weight ? 'up' : 'down';
  if (today.reps !== last.reps) return today.reps > last.reps ? 'up' : 'down';
  return 'same';
}

export const METRICS = {
  heaviest: { label: 'Heaviest weight', unit: 'kg' },
  e1rm: { label: 'Estimated max', unit: 'kg' },
  reps: { label: 'Reps', unit: '' },
};

/** One point per workout, oldest first. */
export function series(sets, metric, sinceDate = null) {
  const points = [];
  for (const session of groupSessions(sets).reverse()) {
    if (sinceDate && session.date < sinceDate) continue;
    let bestSet = null;
    let value = -1;
    for (const s of session.sets) {
      const v = metric === 'heaviest' ? s.weight : metric === 'e1rm' ? e1rm(s.weight, s.reps) : s.reps;
      if (v > value || (v === value && s.reps > bestSet.reps)) {
        value = v;
        bestSet = s;
      }
    }
    if (metric === 'e1rm' && value <= 0) continue;
    points.push({
      date: session.date,
      value: round2(value),
      detail: bestSet.est
        ? `about ${fmtKg(bestSet.weight)} × ${bestSet.reps}, logged as ${fmtKg(bestSet.rawWeight)}`
        : bestSet.weight > 0 ? `${fmtKg(bestSet.weight)} × ${bestSet.reps}` : `${bestSet.reps} reps`,
    });
  }
  return points;
}

/** Round axis values: 1, 2, 2.5 or 5 times a power of ten. */
export function niceTicks(min, max, count = 4) {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(round2(v));
  return ticks;
}

/**
 * Alternatives for a busy machine: from the plan first,
 * then exercises for the same muscle group you have done before.
 */
export function alternatives({ exerciseId, plannedIds = [], exercises, lastDateByExercise, excludeIds = [] }) {
  const exclude = new Set([exerciseId, ...excludeIds]);
  const planned = plannedIds.filter((id) => !exclude.has(id) && exercises.has(id));
  const plannedSet = new Set(planned);
  const muscle = exercises.get(exerciseId)?.muscle;
  const sameMuscle = [...exercises.values()]
    .filter((e) => e.muscle === muscle && !exclude.has(e.id) && !plannedSet.has(e.id) && lastDateByExercise.has(e.id))
    .sort((a, b) => lastDateByExercise.get(b.id).localeCompare(lastDateByExercise.get(a.id)))
    .slice(0, 8)
    .map((e) => e.id);
  return { planned, sameMuscle };
}
