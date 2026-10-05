import { describe, expect, it } from 'vitest';
import { defaultSettings } from './defaults';
import { e1rm, loadForReps } from './e1rm';
import { achievableLoads, fmtLoad, nextLoadUp, platesPerSide, plateSums } from './loads';
import { HistoryEntry, recommend, resolveTarget } from './progression';
import { bestsFor, detectPRs, setPRs } from './prs';
import { advanceProgram, deloadAdvice, defaultBlocks, heavyDue, programStatus, WEEK_MS } from './periodization';
import { exerciseSeries, muscleSets, weeklyBuckets, weekStreak } from './analytics';
import type { EntryTarget, Exercise, Program, SetLog, Settings, Workout } from './types';

const DAY = 86400000;
const NOW = new Date('2026-10-05T12:00:00').getTime();

const ex = (o: Partial<Exercise> = {}): Exercise => ({
  id: 'bench', name: 'Bench Press', primary: 'chest', secondary: ['triceps', 'shoulders'],
  equipment: 'barbell', pattern: 'horizontal_push', type: 'compound', repMin: 8, repMax: 12, sets: 3,
  method: 'double', incrementKg: 2.5, cues: [], mistakes: [], notes: '', isCustom: false, active: true,
  createdAt: 0, updatedAt: 0, ...o,
});
const T = (o: Partial<EntryTarget> = {}): EntryTarget => ({ sets: 3, repMin: 8, repMax: 12, targetRir: 2, method: 'double', restSec: null, ...o });
let sid = 0;
const set = (w: number, r: number, rir: number | null = null, o: Partial<SetLog> = {}): SetLog => ({
  id: `s${sid++}`, kind: 'working', weightKg: w, reps: r, rir, done: true, completedAt: 0, ...o,
});
const hist = (daysAgo: number, sets: SetLog[], o: Partial<HistoryEntry> = {}): HistoryEntry => ({
  date: NOW - daysAgo * DAY, isDeload: false, target: T(), sets, ...o,
});
const S = (): Settings => defaultSettings('kg');
const reps = (w: number, rs: number[], rir: number | null = null) => rs.map((r) => set(w, r, rir));

