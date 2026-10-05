import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openRepo } from '../data/db';
import { createAppStore, type AppStore } from './store';

const DAY = 86400000;
let now = new Date('2026-09-01T10:00:00').getTime();
const clock = () => now;
let factory: IDBFactory;

async function boot(): Promise<AppStore> {
  const s = createAppStore(await openRepo(factory), clock);
  await s.getState().init();
  return s;
}

/** Log every planned set of a workout with given reps and finish it. */
async function doWorkout(s: AppStore, templateName: string, weight: number, reps: number) {
  const st = s.getState();
  const tpl = st.templates.find((t) => t.name === templateName)!;
  const id = await st.startWorkout({ templateId: tpl.id });
  const w = s.getState().workouts.find((x) => x.id === id)!;
  for (const e of w.entries) for (const set of e.sets) {
    await s.getState().updateSet(id, e.id, set.id, { weightKg: weight, reps });
    await s.getState().toggleSet(id, e.id, set.id);
  }
  const prs = await s.getState().finishWorkout(id);
  now += 2 * DAY;
  return { id, prs };
}

beforeEach(() => {
  factory = new IDBFactory();
  now = new Date('2026-09-01T10:00:00').getTime();
});

describe('store + persistence', () => {
  it('seeds exercises on first run and templates on onboarding', async () => {
    const s = await boot();
    expect(s.getState().exercises.length).toBeGreaterThan(35);
    expect(s.getState().templates).toHaveLength(0);
    await s.getState().completeOnboarding({ name: 'Bruno', unit: 'kg', experience: 'intermediate', usePrograms: false });
    expect(s.getState().templates.map((t) => t.name)).toEqual(['Push', 'Pull', 'Legs']);
    const again = await boot();
    expect(again.getState().profile.onboarded).toBe(true);
    expect(again.getState().templates).toHaveLength(3);
  });

  it('restores an active workout and rest timer after app restart', async () => {
    const s = await boot();
    await s.getState().completeOnboarding({ name: '', unit: 'kg', experience: 'intermediate', usePrograms: false });
    const id = await s.getState().startWorkout({ templateId: s.getState().templates[0].id });
    const e = s.getState().workouts[0].entries[0];
    await s.getState().updateSet(id, e.id, e.sets[0].id, { weightKg: 60, reps: 10, rir: 2 });
    await s.getState().toggleSet(id, e.id, e.sets[0].id);
    s.getState().startTimer(90);
    await new Promise((r) => setTimeout(r, 10));

    const s2 = await boot(); // simulated kill + relaunch
    const w = s2.getState().workouts.find((x) => x.id === id)!;
    expect(w.status).toBe('active');
    expect(w.entries[0].sets[0]).toMatchObject({ weightKg: 60, reps: 10, rir: 2, done: true });
    expect(s2.getState().timer?.total).toBe(90);
    // Starting again resumes instead of creating a second active workout.
    expect(await s2.getState().startWorkout({})).toBe(id);
  });

  it('changing weight on set 1 carries forward to untouched later sets', async () => {
    const s = await boot();
    await s.getState().completeOnboarding({ name: '', unit: 'kg', experience: 'intermediate', usePrograms: false });
    const id = await s.getState().startWorkout({ templateId: s.getState().templates[0].id });
    const e = s.getState().workouts[0].entries[0];
    await s.getState().updateSet(id, e.id, e.sets[1].id, { weightKg: 50 }); // touched
    await s.getState().updateSet(id, e.id, e.sets[0].id, { weightKg: 60 });
    const sets = s.getState().workouts[0].entries[0].sets;
    expect(sets.map((x) => x.weightKg)).toEqual([60, 50, 50]); // set 3 followed set 2 (both started at 0)
  });

  it('progression flows across sessions: hit 12s → next session prefilled heavier', async () => {
    const s = await boot();
    await s.getState().completeOnboarding({ name: '', unit: 'kg', experience: 'intermediate', usePrograms: false });
    await doWorkout(s, 'Push', 80, 10); // bench range 6–10 → top of range
    const id = await s.getState().startWorkout({ templateId: s.getState().templates[0].id });
    const bench = s.getState().workouts.find((w) => w.id === id)!.entries[0];
    expect(bench.rec?.action).toBe('increase');
    expect(bench.sets[0].weightKg).toBe(82.5);
    expect(bench.sets[0].reps).toBe(6);
  });

  it('detects PRs on finish, and deleting the workout removes them', async () => {
    const s = await boot();
    await s.getState().completeOnboarding({ name: '', unit: 'kg', experience: 'intermediate', usePrograms: false });
    const first = await doWorkout(s, 'Push', 80, 8);
    expect(first.prs).toEqual([]); // baseline
    const second = await doWorkout(s, 'Push', 85, 8);
    expect(second.prs.some((p) => p.type === 'max_weight')).toBe(true);
    await s.getState().deleteWorkout(second.id);
    expect(s.getState().prs.filter((p) => p.workoutId === second.id)).toEqual([]);
    const s2 = await boot();
    expect(s2.getState().workouts.find((w) => w.id === second.id)?.deleted).toBe(true);
  });

  it('editing a historical workout updates PRs and future recommendations', async () => {
    const s = await boot();
    await s.getState().completeOnboarding({ name: '', unit: 'kg', experience: 'intermediate', usePrograms: false });
    const a = await doWorkout(s, 'Push', 80, 8);
    const w = s.getState().workouts.find((x) => x.id === a.id)!;
    const e = w.entries[0];
    for (const set of e.sets) await s.getState().updateSet(a.id, e.id, set.id, { reps: 10 });
    const id = await s.getState().startWorkout({ templateId: s.getState().templates[0].id });
    expect(s.getState().workouts.find((x) => x.id === id)!.entries[0].sets[0].weightKg).toBe(82.5);
  });

  it('substitution keeps the slot and uses the new exercise history', async () => {
    const s = await boot();
    await s.getState().completeOnboarding({ name: '', unit: 'kg', experience: 'intermediate', usePrograms: false });
    const id = await s.getState().startWorkout({ templateId: s.getState().templates[0].id });
    const e = s.getState().workouts[0].entries[0];
    await s.getState().substituteExercise(id, e.id, 'db_bench');
    const ne = s.getState().workouts[0].entries[0];
    expect(ne.id).toBe(e.id);
    expect(ne.exerciseId).toBe('db_bench');
    expect(ne.substitutedFrom).toBe('bench_press');
    expect(ne.rec?.action).toBe('start');
  });

  it('programme: strength block changes compound targets; deload block halves sets', async () => {
    const s = await boot();
    await s.getState().completeOnboarding({ name: '', unit: 'kg', experience: 'intermediate', usePrograms: true });
    await s.getState().advanceBlock(2); // Strength I
    const id = await s.getState().startWorkout({ templateId: s.getState().templates[0].id });
    const w = s.getState().workouts.find((x) => x.id === id)!;
    expect(w.blockName).toBe('Strength I');
    expect(w.entries[0].target).toMatchObject({ repMin: 3, repMax: 6, sets: 4 }); // bench
    expect(w.entries[2].target).toMatchObject({ repMin: 12, repMax: 20 }); // lateral raise untouched
    await s.getState().discardWorkout(id);
    await s.getState().advanceBlock(4); // Deload
    const d = await s.getState().startWorkout({ templateId: s.getState().templates[0].id });
    const dw = s.getState().workouts.find((x) => x.id === d)!;
    expect(dw.isDeload).toBe(true);
    expect(dw.entries[0].sets).toHaveLength(2);
  });

  it('export → reset → import round-trips all data', async () => {
    const s = await boot();
    await s.getState().completeOnboarding({ name: 'B', unit: 'kg', experience: 'advanced', usePrograms: true });
    await doWorkout(s, 'Legs', 100, 8);
    const json = s.getState().exportData();
    await s.getState().resetAll();
    expect(s.getState().workouts).toHaveLength(0);
    expect(s.getState().profile.onboarded).toBe(false);
    await s.getState().importData(json);
    expect(s.getState().workouts).toHaveLength(1);
    expect(s.getState().profile).toMatchObject({ name: 'B', experience: 'advanced', onboarded: true });
    expect(s.getState().program?.active).toBe(true);
    await expect(s.getState().importData('{"nope":1}')).rejects.toThrow(/not an IronLog backup/);
    await expect(s.getState().importData('garbage')).rejects.toThrow(/not valid JSON/);
    expect(s.getState().workouts).toHaveLength(1); // failed import leaves data intact
  });

  it('discarding an active workout removes it completely', async () => {
    const s = await boot();
    await s.getState().completeOnboarding({ name: '', unit: 'kg', experience: 'intermediate', usePrograms: false });
    const id = await s.getState().startWorkout({});
    await s.getState().discardWorkout(id);
    expect((await boot()).getState().workouts).toHaveLength(0);
  });
});
