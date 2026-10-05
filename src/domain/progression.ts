/**
 * Deterministic progression engine. See docs/RULES.md for the plain-language rules.
 * Pure functions: same inputs → same recommendation, with human-readable reasons.
 */
import { exName, t, tn } from '../i18n';
import { e1rm, loadForReps } from './e1rm';
import { achievableLoads, EPS, loadAtOrBelow, nextLoadUp } from './loads';
import type {
  Block, EntryTarget, Exercise, ProgressionSettings, SetKind, SetLog, Settings, TemplateItem,
} from './types';

export interface HistoryEntry {
  date: number;
  isDeload: boolean;
  /** Heavy-exposure sessions feed e1RM but don't drive normal progression. */
  isHeavy?: boolean;
  target: EntryTarget;
  sets: SetLog[];
}

export type Action = 'start' | 'increase' | 'maintain' | 'reduce' | 'transition' | 'deload' | 'heavy';

export interface PlannedSet { kind: SetKind; weightKg: number | null; reps: number }

export interface Recommendation {
  action: Action;
  /** Main working (or top-set) load. Null when there is no history to base it on. */
  weightKg: number | null;
  target: EntryTarget;
  plan: PlannedSet[];
  reasons: string[];
  /** Last comparable session, for the "previous" column. */
  previous: SetLog[];
}

export interface Context {
  isDeload?: boolean;
  isHeavy?: boolean;
  deloadLoadFactor?: number;
  deloadSetFactor?: number;
}

const r1 = (n: number) => Math.round(n * 100) / 100;
const kg = (n: number) => `${r1(n)} kg`;
const isWork = (s: SetLog) => s.done && s.kind !== 'warmup' && s.reps > 0;

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

/**
 * Resolve what the user should aim for today.
 * Blocks override rep ranges for COMPOUND lifts only; isolation lifts keep their own
 * ranges (3–5 rep lateral raises are not useful). Deload blocks are applied via Context.
 */
export function resolveTarget(
  exercise: Exercise,
  item: TemplateItem | null,
  block: Block | null,
): EntryTarget {
  const base: EntryTarget = item
    ? { sets: item.sets, repMin: item.repMin, repMax: item.repMax, targetRir: item.targetRir, method: item.method, restSec: item.restSec }
    : { sets: exercise.sets, repMin: exercise.repMin, repMax: exercise.repMax, targetRir: 2, method: exercise.method, restSec: null };
  if (!block || block.type === 'deload' || exercise.type !== 'compound') return base;
  return {
    ...base,
    sets: block.sets > 0 ? block.sets : base.sets,
    repMin: block.repMin,
    repMax: block.repMax,
    targetRir: block.targetRir,
    method: block.method,
  };
}

export const HEAVY_TARGET: Omit<EntryTarget, 'restSec'> = {
  sets: 4, repMin: 4, repMax: 6, targetRir: 2, method: 'linear',
};
/** Max jump allowed when a rep-range change re-bases the load from e1RM. */
export const TRANSITION_CAP = 0.15;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function recommend(
  exercise: Exercise,
  target: EntryTarget,
  history: HistoryEntry[],
  settings: Settings,
  ctx: Context = {},
): Recommendation {
  const loads = achievableLoads(exercise.equipment, settings.equipment, exercise.incrementKg);
  const all = history
    .filter((h) => !h.isDeload && h.sets.some(isWork))
    .sort((a, b) => b.date - a.date);
  const sessions = all.filter((h) => !h.isHeavy);
  const prevSession = ctx.isHeavy ? all[0] : sessions[0] ?? all[0];
  const previous = prevSession?.sets.filter((s) => s.done) ?? [];

  let rec = baseRecommendation(exercise, target, sessions, settings, loads);
  rec.previous = previous;

  if (ctx.isHeavy && exercise.type === 'compound') rec = applyHeavy(rec, exercise, all, loads);
  if (ctx.isDeload) rec = applyDeload(rec, ctx, loads);
  return rec;
}

