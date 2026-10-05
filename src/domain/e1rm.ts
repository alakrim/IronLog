/**
 * Estimated one-rep max — Epley formula (Epley, 1985):
 *   e1RM = weight × (1 + reps / 30)        (reps = 1 → weight)
 * Only computed for 1–12 reps; beyond that the estimate is too unreliable to track.
 * When RIR is known, reps-in-reserve are added (reps + RIR ≈ reps to failure).
 * This is an ESTIMATE for tracking progress, never a tested max.
 */
export const E1RM_MAX_REPS = 12;

export function e1rm(weightKg: number, reps: number, rir: number | null = null): number | null {
  if (!(weightKg > 0) || !(reps >= 1)) return null;
  const toFailure = reps + (rir != null && rir > 0 ? Math.min(rir, 4) : 0);
  if (toFailure > E1RM_MAX_REPS) return null;
  if (toFailure === 1) return weightKg;
  return weightKg * (1 + toFailure / 30);
}

/** Inverse Epley: load for `reps` performed with `rir` reps in reserve. */
export function loadForReps(e1rmKg: number, reps: number, rir: number | null = null): number {
  const toFailure = reps + (rir ?? 0);
  if (toFailure <= 1) return e1rmKg;
  return e1rmKg / (1 + toFailure / 30);
}
