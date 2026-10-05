import type { Equipment, EquipmentProfile, Unit } from './types';

export const KG_PER_LB = 0.45359237;
export const EPS = 1e-6;

export const toDisplay = (kg: number, unit: Unit): number =>
  unit === 'kg' ? kg : kg / KG_PER_LB;
export const fromDisplay = (v: number, unit: Unit): number =>
  unit === 'kg' ? v : v * KG_PER_LB;

/** Formats a load for display, trimming trailing zeros: 82.5, 80, 1.25. */
export function fmtLoad(kg: number, unit: Unit): string {
  const v = toDisplay(kg, unit);
  const r = Math.round(v * 100) / 100;
  return String(Number(r.toFixed(2)));
}

const key = (n: number) => Math.round(n * 1e4) / 1e4;

/** All sums reachable with unlimited copies of each plate, up to `limit`. */
export function plateSums(plates: number[], limit: number): number[] {
  const sums = new Set<number>([0]);
  const usable = [...new Set(plates.filter((p) => p > 0))].sort((a, b) => a - b);
  for (const p of usable) {
    const current = [...sums].sort((a, b) => a - b);
    for (const base of current) {
      for (let s = base + p; s <= limit + EPS; s += p) {
        const k = key(s);
        if (sums.has(k)) continue;
        sums.add(k);
      }
    }
  }
  return [...sums].sort((a, b) => a - b);
}

const cache = new Map<string, number[]>();

/**
 * Every load the user can actually set up for a piece of equipment.
 * Barbell: bar + plates on both sides. Bodyweight: added load from plates (0 = bodyweight only).
 * Dumbbell: the listed dumbbells. Machine / cable: multiples of the stack step.
 */
export function achievableLoads(
  equipment: Equipment,
  profile: EquipmentProfile,
  fallbackStepKg = 1,
  maxKg = 400,
): number[] {
  const id = JSON.stringify([equipment, profile, fallbackStepKg, maxKg]);
  const hit = cache.get(id);
  if (hit) return hit;
  let out: number[];
  switch (equipment) {
    case 'barbell':
      out = plateSums(profile.platesKg, (maxKg - profile.barKg) / 2).map((s) => key(profile.barKg + 2 * s));
      break;
    case 'bodyweight':
      out = plateSums(profile.platesKg, 120);
      break;
    case 'dumbbell':
      out = [...new Set(profile.dumbbellsKg.map(key))].sort((a, b) => a - b);
      break;
    case 'machine':
      out = steps(profile.machineStepKg, maxKg);
      break;
    case 'cable':
      out = steps(profile.cableStepKg, 150);
      break;
    default:
      out = steps(fallbackStepKg > 0 ? fallbackStepKg : 1, maxKg);
  }
  if (out.length === 0) out = steps(1, maxKg);
  cache.set(id, out);
  return out;
}

function steps(step: number, max: number): number[] {
  const s = step > 0 ? step : 1;
  const out: number[] = [];
  for (let i = 1; i * s <= max + EPS; i++) out.push(key(i * s));
  return out;
}

/** Load closest to target (ties go lower). */
export function snapLoad(target: number, loads: number[]): number {
  if (loads.length === 0) return target;
  let best = loads[0];
  for (const l of loads) {
    const d = Math.abs(l - target), bd = Math.abs(best - target);
    if (d < bd - EPS) best = l;
  }
  return best;
}

/** Largest achievable load not above target (or the smallest load if none). */
export function loadAtOrBelow(target: number, loads: number[]): number {
  let best: number | null = null;
  for (const l of loads) if (l <= target + EPS) best = l;
  return best ?? loads[0] ?? target;
}

export interface JumpResult {
  load: number;
  /** True when even the smallest available step exceeds the configured jump cap. */
  exceedsCap: boolean;
}

/**
 * Next achievable load above `current`, aiming for `current + preferredKg`.
 * Never jumps more than maxJumpPct unless the smallest available step is already larger.
 */
export function nextLoadUp(
  current: number,
  preferredKg: number,
  loads: number[],
  maxJumpPct: number,
): JumpResult | null {
  const above = loads.filter((l) => l > current + EPS);
  if (above.length === 0) return null;
  const smallest = above[0];
  const cap = current * (1 + maxJumpPct);
  const allowed = above.filter((l) => l <= cap + EPS);
  if (allowed.length === 0) return { load: smallest, exceedsCap: true };
  return { load: snapLoad(current + preferredKg, allowed), exceedsCap: false };
}

/** Fewest plates per side to build a barbell load (heaviest first). Null if not buildable. */
export function platesPerSide(totalKg: number, profile: EquipmentProfile): number[] | null {
  const target = key((totalKg - profile.barKg) / 2);
  if (target < -EPS) return null;
  if (Math.abs(target) < EPS) return [];
  const plates = [...new Set(profile.platesKg.filter((p) => p > 0))];
  const sums = plateSums(plates, target);
  const best = new Map<number, number[]>([[0, []]]);
  for (const s of sums) {
    if (s === 0) continue;
    let cand: number[] | null = null;
    for (const p of plates) {
      const prev = best.get(key(s - p));
      if (prev && (!cand || prev.length + 1 < cand.length)) cand = [...prev, p];
    }
    if (cand) best.set(s, cand);
  }
  const res = best.get(target);
  return res ? res.sort((a, b) => b - a) : null;
}