// ---------------------------------------------------------------------------
describe('double progression (spec §7, §23)', () => {
  it('3 × 12 at top of 8–12 with sufficient RIR → increase to 82.5', () => {
    const s = S(); s.progression.minRirToProgress = 1;
    const r = recommend(ex(), T(), [hist(3, reps(80, [12, 12, 12], 2))], s);
    expect(r.action).toBe('increase');
    expect(r.weightKg).toBe(82.5);
    expect(r.plan.every((p) => p.reps === 8 && p.weightKg === 82.5)).toBe(true);
  });

  it('10/10/10 → stay at 80 and aim for more reps', () => {
    const r = recommend(ex(), T(), [hist(3, reps(80, [10, 10, 10]))], S());
    expect(r.action).toBe('maintain');
    expect(r.weightKg).toBe(80);
    expect(r.plan.map((p) => p.reps)).toEqual([11, 11, 11]);
  });

  it('12/10/8 → maintain', () => {
    const r = recommend(ex(), T(), [hist(3, reps(80, [12, 10, 8]))], S());
    expect(r.action).toBe('maintain');
    expect(r.weightKg).toBe(80);
  });

  it('7/6/5 once → maintain with regression warning; twice in a row → reduce ~10%', () => {
    const once = recommend(ex(), T(), [hist(3, reps(80, [7, 6, 5]))], S());
    expect(once.action).toBe('maintain');
    expect(once.reasons.join(' ')).toMatch(/below the 8-rep floor/);
    const twice = recommend(ex(), T(), [hist(3, reps(80, [7, 6, 5])), hist(6, reps(80, [7, 7, 6]))], S());
    expect(twice.action).toBe('reduce');
    expect(twice.weightKg).toBe(70); // 80 × 0.9 = 72 → rounded down to 70
  });

  it('failure streak broken by a good session does not reduce', () => {
    const r = recommend(ex(), T(), [hist(3, reps(80, [7, 6, 5])), hist(6, reps(80, [9, 8, 8])), hist(9, reps(80, [7, 6, 6]))], S());
    expect(r.action).toBe('maintain');
  });

  it('missing RIR data never blocks progression', () => {
    const s = S(); s.progression.minRirToProgress = 2;
    const r = recommend(ex(), T(), [hist(3, reps(80, [12, 12, 12], null))], s);
    expect(r.action).toBe('increase');
    expect(r.reasons.join(' ')).toMatch(/RIR not recorded/);
  });

  it('top of range but RIR too low → maintain', () => {
    const s = S(); s.progression.minRirToProgress = 1;
    const r = recommend(ex(), T(), [hist(3, reps(80, [12, 12, 12], 0))], s);
    expect(r.action).toBe('maintain');
    expect(r.reasons.join(' ')).toMatch(/effort was too high/);
  });

  it('incomplete sets → maintain', () => {
    const r = recommend(ex(), T(), [hist(3, reps(80, [12, 12]))], S());
    expect(r.action).toBe('maintain');
    expect(r.reasons[0]).toMatch(/2 of 3 sets/);
  });

  it('warm-up and undone sets are ignored', () => {
    const sets = [set(40, 10, null, { kind: 'warmup' }), ...reps(80, [12, 12, 12]), set(80, 3, null, { done: false })];
    expect(recommend(ex(), T(), [hist(3, sets)], S()).action).toBe('increase');
  });

  it('no history → start with no weight', () => {
    const r = recommend(ex(), T(), [], S());
    expect(r.action).toBe('start');
    expect(r.weightKg).toBeNull();
    expect(r.plan).toHaveLength(3);
  });

  it('uses most recent session, ignoring deloads', () => {
    const r = recommend(ex(), T(), [hist(1, reps(70, [8, 8]), { isDeload: true }), hist(5, reps(80, [12, 12, 12]))], S());
    expect(r.action).toBe('increase');
    expect(r.weightKg).toBe(82.5);
  });

  it('method none → never changes load', () => {
    const r = recommend(ex(), T({ method: 'none' }), [hist(3, reps(80, [12, 12, 12]), { target: T({ method: 'none' }) })], S());
    expect(r.action).toBe('maintain');
    expect(r.weightKg).toBe(80);
  });

  it('mixed weights: grades the heaviest working weight', () => {
    const r = recommend(ex(), T(), [hist(3, [set(80, 12), set(80, 12), set(80, 12), set(70, 12)])], S());
    expect(r.weightKg).toBe(82.5);
  });

  it('is deterministic', () => {
    const h = [hist(3, reps(80, [12, 11, 10]))];
    expect(recommend(ex(), T(), h, S())).toEqual(recommend(ex(), T(), h, S()));
  });
});

describe('linear & top-set/back-off', () => {
  it('linear 5×5 hits all → +2.5', () => {
    const t = T({ sets: 5, repMin: 5, repMax: 5, method: 'linear' });
    const r = recommend(ex({ incrementKg: 2.5 }), t, [hist(3, reps(100, [5, 5, 5, 5, 5]), { target: t })], S());
    expect(r.weightKg).toBe(102.5);
  });

  it('top set progresses alone; back-offs at 85% rounded down to loadable', () => {
    const t = T({ sets: 3, repMin: 4, repMax: 6, method: 'top_backoff' });
    const sets = [set(100, 6, null, { kind: 'top' }), set(85, 6, null, { kind: 'backoff' }), set(85, 5, null, { kind: 'backoff' })];
    const r = recommend(ex(), t, [hist(3, sets, { target: t })], S());
    expect(r.action).toBe('increase');
    expect(r.weightKg).toBe(102.5);
    expect(r.plan[0]).toMatchObject({ kind: 'top', weightKg: 102.5 });
    expect(r.plan[1].kind).toBe('backoff');
    expect(r.plan[1].weightKg).toBe(85); // 102.5 × 0.85 = 87.1 → rounded down to 85
  });
});

