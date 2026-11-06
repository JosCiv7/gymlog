// A simple 2D muscle chart, front and back. Shapes are drawn for one side and mirrored.

export const MUSCLE_NAMES = {
  chest: 'Chest',
  frontDelt: 'Front shoulders',
  sideDelt: 'Side shoulders',
  rearDelt: 'Rear shoulders',
  traps: 'Traps',
  lats: 'Lats',
  lowerBack: 'Lower back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  quads: 'Quads',
  adductors: 'Inner thighs',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
};

/** Used for exercises without their own muscle list. */
export const GROUP_MUSCLES = {
  Chest: { primary: ['chest'], secondary: ['frontDelt', 'triceps'] },
  Back: { primary: ['lats', 'traps'], secondary: ['biceps', 'rearDelt'] },
  Shoulders: { primary: ['sideDelt', 'frontDelt'], secondary: ['traps'] },
  Biceps: { primary: ['biceps'], secondary: ['forearms'] },
  Triceps: { primary: ['triceps'], secondary: [] },
  Quads: { primary: ['quads'], secondary: ['glutes'] },
  Hamstrings: { primary: ['hamstrings'], secondary: ['glutes'] },
  Glutes: { primary: ['glutes'], secondary: ['hamstrings'] },
  Calves: { primary: ['calves'], secondary: [] },
  Abs: { primary: ['abs'], secondary: ['obliques'] },
  Cardio: { primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
};

// Each entry: [muscle id, path]. Coordinates are for the left half of a 120 wide figure.
const FRONT = [
  ['traps', 'M54.5 27.5 L54 33 C50.5 35.5 47 37 43.5 38 C47 39.5 53 39.5 57 37 L57.5 28.5 Z'],
  ['sideDelt', 'M38 39.5 C32.5 41 29 45.5 28 52 C27.6 56 28.2 59.5 29.8 62.5 C30.8 55.5 33 49.5 37.5 44.5 L39.5 41 Z'],
  ['frontDelt', 'M41 39.5 C42.5 39.8 44 40.2 45.5 40.6 C44.5 46 41 52.5 35.5 58 C34 59.5 32.8 61 31.8 62.5 C32.5 56 34.8 50 39 45.5 Z'],
  ['chest', 'M58.8 42 L47.5 41 C46.5 47 43 53.5 37.5 59.5 C39.5 65.5 44.5 69 50.5 69 C55 69 58.8 67 58.8 62.5 Z'],
  ['biceps', 'M29.5 65 C26.5 71 24.8 79 25 88 C25.2 91 27.5 92.5 30 91 C33.8 85 36.5 76 36.8 67 C36.8 64.5 35 62.5 33 62.8 C31.5 63 30.2 63.8 29.5 65 Z'],
  ['forearms', 'M24.5 94.5 C21.5 102 18.8 112 17.8 123 L23 124.5 C27 115 30.2 105 31 95 C29 93.2 26.5 93 24.5 94.5 Z'],
  ['abs', 'M58.8 70.5 L51.5 71 L50.8 79 L58.8 79 Z'],
  ['abs', 'M58.8 81 L50.6 81 L50.4 90 L58.8 90 Z'],
  ['abs', 'M58.8 92 L50.4 92 L50.6 102 L58.8 102 Z'],
  ['abs', 'M58.8 104 L50.8 104 C51.5 111 54.5 118 58.8 123 Z'],
  ['obliques', 'M48.8 71 C44.5 71 41 69 38.8 65.5 C37.8 74 38 85 40 95 C41 101 42.2 106 43.5 110.5 L49 107.5 L48.4 92 Z'],
  ['quads', 'M42.5 116 C37 126 34.5 143 36 160 C36.8 169 38.5 176 41 181 C42.4 170 43.4 150 44.6 133 Z'],
  ['quads', 'M46.5 115 L46.2 134 C45.4 150 44.5 166 43.8 178 C46.5 175.5 49.8 177 51.2 180 C54.2 168 56 151 55 135 C54.4 127 52.5 120 50 113.5 Z'],
  ['adductors', 'M58.6 124 C56.8 130 56.8 146 55.8 158 C57.5 149 59.4 136 59.4 126 Z'],
  ['calves', 'M40.4 193 C37.2 205 38 222 42 234 L47 234 C50 222 52.8 206 51.2 193 C48 197 43.4 197 40.4 193 Z'],
];

const BACK = [
  ['traps', 'M60 26.5 L54 28 C51.5 33 47.5 36.5 43 38.2 C49 41 53.5 46.5 55.6 53.5 L60 67 Z'],
  ['sideDelt', 'M36 40 C31.5 41.8 28.8 46 28 52 C27.6 55.5 28.2 58.5 29.5 61 C30.2 54.5 32.5 48.5 37.5 43.5 Z'],
  ['rearDelt', 'M39.5 39.2 L38.6 44.5 C34.5 49 32 54.5 31.2 60.5 C36.5 58.5 42.5 53 46.6 47 C45.4 43.5 42.8 40.5 39.5 39.2 Z'],
  ['lats', 'M47.5 50 C43.5 54.8 39 59.8 37.5 64 C38.5 78 41.2 92 46 102.5 L51.5 98.5 C55 90 57.8 79 58.8 69.5 L55 58 C53 54 50.6 51.2 47.5 50 Z'],
  ['lowerBack', 'M59 73 C57.5 84 54.5 93 51.5 101 L52.5 108.5 L59 111.5 Z'],
  ['triceps', 'M30.6 63 C27 70 25 79 25.2 88 C25.6 91.5 28.5 92.8 31 90.8 C34.8 85 37.5 75 37 65.5 C35.5 62.5 32.8 61.6 30.6 63 Z'],
  ['forearms', 'M24.5 94.5 C21.5 102 18.8 112 17.8 123 L23 124.5 C27 115 30.2 105 31 95 C29 93.2 26.5 93 24.5 94.5 Z'],
  ['glutes', 'M59 114 L50.5 110 C44.5 113 40.5 122 41 132 C44 140.5 54 142.5 59 136.5 Z'],
  ['hamstrings', 'M42.6 139 C37.4 150 35.8 167 39 183.5 L45.8 180.5 L46.8 143.2 Z'],
  ['hamstrings', 'M48.8 143.5 L48 180.5 L54.2 183.5 C57 168 57.4 151 56.2 141.5 Z'],
  ['calves', 'M39 193.2 C36 203 37 216 41 225 C44 219.5 45.8 210 46 195.5 C44 192.4 41 192 39 193.2 Z'],
  ['calves', 'M48 195.5 C48.2 210 49.6 219.5 51.4 225 C54.6 216 55.4 203 52.4 193.2 C51 192 48.8 192.4 48 195.5 Z'],
];

const NEUTRAL_FRONT = `
  <ellipse class="b" cx="60" cy="15" rx="9.5" ry="12"/>
  <path class="b" d="M54.5 24 L54.5 33 L65.5 33 L65.5 24 Z"/>
  <ellipse class="b" cx="19.5" cy="131" rx="4.2" ry="6.5"/>
  <ellipse class="b" cx="100.5" cy="131" rx="4.2" ry="6.5"/>
  <path class="b" d="M49 109 L44 115 L51 112.5 C53 119 56 123 60 127 C64 123 67 119 69 112.5 L76 115 L71 109 C67 112 53 112 49 109 Z"/>
  <ellipse class="b" cx="46" cy="186.5" rx="6.5" ry="5"/>
  <ellipse class="b" cx="74" cy="186.5" rx="6.5" ry="5"/>
  <path class="b" d="M42 235.5 L47 235.5 L49 242 L38.5 242 Z"/>
  <path class="b" d="M78 235.5 L73 235.5 L71 242 L81.5 242 Z"/>`;

const NEUTRAL_BACK = `
  <ellipse class="b" cx="60" cy="15" rx="9.5" ry="12"/>
  <path class="b" d="M56 24 L56 28 L64 28 L64 24 Z"/>
  <ellipse class="b" cx="19.5" cy="131" rx="4.2" ry="6.5"/>
  <ellipse class="b" cx="100.5" cy="131" rx="4.2" ry="6.5"/>
  <ellipse class="b" cx="46" cy="188" rx="6.5" ry="3.6"/>
  <ellipse class="b" cx="74" cy="188" rx="6.5" ry="3.6"/>
  <path class="b" d="M42 227 C43 228 45 228 46.5 227 L49 242 L38.5 242 Z"/>
  <path class="b" d="M78 227 C77 228 75 228 73.5 227 L71 242 L81.5 242 Z"/>`;

// An original cartoon bodybuilder: tiny head, huge everything else.
const TOON_FRONT = [
  ['traps', 'M53 24 C50 28 44 31 36 33 C43 37 52 38 58 36 L58 27 Z'],
  ['sideDelt', 'M30 33 C20 34 12 41 11 52 C10.5 58 12 63 14 66 C16 56 20 48 27 43 L32 37 Z'],
  ['frontDelt', 'M35 34.5 C37 35 40 36 42 37 C41 44 35 52 26 58 C22 61 18 64 16 67 C17 57 21 49 29 44 Z'],
  ['chest', 'M59 38 L44 37 C43 45 37 53 29 59 C31 69 40 75 50 75 C55 75 59 72 59 66 Z'],
  ['biceps', 'M14 69 C9 76 6 86 7 96 C8 100 12 102 16 100 C22 94 27 82 27 71 C27 66 24 62 20 62 C17 63 15 66 14 69 Z'],
  ['forearms', 'M8 104 C4 112 2 122 3 132 L10 134 C15 124 19 113 19 103 C16 101 11 101 8 104 Z'],
  ['abs', 'M59 77 L50.5 77.5 L50 85 L59 85 Z'],
  ['abs', 'M59 87 L50 87 L50 95 L59 95 Z'],
  ['abs', 'M59 97 L50 97 L50.5 105 L59 105 Z'],
  ['abs', 'M59 107 L50.8 107 C51.5 113 55 119 59 123 Z'],
  ['obliques', 'M48.5 77 C43 77 37 74 33 69 C34 80 37 92 41 102 C42 107 43 111 44 114 L49 110 L48.5 95 Z'],
  ['quads', 'M40 116 C29 126 22 146 24 168 C25 178 28 186 32 192 C35 178 37 156 40 136 Z'],
  ['quads', 'M44 116 L42 138 C40 156 38 176 36 190 C41 186 47 188 50 192 C55 178 58 156 56 136 C55 128 52 121 49 114 Z'],
  ['adductors', 'M59 126 C57.5 134 57.5 150 56.5 164 C58.5 154 59.5 140 59.5 128 Z'],
  ['calves', 'M32 204 C27 214 28 230 33 239 L46 239 C50 230 52 214 49 204 C44 208 37 208 32 204 Z'],
];

const TOON_BACK = [
  ['traps', 'M60 24 L53 25 C50 29 44 32 36 33.5 C44 38 51 46 54 56 L60 72 Z'],
  ['sideDelt', 'M30 33 C20 34 12 41 11 52 C10.5 57 11.5 61 13 64 C15 55 20 47 27 42 Z'],
  ['rearDelt', 'M33 35 L32 42 C25 47 19 55 16 64 C24 62 35 54 43 46 C41 41 37 37 33 35 Z'],
  ['lats', 'M45 49 C38 55 30 62 28 68 C30 84 35 98 42 108 L50 102 C54 94 58 84 59 74 L54 59 C51 54 48 51 45 49 Z'],
  ['lowerBack', 'M59 78 C57 90 54 98 51 105 L52 113 L59 116 Z'],
  ['triceps', 'M15 66 C9 74 6 85 7 96 C8 100 12 102 16 100 C22 93 27 81 27 70 C25 65 19 63 15 66 Z'],
  ['forearms', 'M8 104 C4 112 2 122 3 132 L10 134 C15 124 19 113 19 103 C16 101 11 101 8 104 Z'],
  ['glutes', 'M59 118 L50 114 C40 116 33 125 34 137 C38 147 53 150 59 143 Z'],
  ['hamstrings', 'M36 146 C27 158 24 174 28 192 L38 188 L40 150 Z'],
  ['hamstrings', 'M43 151 L41 188 L50 192 C55 176 57 160 56 149 Z'],
  ['calves', 'M30 204 C25 214 27 228 33 236 C38 230 39 218 39 206 C36 202 33 202 30 204 Z'],
  ['calves', 'M42 206 C42 218 44 230 47 236 C52 228 53 214 50 204 C47 202 44 202 42 206 Z'],
];

const toonLimbs = `
  <ellipse class="b" cx="6.5" cy="139" rx="5" ry="6.5"/>
  <ellipse class="b" cx="113.5" cy="139" rx="5" ry="6.5"/>
  <ellipse class="b" cx="41" cy="197.5" rx="8" ry="5.5"/>
  <ellipse class="b" cx="79" cy="197.5" rx="8" ry="5.5"/>
  <path class="b" d="M33 240 L46 240 L48 245 L29 245 Z"/>
  <path class="b" d="M87 240 L74 240 L72 245 L91 245 Z"/>`;

const TOON_NEUTRAL_FRONT = `
  <path class="b" d="M53 21 L53 30 L67 30 L67 21 Z"/>
  <ellipse class="b" cx="60" cy="14" rx="8.5" ry="10.5"/>
  <path class="band" d="M51.6 8.5 Q60 5.5 68.4 8.5 L68.7 11.5 Q60 8.8 51.3 11.5 Z"/>
  <path class="face" d="M54.5 12.5 L58 13.5 M65.5 12.5 L62 13.5"/>
  <circle class="eye" cx="56.6" cy="15" r="0.9"/>
  <circle class="eye" cx="63.4" cy="15" r="0.9"/>
  <path class="eye" d="M55 18.5 Q60 23.5 65 18.5 Q60 20.5 55 18.5 Z"/>
  <path class="b" d="M44 114 L40 117 L47 117 C50 122 55 126 60 130 C65 126 70 122 73 117 L80 117 L76 114 C70 118 50 118 44 114 Z"/>
  ${toonLimbs}`;

const TOON_NEUTRAL_BACK = `
  <path class="b" d="M54 21 L54 26 L66 26 L66 21 Z"/>
  <ellipse class="b" cx="60" cy="14" rx="8.5" ry="10.5"/>
  <path class="band" d="M51.6 8.5 Q60 5.5 68.4 8.5 L68.7 11.5 Q60 8.8 51.3 11.5 Z"/>
  ${toonLimbs}`;

let bodyStyle = 'toon';

/** Chooses the figure: 'toon' or 'classic'. */
export function setBodyStyle(style) {
  bodyStyle = style;
}

function shapes(list, primary, secondary) {
  return list.map(([id, d]) => {
    const cls = primary.has(id) ? 'm p' : secondary.has(id) ? 'm s' : 'm';
    return `<path class="${cls}" d="${d}"/>`;
  }).join('');
}

function figure(list, neutral, x, primary, secondary) {
  const half = shapes(list, primary, secondary);
  return `<g transform="translate(${x} 0)">${neutral}${half}<g transform="translate(120 0) scale(-1 1)">${half}</g></g>`;
}

/** Returns an inline SVG with a front and back figure. Primary muscles are strong, secondary ones lighter. */
export function bodyMap({ primary = [], secondary = [] } = {}) {
  const p = new Set(primary);
  const s = new Set(secondary.filter((id) => !p.has(id)));
  if (bodyStyle === 'toon') {
    return `<svg class="bodymap toon" viewBox="0 0 250 248" aria-hidden="true">${figure(TOON_FRONT, TOON_NEUTRAL_FRONT, 0, p, s)}${figure(TOON_BACK, TOON_NEUTRAL_BACK, 130, p, s)}</svg>`;
  }
  return `<svg class="bodymap" viewBox="0 0 250 244" aria-hidden="true">${figure(FRONT, NEUTRAL_FRONT, 0, p, s)}${figure(BACK, NEUTRAL_BACK, 130, p, s)}</svg>`;
}

/** Combines the muscles of several exercises. A muscle that is primary anywhere counts as primary. */
export function combineMuscles(lists) {
  const primary = new Set(lists.flatMap((m) => m.primary ?? []));
  const secondary = new Set(lists.flatMap((m) => m.secondary ?? []).filter((id) => !primary.has(id)));
  return { primary: [...primary], secondary: [...secondary] };
}
