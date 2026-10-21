const CHUNK_RECOVERY_KEY = 'qwp-chunk-recovery-at';
const CHUNK_RECOVERY_COOLDOWN_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to fetch dynamically imported module|dynamically imported module|loading chunk|importing a module script failed/i.test(error.message)
    || error.name === 'ChunkLoadError';
}

/** Reloads once per cooldown when an open tab still points at an old hashed bundle. */
export function recoverFromChunkLoadError(error: unknown): boolean {
  if (!isChunkLoadError(error) || typeof window === 'undefined') return false;

  try {
    const now = Date.now();
    const lastRecovery = Number(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) || 0);
    if (now - lastRecovery < CHUNK_RECOVERY_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
  } catch {
    // Storage can be unavailable in strict privacy modes; let the caller show recovery UI.
    return false;
  }

  window.location.reload();
  return true;
}

export function clearChunkRecoveryCooldown(): void {
  try {
    window.sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
  } catch {
    // The recovery cooldown is best effort only.
  }
}