describe('weight increments (spec §9)', () => {
  it('barbell loads from plate pairs', () => {
    const loads = achievableLoads('barbell', S().equipment);
    expect(loads).toContain(20);
    expect(loads).toContain(22.5);
    expect(loads).toContain(82.5);
    expect(loads).not.toContain(81);
  });

  it('only 2.5 kg plates → 5 kg jumps on a barbell', () => {
    const s = S(); s.equipment.platesKg = [20, 10, 5, 2.5];
    const r = recommend(ex(), T(), [hist(3, reps(80, [12, 12, 12]))], s);
    expect(r.weightKg).toBe(85);
  });

  it('micro plates (0.5) allow +1 kg', () => {
    const s = S(); s.equipment.platesKg = [20, 10, 5, 2.5, 1.25, 0.5];
    const r = recommend(ex({ incrementKg: 1 }), T(), [hist(3, reps(80, [12, 12, 12]))], s);
    expect(r.weightKg).toBe(81);
  });

  it('dumbbells jump to next available dumbbell and flag big jumps', () => {
    const s = S();
    const r = recommend(ex({ equipment: 'dumbbell', incrementKg: 2 }), T(), [hist(3, reps(10, [12, 12, 12]))], s);
    expect(r.weightKg).toBe(12.5);
    expect(r.reasons.join(' ')).toMatch(/Smallest available jump is 25%/);
  });

  it('unusual dumbbell set (odd gaps)', () => {
    const s = S(); s.equipment.dumbbellsKg = [8, 9, 11, 14, 17];
    expect(recommend(ex({ equipment: 'dumbbell', incrementKg: 2 }), T(), [hist(3, reps(9, [12, 12, 12]))], s).weightKg).toBe(11);
  });

  it('heaviest dumbbell reached → maintain', () => {
    const s = S(); s.equipment.dumbbellsKg = [10, 12];
    const r = recommend(ex({ equipment: 'dumbbell' }), T(), [hist(3, reps(12, [12, 12, 12]))], s);
    expect(r.action).toBe('maintain');
    expect(r.reasons[0]).toMatch(/heaviest load available/);
  });

  it('machine stack steps', () => {
    const s = S(); s.equipment.machineStepKg = 7;
    expect(recommend(ex({ equipment: 'machine', incrementKg: 5 }), T(), [hist(3, reps(49, [12, 12, 12]))], s).weightKg).toBe(56);
  });

  it('respects max jump cap when bigger plates would overshoot', () => {
    expect(nextLoadUp(100, 20, achievableLoads('barbell', S().equipment), 0.1)?.load).toBe(110);
  });

  it('pound plates convert cleanly', () => {
    const s = defaultSettings('lb');
    const loads = achievableLoads('barbell', s.equipment);
    expect(loads.some((l) => fmtLoad(l, 'lb') === '135')).toBe(true);
    expect(loads.some((l) => fmtLoad(l, 'lb') === '140')).toBe(true);
  });

  it('plate breakdown uses fewest plates, including non-greedy cases', () => {
    expect(platesPerSide(100, S().equipment)).toEqual([25, 15]);
    expect(platesPerSide(25, { ...S().equipment, platesKg: [2, 1.25] })).toEqual([1.25, 1.25]);
    expect(platesPerSide(21, S().equipment)).toBeNull();
  });

  it('plateSums handles empty plate list', () => {
    expect(plateSums([], 10)).toEqual([0]);
  });
});

describe('estimated 1RM (Epley)', () => {
  it('formula', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 1);
    expect(e1rm(100, 13)).toBeNull();
    expect(e1rm(0, 5)).toBeNull();
    expect(e1rm(100, 8, 2)).toBeCloseTo(133.33, 1);
  });
  it('inverse round-trips', () => {
    expect(loadForReps(e1rm(80, 10)!, 10)).toBeCloseTo(80, 6);
  });
});

