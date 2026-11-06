import * as db from './db.js';
import { buildBackup, fetchBackup, pushBackup, validateBackup } from './backup.js';
import { drawLineChart } from './chart.js';
import { bodyMap, combineMuscles, GROUP_MUSCLES, MUSCLE_NAMES, setBodyStyle } from './body.js';
import { applyFocus, coachSuggestions, focusUntil, snoozeUntil, swapInPlan } from './coach.js';
import { buildDemo } from './demo.js';
import { EXERCISES, PLAN } from './plan.js';
import { DONE_NO_PR, DONE_WITH_PR, DROP_LINES, pickStable, PR_LINES, SAME_LINES } from './humor.js';
import {
  alternatives, compareTop, daysBetween, DEFAULT_STEP, fmtDate, fmtDateLong, fmtKg, fmtMonth, fmtNum, fmtRange, fmtRelative,
  groupSessions, localDate, METRICS, MUSCLES, parseNumber, recordLabels, records, round2, series,
  sideToTotal, summarizeSets, totalToSide,
} from './logic.js';

const DEFAULT_REPO = 'JosCiv7/gymlog-backup';
const DEMO_VERSION = 3;
const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new?name=GymLog%20backup&description=GymLog%20backup&contents=write';

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
const $sheet = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');

const state = {
  exercises: new Map(),
  workouts: new Map(),
  sets: [],
  notes: [],
  schema: null,
  active: null,
  gh: { repo: DEFAULT_REPO, token: '', lastAt: null, lastError: null },
  dirty: false,
  demo: false,
  onboarded: false,
  humor: true,
  figure: 'toon',
  setsByEx: new Map(),
  draft: { weight: 0, reps: 8 },
  draftKey: '',
  extra: false,
  fresh: null,
  edit: null,
  historyLimit: 30,
  exQuery: '',
  exMuscle: '',
  chart: { metric: 'heaviest', range: '1y' },
  backingUp: false,
  installEvent: null,
  persisted: null,
};

// ---------- Helpers ----------

const h = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
const exName = (id) => state.exercises.get(id)?.name ?? 'Unknown exercise';
const exStep = (id) => state.exercises.get(id)?.step ?? DEFAULT_STEP;
/** Bar weight when this exercise is entered per side, otherwise null. */
const barOf = (id) => {
  const ex = state.exercises.get(id);
  return ex?.perSide ? ex.bar ?? 20 : null;
};
const isCardio = (id) => state.exercises.get(id)?.kind === 'cardio';
const musclesOf = (id) => {
  const ex = state.exercises.get(id);
  return ex?.primary ? ex : GROUP_MUSCLES[ex?.muscle] ?? {};
};
const dayMuscles = (day) => combineMuscles(day.items.map((it) => musclesOf(it.exerciseId)));
const repText = (it) => it.repText ?? fmtRange(it.repMin, it.repMax);
const planText = (it) => (it.sets > 1 ? `${it.sets} × ${repText(it)}` : repText(it));

/** One logged line in plain text. */
function line(s) {
  if (isCardio(s.exerciseId)) return `${s.reps} min`;
  return `${s.weight > 0 ? fmtKg(s.weight) : 'Bodyweight'} × ${s.reps}`;
}

function setValue(s) {
  if (isCardio(s.exerciseId)) return `${s.reps} min`;
  return `${s.weight > 0 ? h(fmtKg(s.weight)) : 'Bodyweight'} <em>×</em> ${s.reps}`;
}

const summary = (sets) => (sets.length && isCardio(sets[0].exerciseId) ? sets.map(line).join(', ') : summarizeSets(sets));

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const icon = (name) => {
  const paths = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    up: '<path d="M12 20V5M5.5 11.5L12 5l6.5 6.5"/>',
    same: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    note: '<path d="M5 4h14v11l-5 5H5zM14 20v-5h5"/>',
    swap: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    train: '<path d="M2.5 12h19M6 7v10M3.5 9v6M18 7v10M20.5 9v6"/>',
    history: '<path d="M4 5h16v16H4zM4 10h16M9 3v4M15 3v4"/>',
    chart: '<path d="M4 4v16h16M8 15l3.5-4 3 2.5L20 7"/>',
    gear: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    trophy: '<path d="M7 4h10v6a5 5 0 01-10 0zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M12 15v4M8 20h8"/>',
    warn: '<path d="M12 4l9 16H3zM12 10v4M12 17h.01"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
};

let toastTimer;
function toast(message, kind = '') {
  $toast.textContent = message;
  $toast.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.className = ''; }, 2600);
}

function buzz(ms = 15) {
  navigator.vibrate?.(ms);
}

function reindex() {
  state.setsByEx = new Map();
  state.sets.sort((a, b) => a.ts - b.ts);
  for (const s of state.sets) {
    if (!state.setsByEx.has(s.exerciseId)) state.setsByEx.set(s.exerciseId, []);
    state.setsByEx.get(s.exerciseId).push(s);
  }
}

const setsOf = (exerciseId) => state.setsByEx.get(exerciseId) ?? [];
const setsIn = (workoutId, exerciseId) => setsOf(exerciseId).filter((s) => s.workoutId === workoutId);

function lastDates() {
  const map = new Map();
  for (const [id, list] of state.setsByEx) {
    map.set(id, list.reduce((d, s) => (s.date > d ? s.date : d), ''));
  }
  return map;
}

function latestNote(exerciseId) {
  return state.notes
    .filter((n) => n.exerciseId === exerciseId)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

// ---------- Storage ----------

async function loadAll() {
  const [exercises, workouts, sets, notes] = await Promise.all(
    ['exercises', 'workouts', 'sets', 'notes'].map((s) => db.getAll(s)),
  );
  state.exercises = new Map(exercises.map((e) => [e.id, e]));
  state.workouts = new Map(workouts.map((w) => [w.id, w]));
  state.sets = sets;
  state.notes = notes;
  state.schema = await db.getMeta('schema');
  state.active = await db.getMeta('active');
  state.gh = { ...state.gh, ...(await db.getMeta('gh', {})) };
  state.dirty = await db.getMeta('dirty', false);
  state.demo = await db.getMeta('demo', false);
  state.onboarded = await db.getMeta('onboarded', false);
  state.humor = await db.getMeta('humor', true);
  state.figure = await db.getMeta('figure', 'toon');
  setBodyStyle(state.figure);
  reindex();
}

async function replaceData({ exercises, workouts, sets, notes, schema }, { demo }) {
  await db.clearData(['schema', 'active']);
  await Promise.all([
    db.putMany('exercises', exercises),
    db.putMany('workouts', workouts),
    db.putMany('sets', sets),
    db.putMany('notes', notes),
  ]);
  if (schema) await db.setMeta('schema', schema);
  await db.setMeta('demo', demo);
  await db.setMeta('onboarded', true);
  state.draftKey = '';
  await loadAll();
}

const saveActive = () => db.setMeta('active', state.active);
const saveGh = () => db.setMeta('gh', state.gh);

function markDirty() {
  state.dirty = true;
  db.setMeta('dirty', true);
}

let backupTimer;
function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => { if (!state.active) runBackup(); }, 8000);
}

const backupReady = () => Boolean(state.gh.token && state.gh.repo && !state.demo);

async function runBackup({ force = false } = {}) {
  if (!backupReady() || state.backingUp || !state.sets.length || (!state.dirty && !force)) return;
  if (!navigator.onLine) return;
  state.backingUp = true;
  try {
    const { exercises, workouts, sets, notes, schema } = state;
    await pushBackup(state.gh, buildBackup({
      exercises: [...exercises.values()], workouts: [...workouts.values()], sets, notes, schema,
    }));
    state.gh.lastAt = Date.now();
    state.gh.lastError = null;
    state.dirty = false;
    await db.setMeta('dirty', false);
  } catch (err) {
    state.gh.lastError = err.message === 'Failed to fetch' ? 'No connection to GitHub.' : err.message;
  } finally {
    state.backingUp = false;
    await saveGh();
    const status = document.querySelector('[data-backup-status]');
    if (status) status.outerHTML = backupStatus();
  }
}

function backupStatus() {
  let cls = 'warn';
  let text = 'Backup not set up yet';
  if (state.demo) {
    cls = '';
    text = 'Sample data is not backed up';
  } else if (state.gh.token && state.gh.lastError) {
    text = `Backup failed: ${state.gh.lastError}`;
  } else if (state.gh.token && state.gh.lastAt) {
    const date = new Date(state.gh.lastAt);
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
    cls = 'ok';
    text = `Last backup: ${fmtRelative(localDate(date))}, ${time}`;
  } else if (state.gh.token) {
    cls = '';
    text = 'Backup waits for your first workout';
  }
  return `<a class="backup ${cls}" href="#/settings" data-backup-status>${cls === 'warn' ? icon('warn') : ''}${h(text)}</a>`;
}

