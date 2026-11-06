// A small on-device coach. It reads your logs and proposes plan changes; you decide.
// It only makes two kinds of proposals: swap a stale exercise, and focus on a slipping muscle group.

import { daysBetween, e1rm, fmtNum, groupSessions, localDate } from './logic.js';

const RUN_GAP_DAYS = 28; // a longer break starts a fresh run with an exercise
const STALE_WEEKS = 8;
const LONG_WEEKS = 16;
const STALE_SESSIONS = 6;
const STALL_SESSIONS = 4;
const RECENT_DAYS = 28;
const EARLIER_DAYS = 56;
const FOCUS_DAYS = 28;
const SNOOZE_DAYS = 21;
const DROP_RATIO = 0.6;
const STRENGTH_DROP = -0.075;
const PRIORITY = ['Chest', 'Quads', 'Hamstrings']; // the priorities in your plan

export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** One comparable number per session: estimated max, or weight, or reps for bodyweight. */
function sessionValue(session) {
  return Math.max(...session.sets.map((s) => e1rm(s.weight, s.reps) || s.weight || s.reps));
}

/** How long you have been doing this exercise without a real break, and whether it still moves. */
export function exerciseRun(sets, today) {
  const sessions = groupSessions(sets).reverse();
  if (!sessions.length || daysBetween(sessions[sessions.length - 1].date, today) > RUN_GAP_DAYS) return null;
  let start = sessions.length - 1;
  while (start > 0 && daysBetween(sessions[start - 1].date, sessions[start].date) <= RUN_GAP_DAYS) start -= 1;
  const run = sessions.slice(start);
  const values = run.map(sessionValue);
  const split = Math.max(0, values.length - STALL_SESSIONS);
  const stalled = split > 0 && Math.max(...values.slice(split)) <= Math.max(...values.slice(0, split));
  return { sessions: run.length, weeks: Math.floor(daysBetween(run[0].date, today) / 7), stalled };
}

function plannedIds(schema) {
  return new Set(schema.days.flatMap((d) => d.items.map((it) => it.exerciseId)));
}

function swapProposal({ schema, exercises, setsByEx, today }) {
  const planned = plannedIds(schema);
  const candidates = [];
  for (const id of planned) {
    const ex = exercises.get(id);
    if (!ex || ex.kind === 'cardio') continue;
    const run = exerciseRun(setsByEx.get(id) ?? [], today);
    if (!run || run.sessions < STALE_SESSIONS) continue;
    // Main lifts only change when they really stall. Everything else may also change for variety.
    const isMainLift = schema.days.some((d) => d.items.some((it) => it.exerciseId === id && it.first));
    const stale = (run.weeks >= STALE_WEEKS && run.stalled) || (run.weeks >= LONG_WEEKS && !isMainLift);
    if (!stale) continue;
    const to = replacementFor({ id, isMainLift, schema, exercises, setsByEx, planned });
    if (to) candidates.push({ id, to, run });
  }
  candidates.sort((a, b) => Number(b.run.stalled) - Number(a.run.stalled) || b.run.weeks - a.run.weeks);
  return candidates.map(({ id, to, run }) => ({
    key: `swap:${id}`,
    type: 'swap',
    from: id,
    to,
    title: `Time for something new?`,
    reason: run.stalled
      ? `${run.weeks} weeks of ${exercises.get(id).name}, and your last ${STALL_SESSIONS} sessions brought no record. Try ${exercises.get(to).name} for a while.`
      : `${run.weeks} weeks of ${exercises.get(id).name}. Try ${exercises.get(to).name} to keep it fresh.`,
    action: `Swap to ${exercises.get(to).name}`,
  }));
}

/** How much two exercises train the same muscles, from 0 to 1. Unknown muscle lists count as similar. */
function overlap(a, b) {
  if (!a.primary || !b.primary) return 1;
  const left = new Set([...a.primary, ...(a.secondary ?? [])]);
  const right = new Set([...b.primary, ...(b.secondary ?? [])]);
  const shared = [...left].filter((m) => right.has(m)).length;
  return shared / new Set([...left, ...right]).size;
}

/**
 * Prefers the alternatives in your plan. Other exercises must train nearly the same muscles,
 * and a main lift is only replaced by an alternative from your plan, so a press never becomes a fly.
 */
function replacementFor({ id, isMainLift, schema, exercises, setsByEx, planned }) {
  const ex = exercises.get(id);
  const fromPlan = schema.days.flatMap((d) => d.items).filter((it) => it.exerciseId === id).flatMap((it) => it.alt ?? []);
  const lastDate = (other) => {
    const sets = setsByEx.get(other) ?? [];
    return sets.length ? sets[sets.length - 1].date : '';
  };
  const sameMuscle = [...exercises.values()]
    .filter((e) => !isMainLift && e.muscle === ex.muscle && e.kind !== 'cardio' && overlap(ex, e) >= 0.6)
    .sort((a, b) => lastDate(a.id).localeCompare(lastDate(b.id)))
    .map((e) => e.id);
  return [...fromPlan, ...sameMuscle].find((other) => other !== id && exercises.has(other) && !planned.has(other)) ?? null;
}

