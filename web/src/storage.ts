/**
 * localStorage that tolerates being unavailable (private browsing, disabled
 * storage, quota): a preference that cannot be read falls back to its default
 * and one that cannot be saved still applies for this visit.
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted; the in-memory state is still correct.
  }
}

export function readStoredFlag(key: string, fallback = false): boolean {
  const value = readStored(key);
  return value === "1" ? true : value === "0" ? false : fallback;
}

export function readStoredJson<T extends object>(key: string): Partial<T> {
  const raw = readStored(key);
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<T>) : {};
  } catch {
    return {};
  }
}