describe('periodization (spec §10–12)', () => {
  const prog = (): Program => ({ id: 'p', name: 'P', active: true, blocks: defaultBlocks(), currentBlockIndex: 0, blockStartedAt: NOW - 2 * WEEK_MS, createdAt: 0, updatedAt: 0 });

  it('status reports week within block and completion', () => {
    const st = programStatus(prog(), NOW)!;
    expect(st.week).toBe(3);
    expect(st.complete).toBe(false);
    expect(programStatus({ ...prog(), blockStartedAt: NOW - 4 * WEEK_MS - DAY }, NOW)!.complete).toBe(true);
  });

  it('advance wraps to a new cycle after deload', () => {
    const p = advanceProgram({ ...prog(), currentBlockIndex: 4 }, NOW);
    expect(p.currentBlockIndex).toBe(0);
    expect(p.blockStartedAt).toBe(NOW);
  });

  it('strength block overrides compound rep range but not isolation', () => {
    const strength = defaultBlocks()[2];
    expect(resolveTarget(ex(), null, strength)).toMatchObject({ repMin: 3, repMax: 6, sets: 4 });
    expect(resolveTarget(ex({ type: 'isolation', repMin: 10, repMax: 15 }), null, strength)).toMatchObject({ repMin: 10, repMax: 15 });
  });

  it('rep-range change re-bases load from e1RM, rounded down, capped at +15%', () => {
    // 80 × 12 → e1RM 112. For 6 reps @ RIR 2: 112 / 1.2667 = 88.4 → 87.5
    const r = recommend(ex(), T({ repMin: 3, repMax: 6, sets: 4 }), [hist(3, reps(80, [12, 12, 12]))], S());
    expect(r.action).toBe('transition');
    expect(r.weightKg).toBe(87.5);
    // Going lighter (strength → hypertrophy): 100 × 5 → e1RM 116.7; 12 reps @2 → 79.5 → 77.5
    const back = recommend(ex(), T(), [hist(3, reps(100, [5, 5, 5, 5]), { target: T({ repMin: 3, repMax: 5, sets: 4 }) })], S());
    expect(back.weightKg).toBe(77.5);
  });

  it('deload halves sets, ~90% load, from the load actually lifted', () => {
    const r = recommend(ex(), T(), [hist(3, reps(80, [12, 12, 12]))], S(), { isDeload: true });
    expect(r.action).toBe('deload');
    expect(r.target.sets).toBe(2);
    expect(r.weightKg).toBe(70);
    expect(r.target.targetRir).toBe(4);
  });

  it('heavy day for compounds: 4 × 4–6 from e1RM; isolation unchanged', () => {
    const r = recommend(ex(), T(), [hist(3, reps(80, [10, 10, 10]))], S(), { isHeavy: true });
    expect(r.action).toBe('heavy');
    expect(r.target).toMatchObject({ sets: 4, repMin: 4, repMax: 6 });
    expect(r.weightKg).toBeLessThanOrEqual(80 * 1.15);
    expect(r.weightKg).toBe(82.5); // e1RM 106.7 → 6 reps @ RIR 2 = 84.2 → 82.5
    const iso = recommend(ex({ type: 'isolation' }), T(), [hist(3, reps(20, [10, 10, 10]))], S(), { isHeavy: true });
    expect(iso.action).toBe('maintain');
  });

  it('heavy sessions do not reset normal progression', () => {
    const heavyT = T({ sets: 4, repMin: 4, repMax: 6, method: 'linear' });
    const r = recommend(ex(), T(), [hist(2, reps(90, [6, 6, 5, 5]), { isHeavy: true, target: heavyT }), hist(5, reps(80, [12, 12, 12]))], S());
    expect(r.action).toBe('increase');
    expect(r.weightKg).toBe(82.5);
  });
});

// ---------------------------------------------------------------------------
const wk = (id: string, daysAgo: number, entries: [string, SetLog[]][], o: Partial<Workout> = {}): Workout => ({
  id, name: id, status: 'completed', startedAt: NOW - daysAgo * DAY, finishedAt: NOW - daysAgo * DAY + 3600e3,
  templateId: null, blockName: null, isDeload: false, isHeavy: false, notes: '', createdAt: 0, updatedAt: 0,
  entries: entries.map(([exerciseId, sets], i) => ({ id: `${id}e${i}`, exerciseId, notes: '', substitutedFrom: null, skipped: false, target: T(), sets })),
  ...o,
});

describe('deload advice', () => {
  it('planned interval', () => {
    const s = S(); s.deloadEveryWeeks = 6;
    const ws = [wk('a', 50, [['bench', reps(80, [10])]]), wk('b', 2, [['bench', reps(80, [10])]])];
    const a = deloadAdvice(ws, s, false, NOW, null);
    expect(a.recommend).toBe(true);
    expect(deloadAdvice(ws, s, true, NOW, null).recommend).toBe(false); // programme handles it
    expect(deloadAdvice(ws, s, false, NOW, NOW - DAY).recommend).toBe(false); // dismissed
  });

  it('performance decline on two exercises', () => {
    const s = S(); s.deloadEveryWeeks = 0;
    const mk = (d: number, w: number) => wk(`w${d}`, d, [['bench', reps(w, [8])], ['squat', reps(w + 20, [8])]]);
    const ws = [mk(1, 70), mk(4, 72.5), mk(7, 75), mk(10, 77.5)];
    expect(deloadAdvice(ws, s, false, NOW, null).recommend).toBe(true);
    const one = [mk(1, 70), mk(4, 72.5), mk(7, 75), mk(10, 70)];
    expect(deloadAdvice(one, s, false, NOW, null).recommend).toBe(false);
  });

  it('six consecutive sessions to failure', () => {
    const s = S(); s.deloadEveryWeeks = 0;
    const ws = Array.from({ length: 6 }, (_, i) => wk(`f${i}`, i + 1, [['bench', reps(80, [8, 8], 0)]]));
    expect(deloadAdvice(ws, s, false, NOW, null).recommend).toBe(true);
    expect(deloadAdvice(ws.slice(0, 5), s, false, NOW, null).recommend).toBe(false);
  });

  it('heavy day due', () => {
    const s = S(); s.heavyEveryWeeks = 3;
    const ws = [wk('a', 30, [['bench', reps(80, [10])]])];
    expect(heavyDue(ws, s, 'hypertrophy', NOW)).toBe(true);
    expect(heavyDue(ws, s, 'strength', NOW)).toBe(false);
    expect(heavyDue([...ws, wk('h', 5, [['bench', reps(90, [5])]], { isHeavy: true })], s, null, NOW)).toBe(false);
  });
});