function baseRecommendation(
  exercise: Exercise,
  target: EntryTarget,
  sessions: HistoryEntry[],
  settings: Settings,
  loads: number[],
): Recommendation {
  const p = settings.progression;
  const last = sessions[0];
  if (!last) {
    return {
      action: 'start', weightKg: null, target, previous: [],
      plan: planFor(target, null, null, settings.progression),
      reasons: [
        t('No history yet. Choose a load you can lift for about {reps} reps with 2–3 reps in reserve.', { reps: target.repMax }),
      ],
    };
  }

  const work = last.sets.filter(isWork);
  const useTop = target.method === 'top_backoff';
  const graded = useTop ? topSetOf(work) : work;
  const w = Math.max(...graded.map((s) => s.weightKg));
  const atW = graded.filter((s) => Math.abs(s.weightKg - w) < EPS);
  const reps = atW.map((s) => s.reps);
  const neededSets = useTop ? 1 : target.sets;
  const lastReps = reps.join('/');

  // 1. Rep range changed (new block, heavy → normal, edited template): re-base from e1RM.
  if (last.target.repMin !== target.repMin || last.target.repMax !== target.repMax) {
    const best = Math.max(...work.map((s) => e1rm(s.weightKg, s.reps, s.rir) ?? 0));
    if (best > 0) {
      const raw = loadForReps(best, target.repMax, target.targetRir ?? 2);
      const capped = Math.min(raw, w * (1 + TRANSITION_CAP));
      const load = loadAtOrBelow(capped, loads);
      return {
        action: 'transition', weightKg: load, target, previous: [],
        plan: planFor(target, load, null, p, loads),
        reasons: [
          t('Rep range changed from {a} to {b}.', { a: `${last.target.repMin}–${last.target.repMax}`, b: `${target.repMin}–${target.repMax}` }),
          t('Load re-based from your estimated 1RM ({e1rm}) for {reps} reps at RIR {rir}.', { e1rm: kg(best), reps: target.repMax, rir: target.targetRir ?? 2 })
            + (raw > capped + EPS ? ' ' + t('Capped at +{pct}%.', { pct: TRANSITION_CAP * 100 }) : ''),
        ],
      };
    }
  }

  if (target.method === 'none') {
    return mk('maintain', w, target, p, loads, reps, [t('Automatic progression is off for this exercise.')]);
  }

  // 2. Not all prescribed sets were completed → repeat.
  if (atW.length < neededSets) {
    return mk('maintain', w, target, p, loads, reps, [
      t('Last time: {done} of {total} sets completed at {w}. Complete all sets before adding load.', { done: atW.length, total: neededSets, w: kg(w) }),
    ]);
  }

  const hitTop = reps.slice(0, neededSets).every((r) => r >= target.repMax);
  const rir = rirCheck(atW, p);

  // 3. Top of the range on every set with acceptable effort → add load.
  if (hitTop && rir.ok) {
    const next = nextLoadUp(w, exercise.incrementKg, loads, settings.equipment.maxJumpPct);
    if (!next) {
      return mk('maintain', w, target, p, loads, reps, [
        t('Hit {reps}+ reps on all sets, but {w} is the heaviest load available. Add reps or a set.', { reps: target.repMax, w: kg(w) }),
      ]);
    }
    const reasons = [
      tn(neededSets, 'Hit {reps}+ reps on {n} set at {w} ({last}).', 'Hit {reps}+ reps on all {n} sets at {w} ({last}).', { reps: target.repMax, w: kg(w), last: lastReps }),
      rir.note,
      t('Increase to {next} (+{diff} kg) and aim for {reps}+ reps.', { next: kg(next.load), diff: r1(next.load - w), reps: target.repMin }),
    ];
    if (next.exceedsCap) {
      reasons.push(t('Smallest available jump is {pct}% — expect fewer reps at first.', { pct: Math.round(((next.load - w) / w) * 100) }));
    }
    return {
      action: 'increase', weightKg: next.load, target, previous: [],
      plan: planFor(target, next.load, null, p, loads), reasons: reasons.filter(Boolean) as string[],
    };
  }
  if (hitTop && !rir.ok) {
    return mk('maintain', w, target, p, loads, reps, [
      t('Reached {reps} reps on all sets, but effort was too high ({note}).', { reps: target.repMax, note: rir.note ?? '' }),
      t('Repeat this load until it feels easier.'),
    ]);
  }

  // 4. Below the rep floor: repeat, and reduce after repeated failures.
  if (reps.some((r) => r < target.repMin)) {
    const fails = consecutiveFailures(sessions, w, target, useTop);
    if (fails >= p.failuresBeforeReduce) {
      let load = loadAtOrBelow(w * (1 - p.reducePct), loads);
      if (load >= w - EPS) load = loadAtOrBelow(w - EPS * 10, loads);
      if (load < w - EPS) {
        return {
          action: 'reduce', weightKg: load, target, previous: [],
          plan: planFor(target, load, null, p, loads),
          reasons: [
            t('Below {reps} reps at {w} for {n} sessions in a row (last: {last}).', { reps: target.repMin, w: kg(w), n: fails, last: lastReps }),
            t('Reduce ~{pct}% to {load} and build back up.', { pct: Math.round(p.reducePct * 100), load: kg(load) }),
          ],
        };
      }
    }
    return mk('maintain', w, target, p, loads, reps, [
      t('Last time {last} at {w} — below the {reps}-rep floor.', { last: lastReps, w: kg(w), reps: target.repMin }),
      t('Repeat the load. A reduction is suggested after {n} sessions in a row below the floor.', { n: p.failuresBeforeReduce }),
    ]);
  }

  // 5. In range but not at the top → same load, beat the reps.
  return mk('maintain', w, target, p, loads, reps, [
    t('Last time {last} at {w}. Keep the load and add reps until every set reaches {reps}.', { last: lastReps, w: kg(w), reps: target.repMax }),
  ]);
}

