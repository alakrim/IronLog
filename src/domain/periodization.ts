/**
 * Training blocks, deload signals and heavy-day scheduling. Pure and deterministic:
 * every function takes `now` explicitly.
 */
import { e1rm } from './e1rm';
import type { Block, Program, Settings, Workout } from './types';

export const WEEK_MS = 7 * 24 * 3600 * 1000;

let n = 0;
const bid = () => `blk_${Date.now().toString(36)}_${(n++).toString(36)}`;

export function block(partial: Omit<Block, 'id'>): Block {
  return { id: bid(), ...partial };
}

/** Default 15-week cycle from the specification: hypertrophy → strength → deload. */
export function defaultBlocks(): Block[] {
  return [
    block({ name: 'Hypertrophy I', type: 'hypertrophy', weeks: 4, repMin: 8, repMax: 12, sets: 3, targetRir: 2, method: 'double', setFactor: 1, loadFactor: 1 }),
    block({ name: 'Hypertrophy II', type: 'hypertrophy', weeks: 4, repMin: 6, repMax: 10, sets: 3, targetRir: 2, method: 'double', setFactor: 1, loadFactor: 1 }),
    block({ name: 'Strength I', type: 'strength', weeks: 3, repMin: 3, repMax: 6, sets: 4, targetRir: 2, method: 'double', setFactor: 1, loadFactor: 1 }),
    block({ name: 'Strength II', type: 'strength', weeks: 3, repMin: 3, repMax: 5, sets: 4, targetRir: 1, method: 'double', setFactor: 1, loadFactor: 1 }),
    block({ name: 'Deload', type: 'deload', weeks: 1, repMin: 8, repMax: 12, sets: 0, targetRir: 4, method: 'none', setFactor: 0.5, loadFactor: 0.9 }),
  ];
}

export interface ProgramStatus {
  block: Block;
  index: number;
  week: number;
  /** True once the planned number of weeks has elapsed. */
  complete: boolean;
  next: Block;
  nextIndex: number;
}

export function programStatus(p: Program, now: number): ProgramStatus | null {
  if (!p.active || p.blocks.length === 0) return null;
  const index = Math.min(Math.max(0, p.currentBlockIndex), p.blocks.length - 1);
  const b = p.blocks[index];
  const week = Math.floor(Math.max(0, now - p.blockStartedAt) / WEEK_MS) + 1;
  const nextIndex = (index + 1) % p.blocks.length;
  return { block: b, index, week, complete: week > b.weeks, next: p.blocks[nextIndex], nextIndex };
}

/** Move to the next block (wraps to start a new cycle). Never automatic: the user confirms. */
export function advanceProgram(p: Program, now: number, toIndex?: number): Program {
  const idx = toIndex ?? (p.currentBlockIndex + 1) % p.blocks.length;
  return { ...p, currentBlockIndex: idx, blockStartedAt: now, updatedAt: now };
}

// ---------------------------------------------------------------------------
// Deload advice
// ---------------------------------------------------------------------------

export interface DeloadAdvice { recommend: boolean; reasons: string[] }

export const DECLINE_SESSIONS = 3;
export const DECLINE_EXERCISES = 2;
export const HARD_SESSION_STREAK = 6;

function bestE1rmPerSession(workouts: Workout[], exerciseId: string): number[] {
  const out: number[] = [];
  for (const w of workouts) {
    if (w.isDeload) continue;
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId) continue;
      const v = Math.max(0, ...e.sets.filter((s) => s.done && s.kind !== 'warmup').map((s) => e1rm(s.weightKg, s.reps, s.rir) ?? 0));
      if (v > 0) out.push(v);
    }
  }
  return out;
}

/**
 * Signals (any one is enough):
 *  1. Planned interval: ≥ deloadEveryWeeks since the last deload (only without an active programme —
 *     programmes schedule their own deload block).
 *  2. Performance decline: on ≥2 exercises, estimated 1RM fell in each of the last 3 sessions.
 *  3. Effort streak: ≥6 consecutive sessions where every recorded set was at RIR 0 (to failure).
 * The user can dismiss; advice is suppressed for 7 days after dismissal or after a deload.
 */
export function deloadAdvice(
  completed: Workout[], settings: Settings, programActive: boolean, now: number, dismissedAt: number | null,
): DeloadAdvice {
  const ws = completed.filter((w) => w.status === 'completed').sort((a, b) => b.startedAt - a.startedAt);
  const reasons: string[] = [];
  if (ws.length === 0) return { recommend: false, reasons };
  const lastDeload = ws.find((w) => w.isDeload);
  if (lastDeload && now - lastDeload.startedAt < WEEK_MS) return { recommend: false, reasons };
  if (dismissedAt && now - dismissedAt < WEEK_MS) return { recommend: false, reasons };

  if (!programActive && settings.deloadEveryWeeks > 0) {
    const since = lastDeload ? lastDeload.startedAt : ws[ws.length - 1].startedAt;
    const weeks = Math.floor((now - since) / WEEK_MS);
    if (weeks >= settings.deloadEveryWeeks) reasons.push(`${weeks} weeks since your last deload (planned every ${settings.deloadEveryWeeks}).`);
  }

  const exIds = [...new Set(ws.flatMap((w) => w.entries.map((e) => e.exerciseId)))];
  const declining = exIds.filter((id) => {
    const v = bestE1rmPerSession(ws, id).slice(0, DECLINE_SESSIONS + 1);
    if (v.length < DECLINE_SESSIONS + 1) return false;
    for (let i = 0; i < DECLINE_SESSIONS; i++) if (!(v[i] < v[i + 1] - 1e-6)) return false;
    return true;
  });
  if (declining.length >= DECLINE_EXERCISES) {
    reasons.push(`Estimated 1RM has dropped ${DECLINE_SESSIONS} sessions in a row on ${declining.length} exercises.`);
  }

  let streak = 0;
  for (const w of ws) {
    if (w.isDeload) break;
    const rirs = w.entries.flatMap((e) => e.sets.filter((s) => s.done && s.rir != null).map((s) => s.rir as number));
    if (rirs.length > 0 && rirs.every((r) => r === 0)) streak++;
    else break;
  }
  if (streak >= HARD_SESSION_STREAK) reasons.push(`${streak} sessions in a row taken to failure on every recorded set.`);

  return { recommend: reasons.length > 0, reasons };
}

/** Heavy exposure is due after `heavyEveryWeeks` without a heavy session (not during strength/deload blocks). */
export function heavyDue(completed: Workout[], settings: Settings, blockType: Block['type'] | null, now: number): boolean {
  if (settings.heavyEveryWeeks <= 0) return false;
  if (blockType === 'strength' || blockType === 'deload') return false;
  const ws = completed.filter((w) => w.status === 'completed');
  if (ws.length === 0) return false;
  const lastHeavy = ws.filter((w) => w.isHeavy).sort((a, b) => b.startedAt - a.startedAt)[0];
  const since = lastHeavy ? lastHeavy.startedAt : Math.min(...ws.map((w) => w.startedAt));
  return now - since >= settings.heavyEveryWeeks * WEEK_MS;
}
