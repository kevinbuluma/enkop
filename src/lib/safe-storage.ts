// Browser storage throws when a visitor blocks site data (and setItem throws when storage is full);
// preferences are optional, so every read falls back to null and every write is best effort.
type Area = 'local' | 'session';

function store(area: Area): Storage | null {
  try {
    return area === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStored(key: string, area: Area = 'local'): string | null {
  try {
    return store(area)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Writes `value`, or removes the key when `value` is null. */
export function writeStored(key: string, value: string | null, area: Area = 'local') {
  try {
    const s = store(area);
    if (value === null) s?.removeItem(key);
    else s?.setItem(key, value);
  } catch {
    /* blocked or full */
  }
}