function focusProposal({ schema, exercises, setsByEx, today }) {
  if (schema.focus && schema.focus.until >= today) return [];
  const recentStart = addDays(today, -RECENT_DAYS);
  const earlierStart = addDays(today, -(RECENT_DAYS + EARLIER_DAYS));
  const perWeek = new Map();
  const changes = new Map();
  let recentAll = 0;
  let earlierAll = 0;

  for (const [id, sets] of setsByEx) {
    const ex = exercises.get(id);
    if (!ex || ex.kind === 'cardio' || ex.muscle === 'Other') continue;
    const row = perWeek.get(ex.muscle) ?? { recent: 0, earlier: 0 };
    const recentValues = [];
    const earlierValues = [];
    for (const session of groupSessions(sets)) {
      if (session.date > recentStart) {
        row.recent += 1;
        recentAll += 1;
        recentValues.push(sessionValue(session));
      } else if (session.date > earlierStart) {
        row.earlier += 1;
        earlierAll += 1;
        earlierValues.push(sessionValue(session));
      }
    }
    perWeek.set(ex.muscle, row);
    if (recentValues.length && earlierValues.length >= 2) {
      const change = median(recentValues) / median(earlierValues) - 1;
      changes.set(ex.muscle, [...(changes.get(ex.muscle) ?? []), change]);
    }
  }
  if (earlierAll < 8) return []; // not enough history to compare

  const overall = (recentAll / RECENT_DAYS) / (earlierAll / EARLIER_DAYS);
  const proposals = [];
  for (const [muscle, row] of perWeek) {
    const recent = (row.recent / RECENT_DAYS) * 7;
    const earlier = (row.earlier / EARLIER_DAYS) * 7;
    const ratio = earlier > 0 ? recent / earlier : 1;
    const strength = changes.has(muscle) ? median(changes.get(muscle)) : 0;
    // A group only counts as slipping if it fell clearly more than your training as a whole.
    const lessWork = earlier >= 0.75 && ratio <= DROP_RATIO && ratio < overall * 0.75;
    const weaker = strength <= STRENGTH_DROP;
    if (!lessWork && !weaker) continue;
    const reason = lessWork
      ? `${muscle} went from ${fmtNum(Math.round(earlier * 10) / 10)} to ${fmtNum(Math.round(recent * 10) / 10)} exercises a week.`
      : `Weights for ${muscle.toLowerCase()} are about ${Math.round(-strength * 100)}% below the weeks before.`;
    proposals.push({
      key: `focus:${muscle}`,
      type: 'focus',
      muscle,
      score: (1 - ratio) + -strength + (PRIORITY.includes(muscle) ? 0.5 : 0),
      title: `Slipping: ${muscle}`,
      reason: `${reason} Put it first for ${FOCUS_DAYS / 7} weeks, with one extra set?`,
      action: `Focus on ${muscle}`,
    });
  }
  return proposals.sort((a, b) => b.score - a.score);
}

/** At most one proposal of each kind, so the start screen stays calm. */
export function coachSuggestions({ schema, exercises, setsByEx, today = localDate() }) {
  if (!schema?.days?.length) return [];
  const snoozed = schema.snoozed ?? {};
  const open = (p) => !(snoozed[p.key] && snoozed[p.key] >= today);
  const context = { schema, exercises, setsByEx, today };
  return [focusProposal(context).find(open), swapProposal(context).find(open)].filter(Boolean);
}

export const snoozeUntil = (today = localDate()) => addDays(today, SNOOZE_DAYS);
export const focusUntil = (today = localDate()) => addDays(today, FOCUS_DAYS);

/** Replaces an exercise everywhere in the plan. The old one stays available as an alternative. */
export function swapInPlan(schema, from, to) {
  for (const day of schema.days) {
    for (const item of day.items) {
      if (item.exerciseId !== from) continue;
      item.exerciseId = to;
      item.alt = [from, ...(item.alt ?? []).filter((id) => id !== to && id !== from)];
      delete item.hint;
    }
  }
  return schema;
}

/** During a focus, that muscle group moves up right after the "always first" work and gets one extra set. */
export function applyFocus(items, focus, exercises, today = localDate()) {
  if (!focus || focus.until < today) return items;
  const isFocus = (it) => exercises.get(it.exerciseId)?.muscle === focus.muscle;
  const firsts = items.filter((it) => it.first);
  const focused = items.filter((it) => !it.first && isFocus(it));
  const rest = items.filter((it) => !it.first && !isFocus(it));
  let boosted = false;
  return [...firsts, ...focused, ...rest].map((it) => {
    if (boosted || !isFocus(it) || !it.sets) return it;
    boosted = true;
    return { ...it, sets: it.sets + 1 };
  });
}
