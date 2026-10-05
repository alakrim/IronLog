import { e1rm } from './e1rm';
import type { Exercise, ID, Muscle, Workout } from './types';

const DAY = 24 * 3600 * 1000;
const working = (w: Workout) => w.status === 'completed' && !w.deleted;

/** Monday 00:00 local time of the week containing t. */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export interface ExercisePoint {
  date: number;
  workoutId: ID;
  topWeight: number;
  topReps: number;
  bestE1rm: number | null;
  volume: number;
  sets: number;
  tested1rm: number | null;
}

export function exerciseSeries(exerciseId: ID, workouts: Workout[]): ExercisePoint[] {
  const out: ExercisePoint[] = [];
  for (const w of workouts.filter(working)) {
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId) continue;
      const sets = e.sets.filter((s) => s.done && s.kind !== 'warmup' && s.reps > 0);
      if (!sets.length) continue;
      const top = sets.reduce((a, b) => (b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a));
      const ests = sets.map((s) => e1rm(s.weightKg, s.reps, null)).filter((v): v is number => v != null);
      const singles = sets.filter((s) => s.reps === 1).map((s) => s.weightKg);
      out.push({
        date: w.startedAt, workoutId: w.id, topWeight: top.weightKg, topReps: top.reps,
        bestE1rm: ests.length ? Math.max(...ests) : null,
        volume: sets.reduce((a, s) => a + s.weightKg * s.reps, 0),
        sets: sets.length,
        tested1rm: singles.length ? Math.max(...singles) : null,
      });
    }
  }
  return out.sort((a, b) => a.date - b.date);
}

export interface WeekBucket { weekStart: number; volume: number; sets: number; workouts: number }

export function weeklyBuckets(workouts: Workout[], weeks: number, now: number): WeekBucket[] {
  const start = weekStart(now) - (weeks - 1) * 7 * DAY;
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: weekStart(start + i * 7 * DAY + DAY / 2), volume: 0, sets: 0, workouts: 0,
  }));
  for (const w of workouts.filter(working)) {
    const ws = weekStart(w.startedAt);
    const b = buckets.find((x) => x.weekStart === ws);
    if (!b) continue;
    b.workouts++;
    for (const e of w.entries) for (const s of e.sets) {
      if (!s.done || s.kind === 'warmup') continue;
      b.sets++;
      b.volume += s.weightKg * s.reps;
    }
  }
  return buckets;
}

export interface MonthBucket { month: string; volume: number; workouts: number }

export function monthlyBuckets(workouts: Workout[], months: number, now: number): MonthBucket[] {
  const d = new Date(now);
  const out: MonthBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ month: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, volume: 0, workouts: 0 });
  }
  for (const w of workouts.filter(working)) {
    const t = new Date(w.startedAt);
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    const b = out.find((x) => x.month === key);
    if (!b) continue;
    b.workouts++;
    for (const e of w.entries) for (const s of e.sets) if (s.done && s.kind !== 'warmup') b.volume += s.weightKg * s.reps;
  }
  return out;
}

/** Hard sets per muscle: 1 for the primary muscle, 0.5 for each secondary. */
export function muscleSets(
  workouts: Workout[], exercises: Map<ID, Exercise>, since: number,
): { muscle: Muscle; sets: number }[] {
  const acc = new Map<Muscle, number>();
  for (const w of workouts.filter(working)) {
    if (w.startedAt < since) continue;
    for (const e of w.entries) {
      const ex = exercises.get(e.exerciseId);
      if (!ex) continue;
      const n = e.sets.filter((s) => s.done && s.kind !== 'warmup').length;
      if (!n) continue;
      acc.set(ex.primary, (acc.get(ex.primary) ?? 0) + n);
      for (const m of ex.secondary) acc.set(m, (acc.get(m) ?? 0) + n * 0.5);
    }
  }
  return [...acc.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets);
}

export function exerciseFrequency(workouts: Workout[]): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const w of workouts.filter(working)) {
    for (const id of new Set(w.entries.filter((e) => e.sets.some((s) => s.done)).map((e) => e.exerciseId))) {
      m.set(id, (m.get(id) ?? 0) + 1);
    }
  }
  return m;
}

/** Consecutive weeks (ending this week or last week) with at least one workout. */
export function weekStreak(workouts: Workout[], now: number): number {
  const weeks = new Set(workouts.filter(working).map((w) => weekStart(w.startedAt)));
  let t = weekStart(now);
  if (!weeks.has(t)) t = weekStart(t - DAY);
  let n = 0;
  while (weeks.has(t)) { n++; t = weekStart(t - DAY); }
  return n;
}

export function workoutVolume(w: Workout): number {
  let v = 0;
  for (const e of w.entries) for (const s of e.sets) if (s.done && s.kind !== 'warmup') v += s.weightKg * s.reps;
  return v;
}
