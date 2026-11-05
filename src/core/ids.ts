/** Stable random ids: 16 lowercase hex chars. Used as tile filenames, so keep them filename-safe. */
export function newId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export const isValidId = (s: string): boolean => /^[0-9a-f]{16}$/.test(s);