function mk(
  action: Action, w: number, target: EntryTarget, p: ProgressionSettings, loads: number[],
  lastReps: number[], reasons: string[],
): Recommendation {
  return { action, weightKg: w, target, reasons, previous: [], plan: planFor(target, w, lastReps, p, loads) };
}

function topSetOf(work: SetLog[]): SetLog[] {
  const tops = work.filter((s) => s.kind === 'top');
  if (tops.length) return tops;
  if (!work.length) return [];
  const heaviest = Math.max(...work.map((s) => s.weightKg));
  return [work.find((s) => Math.abs(s.weightKg - heaviest) < EPS)!];
}

function rirCheck(sets: SetLog[], p: ProgressionSettings): { ok: boolean; note: string | null } {
  if (p.minRirToProgress == null) return { ok: true, note: null };
  const recorded = sets.filter((s) => s.rir != null).map((s) => s.rir as number);
  if (recorded.length === 0) return { ok: true, note: t('RIR not recorded — decided on reps alone.') };
  const avg = recorded.reduce((a, b) => a + b, 0) / recorded.length;
  const ok = avg >= p.minRirToProgress - EPS;
  return { ok, note: t(ok ? 'average RIR {avg} ≥ required {min}' : 'average RIR {avg} < required {min}', { avg: r1(avg), min: p.minRirToProgress }) };
}

function consecutiveFailures(sessions: HistoryEntry[], w: number, target: EntryTarget, useTop: boolean): number {
  let n = 0;
  for (const s of sessions) {
    if (s.target.repMin !== target.repMin || s.target.repMax !== target.repMax) break;
    const work = s.sets.filter(isWork);
    const graded = useTop ? topSetOf(work) : work;
    const atW = graded.filter((x) => Math.abs(x.weightKg - w) < EPS);
    if (atW.length === 0 || !atW.some((x) => x.reps < target.repMin)) break;
    n++;
  }
  return n;
}

