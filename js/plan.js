// Training plan, version 4 (regular sets). These are workouts to choose from, not a fixed order.
// Per-side exercises store the total weight: 2 × plates + bar. Smith, hack squat and angled press count no bar.

const ex = (id, name, muscle, step, primary, secondary = [], extra = {}) => ({ id, name, muscle, step, primary, secondary, ...extra });
const barbell = { perSide: true, bar: 20 };
const plates = { perSide: true, bar: 0 };
const cardio = { kind: 'cardio' };

export const EXERCISES = [
  ex('bench', 'Barbell Bench Press', 'Chest', 2.5, ['chest'], ['frontDelt', 'triceps'], barbell),
  ex('db-bench', 'Dumbbell Bench Press', 'Chest', 2, ['chest'], ['frontDelt', 'triceps']),
  ex('smith-press', 'Smith Press', 'Chest', 2.5, ['chest'], ['frontDelt', 'triceps'], plates),
  ex('incline-db', 'Incline Dumbbell Press', 'Chest', 2, ['chest', 'frontDelt'], ['triceps']),
  ex('chest-press', 'Machine Chest Press', 'Chest', 2.5, ['chest'], ['frontDelt', 'triceps']),
  ex('pec-deck', 'Seated Machine Fly', 'Chest', 2.5, ['chest'], ['frontDelt']),
  ex('cable-fly', 'Cable Fly', 'Chest', 2.5, ['chest'], ['frontDelt']),
  ex('low-high-fly', 'Low-to-High Cable Fly', 'Chest', 2.5, ['chest', 'frontDelt']),
  ex('lat-pulldown', 'Lat Pulldown, Wide Grip', 'Back', 2.5, ['lats'], ['biceps', 'rearDelt']),
  ex('single-lat', 'Single Arm Lat Pulldown', 'Back', 1, ['lats'], ['biceps']),
  ex('seated-row', 'Seated Cable Row', 'Back', 2.5, ['lats', 'traps'], ['biceps', 'rearDelt', 'forearms']),
  ex('chest-row', 'Chest Supported Row', 'Back', 2.5, ['lats', 'traps'], ['rearDelt', 'biceps']),
  ex('cable-lateral', 'Cable Lateral Raise', 'Shoulders', 1, ['sideDelt'], ['traps']),
  ex('incline-curl', 'Incline Dumbbell Curl', 'Biceps', 1, ['biceps'], ['forearms']),
  ex('hammer', 'Hammer Curl', 'Biceps', 1, ['biceps', 'forearms']),
  ex('oh-triceps', 'Overhead Cable Triceps Extension', 'Triceps', 1, ['triceps']),
  ex('hack-squat', 'Hack Squat', 'Quads', 2.5, ['quads'], ['glutes', 'adductors'], plates),
  ex('squat', 'Barbell Squat', 'Quads', 2.5, ['quads', 'glutes'], ['adductors', 'hamstrings', 'lowerBack'], barbell),
  ex('leg-press', 'Leg Press', 'Quads', 5, ['quads', 'glutes'], ['adductors', 'hamstrings']),
  ex('angled-press', 'Angled Leg Press', 'Quads', 2.5, ['quads', 'glutes'], ['adductors', 'hamstrings'], plates),
  ex('split-squat', 'Bulgarian Split Squat', 'Quads', 2, ['quads', 'glutes'], ['hamstrings', 'adductors']),
  ex('leg-extension', 'Leg Extension', 'Quads', 2.5, ['quads']),
  ex('rdl', 'Barbell Romanian Deadlift', 'Hamstrings', 2.5, ['hamstrings', 'glutes'], ['lowerBack', 'forearms'], barbell),
  ex('seated-curl', 'Seated Leg Curl', 'Hamstrings', 2.5, ['hamstrings'], ['calves']),
  ex('lying-curl', 'Lying Leg Curl', 'Hamstrings', 2.5, ['hamstrings'], ['calves']),
  ex('calf-raise', 'Calf Raise', 'Calves', 5, ['calves']),
  ex('cable-crunch', 'Cable Crunch', 'Abs', 2.5, ['abs'], ['obliques']),
  ex('leg-raise', 'Hanging Leg Raise', 'Abs', 2.5, ['abs'], ['obliques', 'forearms']),
  ex('spin', 'Spin', 'Cardio', 5, ['quads', 'glutes'], ['hamstrings', 'calves'], cardio),
  ex('stairmaster', 'Stairmaster', 'Cardio', 5, ['glutes', 'quads'], ['calves', 'hamstrings'], cardio),
  ex('rowing', 'Rowing Machine', 'Cardio', 5, ['lats', 'quads'], ['glutes', 'biceps', 'hamstrings'], cardio),
];

