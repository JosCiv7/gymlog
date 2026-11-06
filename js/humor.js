// Quiet gym humor. Add or remove lines freely: each list only needs one line.

export const PR_LINES = [
  'Yeah buddy',
  'Lightweight baby',
  "Ain't nothin' but a peanut",
  'Boom bitch',
  'Maxed out bitchhhh',
  "Let's gooo",
  "We're all gonna make it",
  'The bar fears you now',
];

export const DROP_LINES = [
  'Bold strategy, going backwards.',
  'The weights did not get heavier, bro.',
  'Somewhere, your old PR is laughing.',
  'Deload week, right? Sure it is.',
  'Skipped breakfast or just skipped effort?',
  'Your ego called. It wants a refund.',
];

// The empty entries keep this line rare: repeating last time is normal.
export const SAME_LINES = [
  'Very consistent. Very suspicious.',
  'Same numbers. The plates are getting bored.',
  null, null, null, null, null, null, null, null,
];

export const DONE_WITH_PR = [
  'Lightweight baby.',
  'Yeah buddy.',
  'Go tell someone at the water fountain.',
];

export const DONE_NO_PR = [
  'No records today. You still showed up.',
  'Tomorrow you will call this a deload.',
];

/** The same seed always gets the same line, so a line does not change on every redraw. */
export function pickStable(lines, seed) {
  let hash = 0;
  for (const c of String(seed)) hash = (hash * 31 + c.charCodeAt(0)) % 100000;
  return lines[hash % lines.length];
}
