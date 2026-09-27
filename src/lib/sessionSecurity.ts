import type { Session } from '@supabase/supabase-js';

/** Persist a session's original start, never its most recent refresh time. */
export function sessionStartedAt(session: Session, now = Date.now()): number {
  let sessionId = session.user.id;
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { session_id?: string };
    sessionId = payload.session_id || sessionId;
  } catch { /* User id plus server last_sign_in_at is the conservative fallback. */ }
  const serverStart = Date.parse(session.user.last_sign_in_at || '');
  const key = `qualitrack_session_started_${session.user.id}_${sessionId}`;
  const saved = Number(localStorage.getItem(key));
  const start = saved > 0 && saved <= now ? saved : Number.isFinite(serverStart) && serverStart <= now ? serverStart : now;
  localStorage.setItem(key, String(start));
  return start;
}

export function clearPrivateDrafts(userId?: string): void {
  localStorage.removeItem('qualitrack_form_draft');
  if (!userId) return;
  const prefix = `qualitrack_monitoria_draft_${userId}_`;
  for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
}
