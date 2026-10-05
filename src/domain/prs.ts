/**
 * Personal-record detection. PRs are only reported when the exercise has prior history
 * (a first session is a baseline, not a record).
 *   max_weight     heaviest load lifted for ≥1 rep
 *   reps_at_weight more reps than ever done at this load or heavier (rep PR)
 *   e1rm           best estimated 1RM (Epley, ≤12 reps)
 *   volume         most load × reps in one session (working sets)
 */
import { e1rm } from './e1rm';
import { EPS } from './loads';
import type { ID, PersonalRecord, PRType, SetLog, Workout } from './types';

export interface Bests {
  hasHistory: boolean;
  maxWeight: number;
  bestE1rm: number;
  bestVolume: number;
  /** [weight, reps] pairs of all sets, for rep-PR lookup. */
  sets: [number, number][];
}

const counts = (s: SetLog) => s.done && s.kind !== 'warmup' && s.reps > 0 && s.weightKg >= 0;

export function bestsFor(exerciseId: ID, prior: Workout[]): Bests {
  const b: Bests = { hasHistory: false, maxWeight: 0, bestE1rm: 0, bestVolume: 0, sets: [] };
  for (const w of prior) {
    if (w.status !== 'completed' || w.deleted) continue;
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId) continue;
      let vol = 0;
      for (const s of e.sets) {
        if (!counts(s)) continue;
        b.hasHistory = true;
        b.maxWeight = Math.max(b.maxWeight, s.weightKg);
        b.bestE1rm = Math.max(b.bestE1rm, e1rm(s.weightKg, s.reps, null) ?? 0);
        b.sets.push([s.weightKg, s.reps]);
        vol += s.weightKg * s.reps;
      }
      b.bestVolume = Math.max(b.bestVolume, vol);
    }
  }
  return b;
}

export function repsAtOrAbove(b: Bests, weight: number): number {
  let r = 0;
  for (const [w, reps] of b.sets) if (w >= weight - EPS) r = Math.max(r, reps);
  return r;
}

export interface SetPR { type: PRType; value: number }

/** PRs a single set would set against prior bests (used live while logging). */
export function setPRs(set: Pick<SetLog, 'weightKg' | 'reps'>, b: Bests): SetPR[] {
  if (!b.hasHistory || set.reps <= 0) return [];
  const out: SetPR[] = [];
  // Bodyweight-only sets (no added load): only a rep PR is meaningful.
  if (set.weightKg <= 0) return set.reps > repsAtOrAbove(b, 0) ? [{ type: 'reps_at_weight', value: set.reps }] : [];
  if (set.weightKg > b.maxWeight + EPS) out.push({ type: 'max_weight', value: set.weightKg });
  else if (set.reps > repsAtOrAbove(b, set.weightKg)) out.push({ type: 'reps_at_weight', value: set.reps });
  const est = e1rm(set.weightKg, set.reps, null);
  if (est != null && est > b.bestE1rm + EPS) out.push({ type: 'e1rm', value: est });
  return out;
}

let k = 0;
const pid = () => `pr_${Date.now().toString(36)}_${(k++).toString(36)}`;

/** All PRs achieved in a finished workout, at most one per type per exercise (the best). */
export function detectPRs(workout: Workout, prior: Workout[]): PersonalRecord[] {
  const before = prior.filter((w) => w.id !== workout.id && w.startedAt < workout.startedAt);
  const out: PersonalRecord[] = [];
  const date = workout.finishedAt ?? workout.startedAt;
  for (const e of workout.entries) {
    const b = bestsFor(e.exerciseId, before);
    if (!b.hasHistory) continue;
    const best = new Map<PRType, PersonalRecord>();
    const consider = (type: PRType, value: number, s: SetLog) => {
      const cur = best.get(type);
      if (!cur || value > cur.value) {
        best.set(type, { id: pid(), exerciseId: e.exerciseId, type, value, weightKg: s.weightKg, reps: s.reps, workoutId: workout.id, date });
      }
    };
    let vol = 0;
    for (const s of e.sets) {
      if (!counts(s)) continue;
      vol += s.weightKg * s.reps;
      for (const pr of setPRs(s, b)) consider(pr.type, pr.type === 'reps_at_weight' ? s.reps : pr.value, s);
    }
    if (vol > b.bestVolume + EPS) {
      best.set('volume', { id: pid(), exerciseId: e.exerciseId, type: 'volume', value: vol, weightKg: 0, reps: 0, workoutId: workout.id, date });
    }
    out.push(...best.values());
  }
  return out;
}

export const PR_LABEL: Record<PRType, string> = {
  max_weight: 'Heaviest weight',
  reps_at_weight: 'Rep PR',
  e1rm: 'Est. 1RM',
  volume: 'Volume PR',
  tested_1rm: 'Tested 1RM',
};