const item = (exerciseId, sets, repMin, repMax, extra = {}) => ({ exerciseId, sets, repMin, repMax, alt: [], ...extra });
const first = (rest) => ({ first: true, rest });

export const PLAN = {
  version: 3,
  days: [
    { id: 'upper-a', name: 'Upper A', items: [
      item('bench', 4, 6, 10, { ...first('2 min rest'), alt: ['db-bench', 'smith-press'] }),
      item('incline-db', 3, 8, 12, first('2 min rest')),
      item('pec-deck', 3, 10, 15, { alt: ['cable-fly'], hint: 'Stretch deep, pause 1 second' }),
      item('lat-pulldown', 3, 8, 12),
      item('seated-row', 2, 8, 12, { alt: ['chest-row', 'fn-diverging-low-row'] }),
      item('cable-lateral', 3, 12, 20),
      item('incline-curl', 2, 10, 15, { alt: ['hammer'] }),
    ] },
    { id: 'lower-a', name: 'Lower A', items: [
      item('hack-squat', 4, 6, 10, { ...first('2 to 3 min rest'), alt: ['squat'], hint: 'Pick one of hack or barbell squat for the whole block' }),
      item('rdl', 3, 8, 12, first('2 min rest')),
      item('leg-extension', 3, 10, 15),
      item('seated-curl', 3, 10, 15, { alt: ['lying-curl'] }),
      item('calf-raise', 3, 10, 15, { hint: 'Pause 2 seconds in the stretch' }),
      item('cable-crunch', 2, 10, 15, { alt: ['leg-raise'] }),
    ] },
    { id: 'conditioning', name: 'Conditioning', items: [
      item('spin', 1, 60, 60, { repText: 'Log how long', alt: ['stairmaster', 'rowing'] }),
    ] },
    { id: 'upper-b', name: 'Upper B', items: [
      item('chest-press', 4, 8, 12, { ...first('2 min rest'), alt: ['db-bench'] }),
      item('low-high-fly', 3, 10, 15, { alt: ['pec-deck'] }),
      item('single-lat', 2, 10, 15, { repText: '10–15 per side', alt: ['lat-pulldown'] }),
      item('chest-row', 2, 8, 12, { alt: ['fn-diverging-low-row', 'seated-row'] }),
      item('cable-lateral', 3, 12, 20),
      item('oh-triceps', 2, 10, 15),
      item('hammer', 2, 10, 15, { alt: ['incline-curl'] }),
    ] },
    { id: 'lower-b', name: 'Lower B', items: [
      item('leg-press', 3, 8, 12, { ...first('2 min rest'), alt: ['angled-press'] }),
      item('split-squat', 3, 8, 12, { ...first('90 sec rest after each pair'), repText: '8–12 per leg' }),
      item('lying-curl', 4, 8, 12, { alt: ['seated-curl'] }),
      item('leg-extension', 3, 10, 15),
      item('calf-raise', 3, 10, 15),
      item('leg-raise', 2, null, null, { repText: 'max', alt: ['cable-crunch'] }),
    ] },
  ],
};