/** Prefilled sets: rep goals are last reps + 1 (clamped to the range). */
export function planFor(
  target: EntryTarget, load: number | null, lastReps: number[] | null, p: ProgressionSettings,
  loads: number[] = [],
): PlannedSet[] {
  const goal = (i: number) => {
    const prev = lastReps?.[i];
    if (prev == null) return target.repMin;
    return Math.min(target.repMax, Math.max(target.repMin, prev + 1));
  };
  if (target.method === 'top_backoff') {
    const back = load == null ? null : loadAtOrBelow(load * p.backoffPct, loads.length ? loads : [load * p.backoffPct]);
    const out: PlannedSet[] = [{ kind: 'top', weightKg: load, reps: goal(0) }];
    for (let i = 1; i < target.sets; i++) out.push({ kind: 'backoff', weightKg: back, reps: target.repMax });
    return out;
  }
  return Array.from({ length: target.sets }, (_, i) => ({ kind: 'working' as SetKind, weightKg: load, reps: goal(i) }));
}

// ---------------------------------------------------------------------------
// Session modifiers
// ---------------------------------------------------------------------------

/** Heavy exposure: 4 × 4–6 @ RIR 2 from e1RM, capped, rounded down. */
function applyHeavy(rec: Recommendation, ex: Exercise, sessions: HistoryEntry[], loads: number[]): Recommendation {
  const target: EntryTarget = { ...HEAVY_TARGET, restSec: Math.max(rec.target.restSec ?? 0, 180) };
  const recent = sessions.slice(0, 3).flatMap((s) => s.sets.filter(isWork));
  const best = Math.max(0, ...recent.map((s) => e1rm(s.weightKg, s.reps, s.rir) ?? 0));
  if (!best || rec.weightKg == null) {
    return {
      ...rec, action: 'heavy', target,
      plan: Array.from({ length: target.sets }, () => ({ kind: 'working' as SetKind, weightKg: rec.weightKg, reps: target.repMin })),
      reasons: [t('Heavy day: {sets} × {range}. Not enough recent data to estimate a load — work up conservatively.', { sets: target.sets, range: `${target.repMin}–${target.repMax}` })],
    };
  }
  const raw = loadForReps(best, target.repMax, target.targetRir);
  const load = loadAtOrBelow(Math.min(raw, rec.weightKg * (1 + TRANSITION_CAP)), loads);
  return {
    ...rec, action: 'heavy', weightKg: load, target,
    plan: Array.from({ length: target.sets }, () => ({ kind: 'working' as SetKind, weightKg: load, reps: target.repMin })),
    reasons: [
      t('Heavy day for {name}: {sets} × {range} at RIR {rir}.', { name: exName(ex), sets: target.sets, range: `${target.repMin}–${target.repMax}`, rir: target.targetRir ?? 2 }),
      t('Load from recent estimated 1RM ({e1rm}), rounded down to {load}. Stop a set if form breaks.', { e1rm: kg(best), load: kg(load) }),
    ],
  };
}

function applyDeload(rec: Recommendation, ctx: Context, loads: number[]): Recommendation {
  const lf = ctx.deloadLoadFactor ?? 0.9;
  const sf = ctx.deloadSetFactor ?? 0.5;
  const sets = Math.max(1, Math.ceil(rec.target.sets * sf));
  const target: EntryTarget = { ...rec.target, sets, targetRir: 4 };
  // Deload from the last load actually lifted, not from a pending increase.
  const lifted = rec.previous.filter(isWork).map((s) => s.weightKg);
  const base = lifted.length ? Math.max(...lifted) : rec.weightKg;
  const load = base == null ? null : loadAtOrBelow(base * lf, loads);
  return {
    ...rec, action: 'deload', weightKg: load, target,
    plan: Array.from({ length: sets }, () => ({ kind: 'working' as SetKind, weightKg: load, reps: rec.target.repMin })),
    reasons: [
      tn(sets, 'Deload: {n} set instead of {orig}, ~{pct}% load, stop ~4 reps short of failure.', 'Deload: {n} sets instead of {orig}, ~{pct}% load, stop ~4 reps short of failure.', { orig: rec.target.sets, pct: Math.round(lf * 100) }),
      t('Progression resumes from your pre-deload numbers next session.'),
    ],
  };
}