describe('personal records (spec §18)', () => {
  const prior = [wk('p1', 7, [['bench', reps(80, [10, 9, 8])]])];

  it('first session is a baseline, not a PR', () => {
    expect(detectPRs(wk('x', 0, [['bench', reps(80, [10])]]), [])).toEqual([]);
  });

  it('heavier weight → max weight PR', () => {
    const prs = detectPRs(wk('x', 0, [['bench', reps(82.5, [8])]]), prior);
    expect(prs.map((p) => p.type)).toContain('max_weight');
  });

  it('more reps at same load → rep PR + e1RM PR', () => {
    const prs = detectPRs(wk('x', 0, [['bench', reps(80, [11, 9, 8])]]), prior);
    expect(prs.map((p) => p.type).sort()).toEqual(['e1rm', 'reps_at_weight', 'volume']);
  });

  it('lighter weight with fewer reps than a heavier set → no rep PR', () => {
    expect(setPRs({ weightKg: 75, reps: 9 }, bestsFor('bench', prior))).toEqual([]);
  });

  it('volume PR only', () => {
    const prs = detectPRs(wk('x', 0, [['bench', reps(80, [9, 9, 9, 9])]]), prior);
    expect(prs.map((p) => p.type)).toEqual(['volume']);
  });

  it('bodyweight sets (0 added load) get rep PRs only', () => {
    const b = bestsFor('pull', [wk('p', 7, [['pull', reps(0, [8, 7])]])]);
    expect(setPRs({ weightKg: 0, reps: 9 }, b)).toEqual([{ type: 'reps_at_weight', value: 9 }]);
    expect(setPRs({ weightKg: 0, reps: 8 }, b)).toEqual([]);
  });

  it('ignores deleted and later workouts', () => {
    const later = wk('later', -1, [['bench', reps(100, [10])]]);
    const del = wk('del', 3, [['bench', reps(100, [10])]], { deleted: true });
    expect(detectPRs(wk('x', 0, [['bench', reps(82.5, [8])]]), [...prior, later, del]).map((p) => p.type)).toContain('max_weight');
  });
});

describe('analytics', () => {
  const ws = [
    wk('a', 1, [['bench', reps(80, [10, 10])]]),
    wk('b', 8, [['bench', reps(77.5, [10, 10])]]),
    wk('c', 9, [['bench', reps(77.5, [9])]], { status: 'active' }),
  ];
  it('exercise series ignores active workouts and sorts by date', () => {
    const s = exerciseSeries('bench', ws);
    expect(s.map((p) => p.topWeight)).toEqual([77.5, 80]);
    expect(s[1].volume).toBe(1600);
  });
  it('weekly buckets and streak', () => {
    const b = weeklyBuckets(ws, 4, NOW);
    expect(b.reduce((a, x) => a + x.workouts, 0)).toBe(2);
    expect(weekStreak(ws, NOW)).toBeGreaterThanOrEqual(1);
  });
  it('muscle sets: primary 1, secondary 0.5', () => {
    const m = muscleSets(ws, new Map([['bench', ex()]]), 0);
    expect(m.find((x) => x.muscle === 'chest')?.sets).toBe(4);
    expect(m.find((x) => x.muscle === 'triceps')?.sets).toBe(2);
  });
});