// ---------- Sheets and confirmation ----------

let sheetOpen = false;
let sheetAfterClose = null;
let pendingClose = null;

function openSheet(html) {
  clearTimeout(sheetClearTimer);
  $sheet.classList.remove('closing');
  $sheet.innerHTML = `<div class="scrim" data-a="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  if (!sheetOpen) {
    sheetOpen = true;
    history.pushState({ sheet: true }, '');
  }
  document.body.classList.add('locked');
}

let sheetClearTimer;

function hideSheet() {
  sheetOpen = false;
  // Let the sheet slide away before it is removed.
  $sheet.classList.add('closing');
  clearTimeout(sheetClearTimer);
  sheetClearTimer = setTimeout(() => {
    $sheet.innerHTML = '';
    $sheet.classList.remove('closing');
  }, 180);
  document.body.classList.remove('locked');
  sheetAfterClose?.();
  sheetAfterClose = null;
}

function closeSheet() {
  if (!sheetOpen) return Promise.resolve();
  return new Promise((resolve) => {
    pendingClose = resolve;
    history.back();
  });
}

window.addEventListener('popstate', () => {
  if (sheetOpen) hideSheet();
  pendingClose?.();
  pendingClose = null;
});

function ask({ title, body = '', confirm, danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    openSheet(`
      <h2>${h(title)}</h2>
      ${body ? `<p class="muted">${h(body)}</p>` : ''}
      <div class="sheet-actions">
        <button class="btn ghost" data-a="askNo">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-a="askYes">${h(confirm)}</button>
      </div>`);
    A.askYes = async () => { answer = true; await closeSheet(); };
    A.askNo = () => closeSheet();
    sheetAfterClose = () => resolve(answer);
  });
}

// ---------- Workout plan ----------

function currentItem() {
  return state.active?.items[state.active.idx] ?? null;
}

function pastSessions(item) {
  return groupSessions(setsOf(item.exerciseId).filter((s) => s.workoutId !== state.active.id));
}

function ensureDraft() {
  const item = currentItem();
  if (!item) return;
  const done = setsIn(state.active.id, item.exerciseId);
  const key = `${state.active.id}:${state.active.idx}:${item.exerciseId}:${done.length}`;
  if (key === state.draftKey) return;
  state.draftKey = key;
  // Most exercises get one line: the top set. Start from today's last line,
  // otherwise from the heaviest line of last time. You decide what changes.
  const lastSets = pastSessions(item)[0]?.sets ?? [];
  const top = lastSets.reduce((best, s) => (!best || s.weight >= best.weight ? s : best), null);
  const start = done[done.length - 1] ?? top;
  state.draft = {
    weight: start?.weight ?? barOf(item.exerciseId) ?? 0,
    reps: start?.reps ?? item.repMin ?? 8,
  };
}

function planItem(it) {
  return { ...it, key: uid(), alt: it.alt ?? [] };
}

// ---------- Screens ----------

function viewWelcome() {
  return `
    <section class="welcome">
      <img class="logo" src="icons/icon-192.png" alt="" width="96" height="96">
      <h1>GymLog</h1>
      <p>Your workouts are ready, you pick one each time, and your data stays on your phone.</p>
      <button class="btn primary big" data-a="loadPlan">Start with my plan</button>
      <button class="btn ghost big" data-a="loadDemo">Try it with sample history</button>
    </section>`;
}

function demoBanner() {
  return state.demo
    ? `<a class="banner" href="#/settings"><strong>Sample history.</strong> Your plan is real, the numbers are not. Anything you log now disappears when you import.</a>`
    : '';
}

function previewRows(day) {
  const row = (it) => `<li><span>${h(exName(it.exerciseId))}</span><span class="num">${h(planText(it))}</span></li>`;
  const firsts = day.items.filter((it) => it.first);
  if (!firsts.length) return day.items.map(row).join('');
  const rest = day.items.filter((it) => !it.first);
  return `<li class="group">Always first</li>${firsts.map(row).join('')}<li class="group">Then in any order</li>${rest.map(row).join('')}`;
}

function coachCards() {
  return coachSuggestions({ schema: state.schema, exercises: state.exercises, setsByEx: state.setsByEx }).map((p) => `
    <section class="coach">
      <div class="eyebrow">Coach</div>
      <h2>${h(p.title)}</h2>
      <p>${h(p.reason)}</p>
      <div class="coach-actions">
        <button class="btn ghost small" data-a="coachLater" data-id="${h(p.key)}">Not now</button>
        <button class="btn primary small" data-a="coachApply" data-id="${h(p.key)}">${h(p.action)}</button>
      </div>
    </section>`).join('');
}

function focusStrip() {
  const focus = state.schema?.focus;
  if (!focus || focus.until < localDate()) return '';
  return `
    <div class="focus-strip">
      <span><strong>Focus: ${h(focus.muscle)}</strong> until ${h(fmtDate(focus.until))}</span>
      <button class="link" data-a="stopFocus">Stop</button>
    </div>`;
}

function dayHasFocus(day) {
  const focus = state.schema?.focus;
  return Boolean(focus && focus.until >= localDate() && day.items.some((it) => state.exercises.get(it.exerciseId)?.muscle === focus.muscle));
}

async function savePlan() {
  await db.setMeta('schema', state.schema);
  markDirty();
  scheduleBackup();
}

function workoutsThisWeek() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const start = localDate(monday);
  return [...state.workouts.values()].filter((w) => w.finishedAt && w.date >= start).length;
}

function viewHome() {
  const workouts = [...state.workouts.values()];
  const lastByDay = new Map();
  for (const w of workouts) {
    if (w.finishedAt && (!lastByDay.has(w.dayId) || w.date > lastByDay.get(w.dayId))) lastByDay.set(w.dayId, w.date);
  }
  const lastLabel = (id) => (lastByDay.has(id) ? fmtRelative(lastByDay.get(id)) : 'not done yet');
  const week = workoutsThisWeek();

  if (state.active) {
    const done = state.sets.filter((s) => s.workoutId === state.active.id).length;
    return `
      <main class="page">
        ${demoBanner()}
        <section class="hero">
          <div class="eyebrow">In progress since ${h(fmtDate(state.active.date))}</div>
          <h1>${h(state.active.dayName)}</h1>
          <p class="muted">${plural(done, 'set', 'sets')} logged</p>
          <a class="btn primary big" href="#/training">Continue workout ${icon('next')}</a>
        </section>
        <div class="foot">${backupStatus()}</div>
      </main>`;
  }

  const days = state.schema?.days ?? [];
  return `
    <main class="page">
      ${demoBanner()}
      <h1 class="title">What's today?</h1>
      <p class="week-line">${week === 0 ? 'No workouts yet this week' : `${plural(week, 'workout', 'workouts')} this week`}</p>
      ${focusStrip()}
      ${coachCards()}
      ${days.length ? `
        <div class="day-grid">
          ${days.map((d) => `
            <button class="day-card" data-a="previewDay" data-id="${h(d.id)}">
              ${bodyMap(dayMuscles(d))}
              <strong>${h(d.name)}</strong>
              <small>${dayHasFocus(d) ? `Focus · ${h(lastLabel(d.id))}` : h(lastLabel(d.id))}</small>
            </button>`).join('')}
          <button class="day-card free" data-a="startFree">
            ${icon('plus')}
            <strong>Free workout</strong>
            <small>Pick as you go</small>
          </button>
        </div>` : `
        <button class="btn primary big" data-a="loadPlan">Load my plan</button>
        <button class="btn ghost big" data-a="startFree">Start a free workout</button>`}
      <div class="foot">${backupStatus()}</div>
    </main>`;
}

function totalHint(total, bar) {
  return bar > 0 ? `= ${fmtKg(total)} total, with ${fmtKg(bar)} bar` : `= ${fmtKg(total)} total`;
}

function stepper(kind, label, value, target, exerciseId) {
  const bar = kind === 'weight' ? barOf(exerciseId) : null;
  const perSide = bar !== null;
  const cardio = isCardio(exerciseId);
  const unit = cardio ? 'min' : kind === 'weight' ? (perSide ? 'kg/side' : 'kg') : 'reps';
  if (cardio) label = 'How long';
  if (perSide) {
    label = 'Weight per side';
    value = totalToSide(value, bar);
  }
  const hintValue = perSide ? sideToTotal(value, bar) : 0;
  return `
    <div class="stepper">
      <label for="f-${target}-${kind}">${label}${perSide ? ` <strong class="side-total" data-total="${target}">${h(totalHint(hintValue, bar))}</strong>` : ''}</label>
      <div class="stepper-row">
        <button class="step" data-a="step" data-kind="${kind}" data-dir="-1" data-target="${target}" aria-label="Decrease ${label}">${icon('minus')}</button>
        <div class="step-value">
          <input id="f-${target}-${kind}" data-field="${kind}" data-target="${target}" inputmode="${kind === 'weight' ? 'decimal' : 'numeric'}" autocomplete="off" value="${h(fmtNum(value))}">
          <span>${unit}</span>
        </div>
        <button class="step" data-a="step" data-kind="${kind}" data-dir="1" data-target="${target}" aria-label="Increase ${label}">${icon('plus')}</button>
      </div>
    </div>`;
}

function historyCard(sessions, exerciseId) {
  if (!sessions.length) return '<p class="hist-empty">First time you log this exercise.</p>';
  return `
    <a class="hist" href="#/exercises/${h(exerciseId)}" aria-label="Full history">
      ${sessions.slice(0, 3).map((s, i) => `
        <div class="hist-row ${i === 0 ? 'latest' : ''}">
          <span>${h(fmtRelative(s.date))}</span>
          <strong>${h(summary(s.sets))}</strong>
        </div>`).join('')}
    </a>`;
}

/** A quiet line under the logged sets. It follows all of today's lines, so a heavier second line changes it. */
function quip(item, done, past) {
  if (!state.humor || !done.length) return '';
  const seed = done[done.length - 1].id;
  const broke = done.some((s) => recordLabels(s, setsOf(s.exerciseId).filter((o) => o.ts < s.ts)).length);
  if (broke) return `<p class="quip pr-line">${h(pickStable(PR_LINES, seed))}</p>`;
  if (isCardio(item.exerciseId)) return '';
  const verdict = compareTop(done, past[0]?.sets ?? []);
  const line = verdict === 'down' ? pickStable(DROP_LINES, seed) : verdict === 'same' ? pickStable(SAME_LINES, seed) : null;
  return line ? `<p class="quip">${h(line)}</p>` : '';
}

function viewWorkout() {
  const a = state.active;
  if (!a) return viewHome();
  const total = a.items.length;

  if (!total) {
    return `
      ${workoutTop(a, 'No exercise yet')}
      <main class="page wk">
        <section class="hero">
          <h1>Pick your first exercise</h1>
          <button class="btn primary big" data-a="addExercise">Add exercise</button>
        </section>
      </main>
      <div class="actionbar"><button class="btn ghost big" data-a="finish">Stop workout</button></div>`;
  }

  const item = currentItem();
  ensureDraft();
  const ex = state.exercises.get(item.exerciseId);
  const done = setsIn(a.id, item.exerciseId);
  const past = pastSessions(item);
  const planned = item.sets || 0;
  const free = !planned;
  const complete = done.length > 0 && !state.extra;
  const note = latestNote(item.exerciseId);

  const rows = done.map((s, i) => {
    const prior = setsOf(s.exerciseId).filter((o) => o.ts < s.ts);
    const isRecord = recordLabels(s, prior).length > 0;
    return `
      <li>
        <button class="set done ${s.id === state.fresh ? 'fresh' : ''}" data-a="editSet" data-id="${h(s.id)}" aria-label="Edit set ${i + 1}">
          <span class="set-n">${i + 1}</span>
          <span class="set-v">${setValue(s)}</span>
          ${isRecord ? `<span class="pr">${icon('trophy')}Record</span>` : ''}
          <span class="set-check">${icon('check')}</span>
        </button>
      </li>`;
  });

  const atLast = a.idx === total - 1;
  let primary;
  if (!complete) {
    primary = `<button class="btn primary big log" data-a="logSet" data-log-label>${logLabel()}</button>`;
  } else if (!atLast) {
    primary = `<button class="btn primary big" data-a="nextEx">Next exercise ${icon('next')}</button>`;
  } else {
    primary = `<button class="btn primary big" data-a="finish">Finish workout ${icon('check')}</button>`;
  }

  return `
    ${workoutTop(a, `Exercise ${a.idx + 1} of ${total}`)}
    <main class="page wk">
      <section class="wk-head">
        <div class="wk-text">
          <div class="eyebrow">${free ? 'Free exercise' : eyebrow(item)}</div>
          <h1>${h(ex.name)}</h1>
          ${item.hint ? `<p class="hint">${h(item.hint)}</p>` : ''}
          ${item.replaces ? `<p class="swapped">Instead of ${h(exName(item.replaces))} <button class="link" data-a="undoSwap">Undo</button></p>` : ''}
        </div>
        <button class="wk-body" data-a="showMuscles" data-id="${h(ex.id)}" aria-label="Muscles worked">${bodyMap(musclesOf(ex.id))}</button>
        <div class="wk-tools">
          <button class="chip strong" data-a="busy">${icon('swap')}${isCardio(item.exerciseId) ? 'Other type' : 'Busy'}</button>
          <button class="chip" data-a="note">${icon('note')}${note ? 'Edit note' : 'Note'}</button>
        </div>
        ${note ? `<p class="note-line"><span>${h(fmtDate(note.date))}</span> ${h(note.text)}</p>` : ''}
      </section>
      ${historyCard(past, item.exerciseId)}
      ${rows.length ? `<ol class="setlist">${rows.join('')}</ol>` : ''}
      ${complete ? quip(item, done, past) : ''}
      ${complete ? `<button class="btn ghost big" data-a="extraSet">${icon('plus')}${isCardio(item.exerciseId) ? 'Log another session' : 'Log another set'}</button>` : `
        <div class="editor">
          ${isCardio(item.exerciseId) ? '' : stepper('weight', 'Weight', state.draft.weight, 'draft', item.exerciseId)}
          ${stepper('reps', 'Reps', state.draft.reps, 'draft', item.exerciseId)}
        </div>`}
    </main>
    <div class="actionbar">
      <button class="btn ghost square" data-a="prevEx" aria-label="Previous exercise" ${a.idx === 0 ? 'disabled' : ''}>${icon('back')}</button>
      ${primary}
      <button class="btn ghost square" data-a="nextEx" aria-label="Next exercise" ${atLast ? 'disabled' : ''}>${icon('next')}</button>
    </div>`;
}

function eyebrow(item) {
  if (isCardio(item.exerciseId)) return 'Conditioning';
  const parts = [item.first ? 'Always first' : '', `${item.sets} sets · ${h(repText(item))} reps`, item.rest ?? ''];
  return parts.filter(Boolean).join(' · ').replace(/per (side|leg) reps/, 'per $1');
}

function workoutTop(a, subtitle) {
  const steps = a.items.map((it, i) => {
    const cls = i === a.idx ? 'now' : setsIn(a.id, it.exerciseId).length ? 'done' : '';
    return `<i class="${cls}"></i>`;
  }).join('');
  return `
    <header class="wk-top">
      <div class="wk-bar">
        <a class="icon-btn" href="#/" aria-label="To start">${icon('back')}</a>
        <div class="wk-title"><strong>${h(a.dayName)}</strong><small>${h(subtitle)}</small></div>
        <button class="icon-btn" data-a="overview" aria-label="Workout overview">${icon('list')}</button>
      </div>
      ${a.items.length > 1 ? `<div class="wk-progress" aria-hidden="true">${steps}</div>` : ''}
    </header>`;
}

function muscleCard(id) {
  const m = musclesOf(id);
  const names = (list = []) => list.map((k) => MUSCLE_NAMES[k]).join(', ');
  return `
    <section class="card muscle-card">
      ${bodyMap(m)}
      <div class="legend">
        ${m.primary?.length ? `<div><h3><i class="key"></i>Main muscles</h3><p>${h(names(m.primary))}</p></div>` : ''}
        ${m.secondary?.length ? `<div><h3><i class="key s"></i>Also working</h3><p>${h(names(m.secondary))}</p></div>` : ''}
      </div>
    </section>`;
}

function logLabel() {
  const { weight, reps } = state.draft;
  const exerciseId = currentItem()?.exerciseId;
  return `${isCardio(exerciseId) ? 'Log session' : 'Log set'}<small>${h(line({ exerciseId, weight, reps }))}</small>`;
}

function viewDone(id) {
  const w = state.workouts.get(id);
  if (!w) return viewHome();
  const sets = state.sets.filter((s) => s.workoutId === id);
  const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
  const volume = sets.reduce((sum, s) => sum + (isCardio(s.exerciseId) ? 0 : s.weight * s.reps), 0);
  const prs = sets.flatMap((s) => {
    const prior = setsOf(s.exerciseId).filter((o) => o.ts < s.ts);
    return recordLabels(s, prior).map((label) => ({ ...s, label }));
  });
  // Show one record per exercise: the last set that broke one.
  const best = new Map(prs.map((p) => [p.exerciseId, p]));
  return `
    <main class="page done">
      <div class="done-mark">${icon('check')}</div>
      <h1>${h(w.dayName)} finished</h1>
      ${state.humor ? `<p class="quip left">${h(pickStable(best.size ? DONE_WITH_PR : DONE_NO_PR, id))}</p>` : ''}
      <p class="muted">${h(fmtDateLong(w.date))}</p>
      <div class="tiles">
        <div class="tile"><strong>${exerciseIds.length}</strong><span>${exerciseIds.length === 1 ? 'exercise' : 'exercises'}</span></div>
        <div class="tile"><strong>${sets.length}</strong><span>${sets.length === 1 ? 'set' : 'sets'}</span></div>
        ${volume > 0 ? `<div class="tile"><strong>${fmtNum(Math.round(volume))}</strong><span>kg total</span></div>` : ''}
      </div>
      ${best.size ? `
        <h2 class="section">${icon('trophy')}New records</h2>
        <div class="rows">
          ${[...best.values()].map((p) => `
            <a class="row" href="#/exercises/${h(p.exerciseId)}">
              <span class="row-main"><strong>${h(exName(p.exerciseId))}</strong><small>${h(isCardio(p.exerciseId) ? 'Longest session' : p.label)}: ${h(line(p))}</small></span>${icon('next')}
            </a>`).join('')}
        </div>` : ''}
      <div class="foot">${backupStatus()}</div>
      <a class="btn primary big" href="#/">Done</a>
    </main>`;
}

function viewHistory() {
  const workouts = [...state.workouts.values()]
    .filter((w) => w.finishedAt)
    .sort((a, b) => b.startedAt - a.startedAt);
  const counts = new Map();
  const exercisesPer = new Map();
  for (const s of state.sets) {
    counts.set(s.workoutId, (counts.get(s.workoutId) ?? 0) + 1);
    if (!exercisesPer.has(s.workoutId)) exercisesPer.set(s.workoutId, new Set());
    exercisesPer.get(s.workoutId).add(s.exerciseId);
  }

  let month = '';
  const rows = [];
  for (const w of workouts.slice(0, state.historyLimit)) {
    const m = w.date.slice(0, 7);
    if (m !== month) {
      if (month) rows.push('</div>');
      rows.push(`<h2 class="section">${h(fmtMonth(w.date))}</h2><div class="rows">`);
      month = m;
    }
    rows.push(`
      <a class="row" href="#/history/${h(w.id)}">
        <span class="row-date"><strong>${h(w.date.slice(8, 10))}</strong></span>
        <span class="row-main"><strong>${h(w.dayName)}</strong><small>${plural(exercisesPer.get(w.id)?.size ?? 0, 'exercise', 'exercises')} · ${plural(counts.get(w.id) ?? 0, 'set', 'sets')}</small></span>
        ${icon('next')}
      </a>`);
  }
  if (month) rows.push('</div>');

  return `
    <main class="page">
      <h1 class="title">History</h1>
      ${workouts.length ? rows.join('') : '<p class="empty">No workouts yet. Finish one and it shows up here.</p>'}
      ${workouts.length > state.historyLimit ? '<button class="btn ghost big more" data-a="moreHistory">Show more</button>' : ''}
    </main>`;
}

function viewWorkoutDetail(id) {
  const w = state.workouts.get(id);
  if (!w) return viewHistory();
  const sets = state.sets.filter((s) => s.workoutId === id);
  const groups = new Map();
  for (const s of sets) {
    if (!groups.has(s.exerciseId)) groups.set(s.exerciseId, []);
    groups.get(s.exerciseId).push(s);
  }
  return `
    <main class="page">
      <header class="subhead">
        <a class="icon-btn" href="#/history" aria-label="Back">${icon('back')}</a>
        <div><h1>${h(w.dayName)}</h1><p class="muted">${h(fmtDateLong(w.date))}</p></div>
      </header>
      ${[...groups.entries()].map(([exId, list]) => `
        <section class="card">
          <h2><a href="#/exercises/${h(exId)}">${h(exName(exId))}</a></h2>
          <ol class="setlist compact">
            ${list.map((s, i) => `
              <li><button class="set done" data-a="editSet" data-id="${h(s.id)}">
                <span class="set-n">${i + 1}</span>
                <span class="set-v">${setValue(s)}</span>
              </button></li>`).join('')}
          </ol>
        </section>`).join('') || '<p class="empty">No sets in this workout.</p>'}
      <button class="btn ghost-danger big more" data-a="deleteWorkout" data-id="${h(id)}">Delete workout</button>
    </main>`;
}

function exerciseRows() {
  const last = lastDates();
  const q = state.exQuery.trim().toLowerCase();
  const list = [...state.exercises.values()]
    .filter((e) => (!state.exMuscle || e.muscle === state.exMuscle) && (!q || e.name.toLowerCase().includes(q)))
    .sort((a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? '') || a.name.localeCompare(b.name));
  if (!list.length) return '<p class="empty">No exercises found.</p>';
  return `<div class="rows">${list.map((e) => `
    <a class="row" href="#/exercises/${h(e.id)}">
      <span class="row-main"><strong>${h(e.name)}</strong><small>${h(e.muscle)}${last.get(e.id) ? ` · ${h(fmtRelative(last.get(e.id)))}` : ''}</small></span>${icon('next')}
    </a>`).join('')}</div>`;
}

function viewExercises() {
  const used = MUSCLES.filter((m) => [...state.exercises.values()].some((e) => e.muscle === m));
  return `
    <main class="page">
      <h1 class="title">Exercises</h1>
      <input class="search" type="search" data-field="exQuery" placeholder="Search exercises" value="${h(state.exQuery)}" aria-label="Search exercises">
      <div class="chips scroll">
        <button class="chip ${state.exMuscle ? '' : 'on'}" data-a="filterMuscle" data-id="">All</button>
        ${used.map((m) => `<button class="chip ${state.exMuscle === m ? 'on' : ''}" data-a="filterMuscle" data-id="${h(m)}">${h(m)}</button>`).join('')}
      </div>
      <div id="ex-list">${exerciseRows()}</div>
      <button class="btn ghost big more" data-a="newExercise">${icon('plus')}New exercise</button>
    </main>`;
}

function viewExerciseDetail(id) {
  const ex = state.exercises.get(id);
  if (!ex) return viewExercises();
  const sets = setsOf(id);
  const rec = records(sets);
  const sessions = groupSessions(sets);
  const notes = state.notes.filter((n) => n.exerciseId === id).sort((a, b) => b.date.localeCompare(a.date));
  const bodyweight = !rec.heaviest && sets.length > 0;
  const cardio = ex.kind === 'cardio';
  const metricKeys = bodyweight ? ['reps'] : ['heaviest', 'e1rm'];
  if (!metricKeys.includes(state.chart.metric)) state.chart.metric = metricKeys[0];

  const tile = (value, label, sub) => `<div class="tile"><strong>${value}</strong><span>${label}</span>${sub ? `<small>${h(sub)}</small>` : ''}</div>`;
  const tiles = [
    rec.heaviest ? tile(fmtNum(rec.heaviest.weight), 'kg heaviest', `× ${rec.heaviest.reps}, ${fmtRelative(rec.heaviest.date)}`) : '',
    rec.best ? tile(fmtNum(Math.round(rec.best.value)), 'kg est. max', `${fmtKg(rec.best.weight)} × ${rec.best.reps}`) : '',
    bodyweight ? tile(rec.mostReps.reps, cardio ? 'min longest' : 'most reps', fmtRelative(rec.mostReps.date)) : '',
    tile(sessions.length, sessions.length === 1 ? 'workout' : 'workouts', sessions[0] ? `last ${fmtRelative(sessions[0].date)}` : ''),
  ].join('');

  return `
    <main class="page">
      <header class="subhead">
        <a class="icon-btn" href="#/exercises" aria-label="Back">${icon('back')}</a>
        <div><h1>${h(ex.name)}</h1><p class="muted">${h(ex.muscle)} · ${cardio ? `steps of ${h(fmtNum(ex.step))} min` : ex.perSide ? `steps of ${h(fmtKg(ex.step))} per side${ex.bar > 0 ? `, ${h(fmtKg(ex.bar))} bar` : ''}` : `steps of ${h(fmtKg(ex.step))}`}</p></div>
        <button class="icon-btn" data-a="editExercise" data-id="${h(id)}" aria-label="Edit exercise">${icon('gear')}</button>
      </header>
      ${muscleCard(id)}
      ${sets.length ? `
        <div class="tiles">${tiles}</div>
        <section class="card">
          <div class="chart-head">
            ${metricKeys.length > 1 ? `<div class="seg">${metricKeys.map((k) => `<button class="${state.chart.metric === k ? 'on' : ''}" data-a="chartMetric" data-id="${k}">${METRICS[k].label}</button>`).join('')}</div>` : `<h2>${cardio ? 'Minutes' : METRICS[metricKeys[0]].label}</h2>`}
          </div>
          <div id="chart" data-ex="${h(id)}"></div>
          <div class="chips">
            ${[['6m', '6 months'], ['1y', '1 year'], ['all', 'All']].map(([k, label]) => `<button class="chip small ${state.chart.range === k ? 'on' : ''}" data-a="chartRange" data-id="${k}">${label}</button>`).join('')}
          </div>
        </section>` : '<p class="empty">No sets for this exercise yet.</p>'}
      ${notes.length ? `
        <h2 class="section">Notes</h2>
        <div class="rows">
          ${notes.slice(0, 10).map((n) => `<div class="row static"><span class="row-main"><strong>${h(n.text)}</strong><small>${h(fmtDate(n.date))}</small></span></div>`).join('')}
        </div>` : ''}
      ${sessions.length ? `
        <h2 class="section">Workouts</h2>
        <div class="rows">
          ${sessions.slice(0, 30).map((s) => `<div class="row static"><span class="row-main"><strong class="num">${h(summary(s.sets))}</strong><small>${h(fmtDate(s.date))}</small></span></div>`).join('')}
        </div>` : ''}
    </main>`;
}

function viewSettings() {
  const hasToken = Boolean(state.gh.token);
  const installed = matchMedia('(display-mode: standalone)').matches;
  return `
    <main class="page">
      <h1 class="title">Settings</h1>

      ${state.demo ? `
        <section class="card callout">
          <h2>You're testing with sample history</h2>
          <p class="muted">The numbers are made up. Clear them when you're done.</p>
          <button class="btn ghost-danger" data-a="clearAll">Clear sample history</button>
        </section>` : ''}

      <section class="card">
        <h2>On your phone</h2>
        <p class="status-line">${installed ? `${icon('check')}Installed as an app` : 'Not installed as an app yet'}</p>
        <p class="status-line">${state.persisted === false ? `${icon('warn')}Android may clear your data when space runs low. Install the app to avoid that.` : `${icon('check')}Protected storage is on`}</p>
        ${!installed && state.installEvent ? '<button class="btn primary" data-a="install">Install app</button>' : ''}
        ${!installed && !state.installEvent ? '<p class="muted">Open the three-dot menu in Chrome and choose "Install app" or "Add to Home screen".</p>' : ''}
      </section>

      <section class="card">
        <h2>Appearance</h2>
        <div class="seg">
          ${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, label]) => `<button class="${window.gymTheme.get() === k ? 'on' : ''}" data-a="setTheme" data-id="${k}">${label}</button>`).join('')}
        </div>
        <p class="muted">Auto follows your phone. Light is used when your phone has no preference.</p>
      </section>

      ${state.schema?.changes?.length ? `
        <section class="card">
          <h2>Plan changes</h2>
          <div class="change-list">
            ${state.schema.changes.map((c, i) => `
              <div class="change">
                <span><strong>${h(exName(c.to))}</strong><small>instead of ${h(exName(c.from))}, ${h(fmtDate(c.date))}</small></span>
                <button class="link" data-a="undoChange" data-id="${i}">Undo</button>
              </div>`).join('')}
          </div>
        </section>` : ''}

      <section class="card">
        <h2>Muscle figure</h2>
        <div class="seg">
          ${[['toon', 'Cartoon'], ['classic', 'Classic']].map(([k, label]) => `<button class="${state.figure === k ? 'on' : ''}" data-a="setFigure" data-id="${k}">${label}</button>`).join('')}
        </div>
        ${bodyMap({ primary: ['chest', 'lats', 'quads'], secondary: ['frontDelt', 'biceps', 'hamstrings'] })}
      </section>

      <section class="card">
        <h2>Gym humor</h2>
        <label class="check"><input type="checkbox" data-field="humor" ${state.humor ? 'checked' : ''}> Small jokes after your sets</label>
      </section>

      <section class="card">
        <h2>Backup to GitHub</h2>
        <p class="muted">After each workout, your data goes to your own private repository, so you keep it if your phone disappears.</p>
        <div class="foot-inline">${backupStatus()}</div>
        ${hasToken ? `
          <p class="status-line">${icon('check')}Token saved for <strong>${h(state.gh.repo)}</strong></p>
          <div class="btn-col">
            <button class="btn primary" data-a="backupNow">Back up now</button>
            <button class="btn ghost" data-a="restoreGithub">Restore backup</button>
            <button class="btn ghost-danger" data-a="removeToken">Remove token</button>
          </div>` : `
          <label class="field">Repository
            <input id="gh-repo" value="${h(state.gh.repo)}" autocapitalize="off" autocomplete="off" spellcheck="false">
          </label>
          <label class="field">Access token
            <input id="gh-token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_...">
          </label>
          <p class="muted"><a href="${TOKEN_URL}" target="_blank" rel="noopener">Create a token on GitHub</a>. Select only the repository above, with write access to "Contents".</p>
          <button class="btn primary" data-a="saveToken">Save and test</button>`}
      </section>

      <section class="card">
        <h2>File</h2>
        <p class="muted">A copy as a file, separate from GitHub. The access token is never included.</p>
        <div class="btn-col">
          <button class="btn ghost" data-a="exportFile">Download backup</button>
          <label class="btn ghost">Restore backup from file
            <input type="file" accept="application/json,.json" data-field="restoreFile" hidden>
          </label>
        </div>
      </section>

      ${state.demo ? '' : `
        <section class="card">
          <h2>Clear everything</h2>
          <p class="muted">Removes all workouts from this phone. Your GitHub backup stays.</p>
          <button class="btn ghost-danger" data-a="clearAll">Clear everything</button>
        </section>`}
    </main>`;
}

// ---------- Rendering ----------

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] ?? '', id: parts[1] ? decodeURIComponent(parts[1]) : null };
}

function render() {
  const { name, id } = route();
  const scrollKey = `${name}/${id ?? ''}`;
  const keepScroll = render.lastKey === scrollKey;
  const y = window.scrollY;
  render.lastKey = scrollKey;

  document.body.dataset.view = name || 'start';
  let html;
  let tab = '';
  if (!state.onboarded) {
    html = viewWelcome();
  } else if (name === 'training') {
    html = viewWorkout();
  } else if (name === 'done') {
    html = viewDone(id);
  } else if (name === 'history') {
    tab = 'history';
    html = id ? viewWorkoutDetail(id) : viewHistory();
  } else if (name === 'exercises') {
    tab = 'exercises';
    html = id ? viewExerciseDetail(id) : viewExercises();
  } else if (name === 'settings') {
    tab = 'settings';
    html = viewSettings();
  } else {
    tab = 'start';
    html = viewHome();
  }
  $app.innerHTML = html;

  const inFocus = !state.onboarded || name === 'training' || name === 'done';
  $nav.hidden = inFocus;
  if (!inFocus) {
    const link = (key, href, label, ic) => `<a href="${href}" class="${tab === key ? 'on' : ''}" ${tab === key ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`;
    $nav.innerHTML = [
      link('start', '#/', 'Workout', 'train'),
      link('history', '#/history', 'History', 'history'),
      link('exercises', '#/exercises', 'Exercises', 'chart'),
      link('settings', '#/settings', 'Settings', 'gear'),
    ].join('');
  }

  drawChartIfPresent();
  window.scrollTo(0, keepScroll ? y : 0);
}

function drawChartIfPresent() {
  const el = document.getElementById('chart');
  if (!el) return;
  const { metric, range } = state.chart;
  const since = range === 'all' ? null : (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - (range === '6m' ? 6 : 12));
    return localDate(d);
  })();
  const cardio = isCardio(el.dataset.ex);
  const points = series(setsOf(el.dataset.ex), metric, since).map((p) => (cardio ? { ...p, detail: `${p.value} min` } : p));
  if (!points.length) {
    el.innerHTML = '<p class="empty small">No workouts in this period.</p>';
    return;
  }
  drawLineChart(el, points, { unit: cardio ? 'min' : METRICS[metric].unit });
}

// ---------- Actions ----------

const exerciseFor = (target) => (target === 'edit' ? state.edit.exerciseId : currentItem().exerciseId);

/** The number shown in a stepper input: per side for bar exercises, otherwise the stored value. */
function shownValue(target, field) {
  const scope = target === 'edit' ? state.edit : state.draft;
  const bar = field === 'weight' ? barOf(exerciseFor(target)) : null;
  return bar === null ? scope[field] : totalToSide(scope[field], bar);
}

function readDraftInputs(target) {
  const scope = target === 'edit' ? state.edit : state.draft;
  const bar = barOf(exerciseFor(target));
  for (const input of document.querySelectorAll(`input[data-target="${target}"]`)) {
    const n = parseNumber(input.value);
    if (n === null || n < 0) continue;
    if (input.dataset.field === 'reps') scope.reps = Math.round(n);
    else scope.weight = bar === null ? round2(n) : sideToTotal(n, bar);
  }
  return scope;
}

function syncStepperUI(target) {
  const scope = target === 'edit' ? state.edit : state.draft;
  for (const input of document.querySelectorAll(`input[data-target="${target}"]`)) {
    if (document.activeElement !== input) input.value = fmtNum(shownValue(target, input.dataset.field));
  }
  const hint = document.querySelector(`[data-total="${target}"]`);
  if (hint) hint.textContent = totalHint(scope.weight, barOf(exerciseFor(target)));
  if (target === 'draft') {
    const label = document.querySelector('[data-log-label]');
    const item = currentItem();
    if (label && item) label.innerHTML = logLabel();
  }
}

async function startWorkout(day) {
  if (state.active) {
    location.hash = '#/training';
    return;
  }
  const id = uid();
  const now = Date.now();
  const date = localDate();
  const workout = { id, date, dayId: day?.id ?? null, dayName: day?.name ?? 'Free workout', startedAt: now, finishedAt: null };
  state.workouts.set(id, workout);
  state.active = { id, date, dayId: workout.dayId, dayName: workout.dayName, idx: 0, items: applyFocus(day?.items ?? [], state.schema?.focus, state.exercises).map(planItem) };
  state.extra = false;
  state.draftKey = '';
  await Promise.all([db.put('workouts', workout), saveActive()]);
  location.hash = '#/training';
}

async function addExerciseToWorkout(exerciseId) {
  const a = state.active;
  a.items.push({ key: uid(), exerciseId, sets: 0, repMin: 0, repMax: 0, alt: [] });
  a.idx = a.items.length - 1;
  state.extra = false;
  await saveActive();
  await closeSheet();
  render();
}

function exercisePicker({ title, onlyNew = false }) {
  const body = onlyNew ? '' : `
    <input class="search" type="search" data-field="pickQuery" placeholder="Search or type a new name" aria-label="Search exercises">
    <div id="pick-list" class="rows sheet-list">${pickRows('')}</div>`;
  openSheet(`<h2>${h(title)}</h2>${body}`);
}

function pickRows(query) {
  const q = query.trim().toLowerCase();
  const last = lastDates();
  const inPlan = new Set(state.active?.items.map((i) => i.exerciseId) ?? []);
  const list = [...state.exercises.values()]
    .filter((e) => !inPlan.has(e.id) && (!q || e.name.toLowerCase().includes(q)))
    .sort((a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? ''))
    .slice(0, 30);
  const exact = [...state.exercises.values()].some((e) => e.name.toLowerCase() === q);
  return `
    ${q && !exact ? `<button class="row" data-a="newExercise" data-name="${h(query.trim())}"><span class="row-main"><strong>New: ${h(query.trim())}</strong><small>Create this exercise</small></span>${icon('plus')}</button>` : ''}
    ${list.map((e) => `<button class="row" data-a="pickExercise" data-id="${h(e.id)}"><span class="row-main"><strong>${h(e.name)}</strong><small>${h(e.muscle)}</small></span></button>`).join('')}`;
}

function exerciseForm({ id = '', name = '', muscle = '', step = DEFAULT_STEP, perSide = false, bar = 20, addToWorkout = false }) {
  const cardioOnly = isCardio(id);
  openSheet(`
    <h2>${id ? 'Edit exercise' : 'New exercise'}</h2>
    <label class="field">Name <input id="ex-name" value="${h(name)}" autocomplete="off"></label>
    <label class="field">Muscle group
      <select id="ex-muscle">
        ${MUSCLES.map((m) => `<option ${m === (muscle || 'Other') ? 'selected' : ''}>${h(m)}</option>`).join('')}
      </select>
    </label>
    <label class="field">${cardioOnly ? 'Step in minutes' : 'Weight step in kg'} <input id="ex-step" inputmode="decimal" value="${h(fmtNum(step))}"></label>
    <p class="muted">This is the step for the plus and minus buttons.</p>
    ${cardioOnly ? '' : `
      <label class="check"><input type="checkbox" id="ex-per-side" ${perSide ? 'checked' : ''}> Enter weight per side of the bar</label>
      <label class="field">Bar weight in kg, 0 if you don't count it <input id="ex-bar" inputmode="decimal" value="${h(fmtNum(bar))}"></label>`}
    <div class="sheet-actions">
      <button class="btn ghost" data-a="closeSheet">Cancel</button>
      <button class="btn primary" data-a="saveExercise" data-id="${h(id)}" data-add="${addToWorkout ? '1' : ''}">Save</button>
    </div>`);
}

const A = {
  closeSheet: () => closeSheet(),

  loadDemo: async () => {
    await replaceData(buildDemo(), { demo: true });
    await db.setMeta('demoVersion', DEMO_VERSION);
    state.onboarded = true;
    location.hash = '#/';
    render();
  },

  loadPlan: async () => {
    // Keeps everything you already logged and only adds what is missing.
    // Plan details follow the plan; your own weight step stays.
    await db.putMany('exercises', EXERCISES.map((e) => ({ ...e, step: state.exercises.get(e.id)?.step ?? e.step })));
    await db.setMeta('schema', PLAN);
    await db.setMeta('onboarded', true);
    await loadAll();
    location.hash = '#/';
    render();
  },

  showMuscles: (el) => openSheet(`<h2>${h(exName(el.dataset.id))}</h2>${muscleCard(el.dataset.id)}`),

  setTheme: (el) => {
    window.gymTheme.set(el.dataset.id);
    render();
  },

  coachApply: async (el) => {
    const proposal = coachSuggestions({ schema: state.schema, exercises: state.exercises, setsByEx: state.setsByEx })
      .find((p) => p.key === el.dataset.id);
    if (!proposal) return;
    if (proposal.type === 'focus') {
      state.schema.focus = { muscle: proposal.muscle, until: focusUntil() };
    } else {
      swapInPlan(state.schema, proposal.from, proposal.to);
      state.schema.changes = [{ date: localDate(), from: proposal.from, to: proposal.to }, ...(state.schema.changes ?? [])].slice(0, 10);
      toast(`${exName(proposal.to)} is in your plan now.`);
    }
    await savePlan();
    render();
  },

  coachLater: async (el) => {
    state.schema.snoozed = { ...(state.schema.snoozed ?? {}), [el.dataset.id]: snoozeUntil() };
    await savePlan();
    render();
  },

  stopFocus: async () => {
    delete state.schema.focus;
    await savePlan();
    render();
  },

  undoChange: async (el) => {
    const index = Number(el.dataset.id);
    const change = state.schema.changes[index];
    swapInPlan(state.schema, change.to, change.from);
    state.schema.changes.splice(index, 1);
    state.schema.snoozed = { ...(state.schema.snoozed ?? {}), [`swap:${change.from}`]: snoozeUntil() };
    await savePlan();
    render();
  },

  previewDay: (el) => {
    const day = state.schema.days.find((d) => d.id === el.dataset.id);
    openSheet(`
      <h2>${h(day.name)}</h2>
      <div class="preview-figure">${bodyMap(dayMuscles(day))}</div>
      <ol class="preview">${previewRows(day)}</ol>
      <button class="btn primary big" data-a="startDay" data-id="${h(day.id)}">Start ${h(day.name)}</button>`);
  },

  startDay: async (el) => {
    const { id } = el.dataset;
    await closeSheet();
    startWorkout(state.schema.days.find((d) => d.id === id));
  },

  setFigure: async (el) => {
    state.figure = el.dataset.id;
    setBodyStyle(state.figure);
    await db.setMeta('figure', state.figure);
    render();
  },

  startFree: () => startWorkout(null),

  step: (el) => {
    const { kind, dir, target } = el.dataset;
    const scope = readDraftInputs(target);
    const exerciseId = exerciseFor(target);
    const bar = kind === 'weight' ? barOf(exerciseId) : null;
    // One step per side adds the plates on both ends. An empty bar is the lowest weight.
    const delta = kind === 'weight' ? exStep(exerciseId) * (bar === null ? 1 : 2) : isCardio(exerciseId) ? exStep(exerciseId) : 1;
    scope[kind] = Math.max(bar ?? 0, round2(scope[kind] + Number(dir) * delta));
    document.activeElement?.blur?.();
    syncStepperUI(target);
    const value = el.parentElement.querySelector('.step-value');
    value.classList.remove('bump');
    void value.offsetWidth;
    value.classList.add('bump');
    buzz(8);
  },

  logSet: async () => {
    const a = state.active;
    const item = currentItem();
    const { weight, reps } = readDraftInputs('draft');
    if (reps < 1) {
      toast('Enter a number above 0.', 'bad');
      return;
    }
    const set = { id: uid(), exerciseId: item.exerciseId, workoutId: a.id, date: a.date, ts: Date.now(), weight, reps };
    const labels = recordLabels(set, setsOf(item.exerciseId));
    state.sets.push(set);
    reindex();
    await db.put('sets', set);
    markDirty();
    state.extra = false;
    state.fresh = set.id;
    buzz(labels.length ? [30, 40, 30] : 20);
    render();
    state.fresh = null;
  },

  extraSet: () => {
    state.extra = true;
    state.draftKey = '';
    render();
  },

  nextEx: async () => {
    const a = state.active;
    if (a.idx < a.items.length - 1) {
      a.idx += 1;
      state.extra = false;
      await saveActive();
      render();
      window.scrollTo(0, 0);
    }
  },

  prevEx: async () => {
    const a = state.active;
    if (a.idx > 0) {
      a.idx -= 1;
      state.extra = false;
      await saveActive();
      render();
      window.scrollTo(0, 0);
    }
  },

  overview: () => {
    const a = state.active;
    openSheet(`
      <h2>${h(a.dayName)}</h2>
      <div class="rows sheet-list">
        ${a.items.map((it, i) => {
          const logged = setsIn(a.id, it.exerciseId);
          return `
            <button class="row ${i === a.idx ? 'current' : ''}" data-a="jump" data-id="${i}">
              <span class="row-main"><strong>${h(exName(it.exerciseId))}</strong><small>${logged.length ? h(summary(logged)) : 'Not logged yet'}</small></span>
              ${logged.length ? `<span class="ok-mark">${icon('check')}</span>` : ''}
            </button>`;
        }).join('')}
      </div>
      <button class="btn ghost" data-a="addExercise">${icon('plus')}Add exercise</button>
      <div class="sheet-actions">
        <button class="btn ghost-danger" data-a="discardWorkout">Delete workout</button>
        <button class="btn primary" data-a="finish">Finish</button>
      </div>`);
  },

  jump: async (el) => {
    state.active.idx = Number(el.dataset.id);
    state.extra = false;
    await saveActive();
    await closeSheet();
    render();
    window.scrollTo(0, 0);
  },

  addExercise: () => exercisePicker({ title: 'Add exercise' }),

  pickExercise: (el) => {
    if (state.active && route().name === 'training') addExerciseToWorkout(el.dataset.id);
  },

  busy: () => {
    const a = state.active;
    const item = currentItem();
    const last = lastDates();
    const inPlan = a.items.map((i) => i.exerciseId);
    const { planned, sameMuscle } = alternatives({
      exerciseId: item.exerciseId,
      plannedIds: item.alt ?? [],
      exercises: state.exercises,
      lastDateByExercise: last,
      excludeIds: inPlan,
    });
    const row = (id) => {
      const session = groupSessions(setsOf(id))[0];
      return `
        <button class="row" data-a="swapTo" data-id="${h(id)}">
          <span class="row-main"><strong>${h(exName(id))}</strong>
          <small>${session ? `${h(summary(session.sets))}, ${h(fmtRelative(session.date))}` : 'Not done yet'}</small></span>${icon('next')}
        </button>`;
    };
    openSheet(`
      <h2>${isCardio(item.exerciseId) ? 'Other type of conditioning' : `Alternative for ${h(exName(item.exerciseId))}`}</h2>
      <div class="sheet-list">
        ${planned.length ? `<h3>From your plan</h3><div class="rows">${planned.map(row).join('')}</div>` : ''}
        ${sameMuscle.length ? `<h3>Same muscle group</h3><div class="rows">${sameMuscle.map(row).join('')}</div>` : ''}
        ${!planned.length && !sameMuscle.length ? '<p class="muted">No alternatives found for this muscle group.</p>' : ''}
      </div>
      <button class="btn ghost" data-a="addExercise">Find another exercise</button>`);
  },

  swapTo: async (el) => {
    const a = state.active;
    const item = currentItem();
    const done = setsIn(a.id, item.exerciseId).length;
    const swapped = {
      ...item,
      key: uid(),
      exerciseId: el.dataset.id,
      replaces: item.exerciseId,
      sets: item.sets ? Math.max(1, item.sets - done) : 0,
    };
    // Logged sets stay; the remainder moves to the alternative.
    if (done) {
      a.items.splice(a.idx + 1, 0, swapped);
      a.idx += 1;
    } else {
      a.items[a.idx] = swapped;
    }
    state.extra = false;
    await saveActive();
    await closeSheet();
    render();
    window.scrollTo(0, 0);
  },

  undoSwap: async () => {
    const a = state.active;
    const item = currentItem();
    const original = a.items.find((i) => i.exerciseId === item.replaces);
    if (original) {
      if (!setsIn(a.id, item.exerciseId).length) a.items.splice(a.idx, 1);
      a.idx = a.items.indexOf(original);
    } else {
      item.exerciseId = item.replaces;
      delete item.replaces;
    }
    await saveActive();
    render();
  },

  note: () => {
    const exerciseId = currentItem().exerciseId;
    const today = state.notes.find((n) => n.exerciseId === exerciseId && n.date === state.active.date);
    openSheet(`
      <h2>Note for ${h(exName(exerciseId))}</h2>
      <label class="field"><span class="sr">Note</span>
        <textarea id="note-text" rows="3" placeholder="E.g. seat on position 4">${h(today?.text ?? '')}</textarea>
      </label>
      <p class="muted">You'll see your latest note here next time.</p>
      <div class="sheet-actions">
        <button class="btn ghost" data-a="closeSheet">Cancel</button>
        <button class="btn primary" data-a="saveNote" data-id="${h(today?.id ?? '')}">Save</button>
      </div>`);
  },

  saveNote: async (el) => {
    const text = document.getElementById('note-text').value.trim();
    const exerciseId = currentItem().exerciseId;
    const id = el.dataset.id;
    if (id) {
      state.notes = state.notes.filter((n) => n.id !== id);
      await db.remove('notes', id);
    }
    if (text) {
      const note = { id: id || uid(), exerciseId, date: state.active.date, text };
      state.notes.push(note);
      await db.put('notes', note);
    }
    markDirty();
    await closeSheet();
    render();
  },

  editSet: (el) => {
    const set = state.sets.find((s) => s.id === el.dataset.id);
    if (!set) return;
    state.edit = { id: set.id, exerciseId: set.exerciseId, weight: set.weight, reps: set.reps };
    openSheet(`
      <h2>Edit set</h2>
      <p class="muted">${h(exName(set.exerciseId))}, ${h(fmtDate(set.date))}</p>
      <div class="editor">
        ${isCardio(set.exerciseId) ? '' : stepper('weight', 'Weight', set.weight, 'edit', set.exerciseId)}
        ${stepper('reps', 'Reps', set.reps, 'edit', set.exerciseId)}
      </div>
      <div class="sheet-actions">
        <button class="btn ghost-danger" data-a="deleteSet">Delete</button>
        <button class="btn primary" data-a="saveSet">Save</button>
      </div>`);
  },

  saveSet: async () => {
    const { id, weight, reps } = readDraftInputs('edit');
    const set = state.sets.find((s) => s.id === id);
    if (reps < 1) {
      toast('Enter a number above 0.', 'bad');
      return;
    }
    set.weight = weight;
    set.reps = reps;
    await db.put('sets', set);
    markDirty();
    if (!state.active) scheduleBackup();
    state.draftKey = '';
    await closeSheet();
    render();
  },

  deleteSet: async () => {
    const { id } = state.edit;
    state.sets = state.sets.filter((s) => s.id !== id);
    reindex();
    await db.remove('sets', id);
    markDirty();
    if (!state.active) scheduleBackup();
    state.draftKey = '';
    await closeSheet();
    render();
  },

  finish: async () => {
    const a = state.active;
    const sets = state.sets.filter((s) => s.workoutId === a.id);
    if (sheetOpen) await closeSheet();
    if (!sets.length) {
      if (await ask({ title: 'Stop workout?', body: 'You haven\'t logged anything, so nothing will be saved.', confirm: 'Stop', danger: true })) {
        await discardActive();
      }
      return;
    }
    const workout = state.workouts.get(a.id);
    workout.finishedAt = Date.now();
    await db.put('workouts', workout);
    state.active = null;
    state.draftKey = '';
    await db.removeMeta('active');
    markDirty();
    location.hash = `#/done/${encodeURIComponent(a.id)}`;
    runBackup();
  },

  discardWorkout: async () => {
    await closeSheet();
    if (await ask({ title: 'Delete this workout?', body: 'All sets from this workout will be removed.', confirm: 'Delete', danger: true })) {
      await discardActive();
    }
  },

  moreHistory: () => {
    state.historyLimit += 30;
    render();
  },

  deleteWorkout: async (el) => {
    const id = el.dataset.id;
    if (!(await ask({ title: 'Delete workout?', body: 'All sets from this workout will be removed.', confirm: 'Delete', danger: true }))) return;
    await deleteWorkoutData(id);
    markDirty();
    scheduleBackup();
    location.hash = '#/history';
  },

  filterMuscle: (el) => {
    state.exMuscle = el.dataset.id;
    render();
  },

  chartMetric: (el) => {
    state.chart.metric = el.dataset.id;
    render();
  },

  chartRange: (el) => {
    state.chart.range = el.dataset.id;
    render();
  },

  newExercise: (el) => exerciseForm({ name: el.dataset.name ?? '', addToWorkout: route().name === 'training' }),

  editExercise: (el) => exerciseForm(state.exercises.get(el.dataset.id)),

  saveExercise: async (el) => {
    const name = document.getElementById('ex-name').value.trim();
    const muscle = document.getElementById('ex-muscle').value;
    const step = parseNumber(document.getElementById('ex-step').value);
    if (!name) {
      toast('Give the exercise a name.', 'bad');
      return;
    }
    if (!step || step <= 0) {
      toast('Enter a weight step, for example 2.5.', 'bad');
      return;
    }
    const perSide = document.getElementById('ex-per-side')?.checked ?? false;
    const bar = parseNumber(document.getElementById('ex-bar')?.value);
    if (perSide && (bar === null || bar < 0)) {
      toast('Enter the bar weight, for example 20.', 'bad');
      return;
    }
    const id = el.dataset.id || uid();
    const { perSide: _oldSide, bar: _oldBar, ...existing } = state.exercises.get(id) ?? {};
    const exercise = { ...existing, id, name, muscle, step, ...(perSide ? { perSide, bar } : {}) };
    state.exercises.set(id, exercise);
    await db.put('exercises', exercise);
    markDirty();
    if (!state.active) scheduleBackup();
    state.draftKey = '';
    if (el.dataset.add) {
      await addExerciseToWorkout(id);
      return;
    }
    await closeSheet();
    render();
  },

  install: async () => {
    await state.installEvent?.prompt();
    state.installEvent = null;
    render();
  },

  saveToken: async () => {
    const repo = document.getElementById('gh-repo').value.trim();
    const token = document.getElementById('gh-token').value.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      toast('Write the repository as user/name.', 'bad');
      return;
    }
    if (!token) {
      toast('Paste the access token first.', 'bad');
      return;
    }
    Object.assign(state.gh, { repo, token, lastError: null });
    await saveGh();
    if (state.demo) {
      toast('Token saved. Sample data doesn\'t go to GitHub.');
      render();
      return;
    }
    if (!state.sets.length) {
      toast('Token saved. You can restore your backup now.');
      render();
      return;
    }
    await runBackup({ force: true });
    toast(state.gh.lastError ? 'Backup failed, see the message.' : 'Backup done.', state.gh.lastError ? 'bad' : '');
    render();
  },

  backupNow: async () => {
    if (state.demo) {
      toast('Sample data doesn\'t go to GitHub.');
      return;
    }
    await runBackup({ force: true });
    toast(state.gh.lastError ? 'Backup failed, see the message.' : 'Backup done.', state.gh.lastError ? 'bad' : '');
    render();
  },

  removeToken: async () => {
    if (!(await ask({ title: 'Remove token?', body: 'No more backups until you enter a new token. Existing backups stay.', confirm: 'Remove', danger: true }))) return;
    state.gh.token = '';
    state.gh.lastError = null;
    await saveGh();
    render();
  },

  restoreGithub: async () => {
    try {
      restoreFrom(await fetchBackup(state.gh));
    } catch (err) {
      toast(err.message === 'Failed to fetch' ? 'No connection to GitHub.' : err.message, 'bad');
    }
  },

  exportFile: () => {
    const { exercises, workouts, sets, notes, schema } = state;
    const backup = buildBackup({ exercises: [...exercises.values()], workouts: [...workouts.values()], sets, notes, schema });
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `gymlog-backup-${localDate()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  clearAll: async () => {
    const wasDemo = state.demo;
    if (!(await ask({
      title: wasDemo ? 'Clear sample data?' : 'Clear everything?',
      body: wasDemo ? 'The app will be empty afterwards.' : 'All workouts on this phone disappear. Your GitHub backup stays.',
      confirm: 'Clear',
      danger: true,
    }))) return;
    await db.clearData(['schema', 'active', 'dirty', 'demo', 'demoVersion', 'onboarded']);
    state.draftKey = '';
    await loadAll();
    location.hash = '#/';
    render();
  },
};

async function restoreFrom(data) {
  const sets = data.sets.length;
  const newest = data.sets.reduce((d, s) => (s.date > d ? s.date : d), '');
  const body = `${fmtNum(sets)} sets${newest ? `, latest workout ${fmtRelative(newest)}` : ''}. This replaces everything on this phone.`;
  if (!(await ask({ title: 'Restore backup?', body, confirm: 'Restore', danger: true }))) return;
  await replaceData(data, { demo: false });
  await db.setMeta('dirty', false);
  state.dirty = false;
  // A first import has no plan yet, so add it. Plan exercises keep their history through their id.
  if (!state.schema) await A.loadPlan();
  toast('Backup restored.');
  location.hash = '#/';
  render();
}

async function deleteWorkoutData(id) {
  const ids = state.sets.filter((s) => s.workoutId === id).map((s) => s.id);
  state.sets = state.sets.filter((s) => s.workoutId !== id);
  state.workouts.delete(id);
  reindex();
  await db.removeMany('sets', ids);
  await db.remove('workouts', id);
}

async function discardActive() {
  const { id } = state.active;
  await deleteWorkoutData(id);
  state.active = null;
  state.draftKey = '';
  await db.removeMeta('active');
  location.hash = '#/';
  render();
}

// ---------- Events ----------

document.addEventListener('click', async (event) => {
  const el = event.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const action = A[el.dataset.a];
  if (!action) return;
  try {
    await action(el);
  } catch (err) {
    console.error(err);
    toast('Something went wrong. Your logged sets are saved.', 'bad');
  }
});

document.addEventListener('input', (event) => {
  const { field, target } = event.target.dataset;
  if (field === 'exQuery') {
    state.exQuery = event.target.value;
    document.getElementById('ex-list').innerHTML = exerciseRows();
  } else if (field === 'pickQuery') {
    document.getElementById('pick-list').innerHTML = pickRows(event.target.value);
  } else if (target) {
    readDraftInputs(target);
    syncStepperUI(target);
  }
});

document.addEventListener('focusin', (event) => {
  if (event.target.matches('.step-value input')) event.target.select();
});

document.addEventListener('focusout', (event) => {
  const { target } = event.target.dataset;
  if (target) {
    readDraftInputs(target);
    event.target.value = fmtNum(shownValue(target, event.target.dataset.field));
  }
});

document.addEventListener('change', async (event) => {
  if (event.target.dataset.field === 'humor') {
    state.humor = event.target.checked;
    await db.setMeta('humor', state.humor);
    return;
  }
  if (event.target.dataset.field !== 'restoreFile') return;
  const file = event.target.files[0];
  if (!file) return;
  try {
    await restoreFrom(validateBackup(JSON.parse(await file.text())));
  } catch {
    toast('This is not a valid GymLog backup file.', 'bad');
  }
});

// A soft cross-fade between screens, where the phone supports it.
window.addEventListener('hashchange', () => {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !calm && document.visibilityState === 'visible') {
    // The animation is optional: if the browser delays or skips it, the screen still updates.
    let drawn = false;
    const draw = () => {
      if (drawn) return;
      drawn = true;
      render();
    };
    const transition = document.startViewTransition(draw);
    setTimeout(draw, 250);
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
  } else {
    render();
  }
});
window.addEventListener('online', () => runBackup());
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installEvent = event;
  if (route().name === 'settings') render();
});

// Load a new app version, except in the middle of a workout.
function registerServiceWorker() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || (local && !location.search.includes('sw=1'))) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (state.active) toast('New version ready. It loads after your workout.');
    else location.reload();
  });
  navigator.serviceWorker.register('sw.js');
}

async function init() {
  await loadAll();
  // Sample data from an older version does not match the current plan, so start over.
  if (state.demo && (await db.getMeta('demoVersion')) !== DEMO_VERSION) {
    await db.clearData(['schema', 'active', 'dirty', 'demo', 'demoVersion', 'onboarded']);
    await loadAll();
  }
  // A newer plan replaces the stored one. Everything already logged stays.
  if (state.schema && (state.schema.version ?? 1) < PLAN.version) await A.loadPlan();
  state.persisted = (await navigator.storage?.persist?.()) ?? null;
  // Jump straight into a workout that started today or yesterday.
  if (!location.hash && state.active && daysBetween(state.active.date, localDate()) <= 1) {
    history.replaceState(null, '', '#/training');
  }
  render();
  registerServiceWorker();
  runBackup();
}

init();
