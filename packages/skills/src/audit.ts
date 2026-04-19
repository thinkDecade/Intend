import { createHash } from 'crypto';

/**
 * Skill invocation audit hook.
 *
 * The Skill Registry is a pure, stateless encoder — it must NOT take a
 * runtime dependency on @intend/data (no DB, no network). Callers (the
 * Execution Agent) wire an audit hook here so every buildTransaction call
 * emits a `skill_invoked` row to event_log. The hook is fire-and-forget;
 * thrown errors are swallowed so observability never breaks execution.
 */
export interface SkillAuditEvent {
  skill:     string;
  chain:     string;
  action:    string;
  version:   string;
  sha256:    string;
  args_hash: string;
  ts_ms:     number;
}

export type SkillAuditHook = (e: SkillAuditEvent) => void | Promise<void>;

let hook: SkillAuditHook | null = null;

/** Register a process-wide audit hook. Pass null to clear. */
export function setSkillAuditHook(h: SkillAuditHook | null): void {
  hook = h;
}

/** Internal: emit an event. Never throws. */
export function emitSkillAudit(e: SkillAuditEvent): void {
  if (!hook) return;
  try {
    const r = hook(e);
    if (r && typeof (r as Promise<void>).catch === 'function') {
      (r as Promise<void>).catch(() => { /* swallow */ });
    }
  } catch {
    /* swallow — audit must never break execution */
  }
}

/** Stable SHA-256 hash of skill request args (for redacted audit log). */
export function hashArgs(args: unknown): string {
  const json = JSON.stringify(args, Object.keys(args as object ?? {}).sort());
  return createHash('sha256').update(json).digest('hex');
}
