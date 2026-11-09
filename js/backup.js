// Backup to a private GitHub repository through the Contents API.
// The access token never goes into the backup file.

const FILE = 'gymlog-backup.json';
const API = 'https://api.github.com';

export function buildBackup({ exercises, workouts, sets, notes, schema }) {
  return {
    app: 'gymlog',
    version: 1,
    exportedAt: new Date().toISOString(),
    schema,
    exercises,
    workouts,
    sets,
    notes,
  };
}

export function validateBackup(data) {
  const ok =
    data && data.app === 'gymlog' &&
    ['exercises', 'workouts', 'sets', 'notes'].every((k) => Array.isArray(data[k])) &&
    data.sets.every((s) => s.id && s.exerciseId && Number.isFinite(s.weight) && Number.isFinite(s.reps) && /^\d{4}-\d{2}-\d{2}$/.test(s.date));
  if (!ok) throw new Error('This is not a valid GymBro backup file.');
  return data;
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function errorFor(status) {
  if (status === 401) return 'The token is invalid or expired. Create a new one.';
  if (status === 403 || status === 404) return 'No access. Check the repository name and the token permissions.';
  return `GitHub returned an error (${status}).`;
}

/** GitHub's own explanation, added to the message so a problem can be traced. */
async function detail(res) {
  try {
    const body = await res.json();
    return body?.message ? ` (GitHub: ${body.message})` : ` (${res.status})`;
  } catch {
    return ` (${res.status})`;
  }
}

async function request(gh, path, options = {}) {
  // 'no-store': the file itself and its details share one ETag at GitHub, so a stored copy of
  // the file could come back where the details (with the sha) were asked for.
  const res = await fetch(`${API}/repos/${gh.repo}/contents/${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      Authorization: `Bearer ${gh.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      Accept: 'application/vnd.github+json',
      ...options.headers,
    },
  });
  return res;
}

async function currentSha(gh) {
  const res = await request(gh, FILE);
  if (res.status === 404) {
    // A token without access also gets a 404, so check the repository itself.
    const repo = await fetch(`${API}/repos/${gh.repo}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${gh.token}`, Accept: 'application/vnd.github+json' },
    });
    if (!repo.ok) throw new Error(errorFor(repo.status));
    return null;
  }
  if (!res.ok) throw new Error(errorFor(res.status));
  const { sha } = await res.json();
  if (typeof sha !== 'string') throw new Error('GitHub did not say which version of the backup is there. Try again in a minute.');
  return sha;
}

export async function pushBackup(gh, backup) {
  const content = toBase64(JSON.stringify(backup));
  const message = `Backup ${backup.exportedAt.slice(0, 16).replace('T', ' ')}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sha = await currentSha(gh);
    const res = await request(gh, FILE, {
      method: 'PUT',
      body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) }),
    });
    if (res.ok) return;
    // 409: the file changed in the meantime, so retry with the newest version.
    if (res.status === 409 && attempt === 0) continue;
    // Reading worked a moment ago, so a refusal here means the token may only read.
    if (res.status === 403 || res.status === 404) {
      throw new Error(`The token can read but not save. On GitHub, edit the token and set Contents to "Read and write".${await detail(res)}`);
    }
    throw new Error(`${errorFor(res.status)}${await detail(res)}`);
  }
}

export async function fetchBackup(gh) {
  const res = await request(gh, FILE, { headers: { Accept: 'application/vnd.github.raw+json' } });
  if (res.status === 404) throw new Error('There is no backup in this repository yet.');
  if (!res.ok) throw new Error(errorFor(res.status));
  return validateBackup(await res.json());
}
