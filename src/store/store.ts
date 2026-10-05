/**
 * Application state. Every mutation updates memory first, then persists the affected
 * record, so an app kill mid-workout loses at most the change in flight.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { defaultBlocks, advanceProgram, programStatus } from '../domain/periodization';
import { defaultSettings, defaultEquipment } from '../domain/defaults';
import { HistoryEntry, recommend, resolveTarget } from '../domain/progression';
import { detectPRs } from '../domain/prs';
import type {
  Block, Exercise, Experience, ID, PersonalRecord, Profile, Program, SetLog, Settings, TemplateItem,
  Unit, Workout, WorkoutEntry, WorkoutTemplate,
} from '../domain/types';
import type { Repo } from '../data/db';
import { seedExercises } from '../data/seedExercises';
import { itemFor, seedTemplates } from '../data/seedTemplates';
import { uid } from '../data/uid';
import { detectLang, seedName, setLang, t, type Lang } from '../i18n';

export interface Timer { endsAt: number; total: number }

export interface AppState {
  ready: boolean;
  persistent: boolean;
  profile: Profile;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  workouts: Workout[];
  program: Program | null;
  timer: Timer | null;
  deloadDismissedAt: number | null;
  /** Derived; rebuilt whenever workouts change. */
  prs: PersonalRecord[];
}

export interface StartOptions {
  templateId?: ID | null;
  repeatWorkoutId?: ID | null;
  name?: string;
  deload?: boolean;
  heavy?: boolean;
}

export interface Actions {
  init(): Promise<void>;
  completeOnboarding(o: { name: string; unit: Unit; experience: Experience; usePrograms: boolean }): Promise<void>;
  updateProfile(p: Partial<Pick<Profile, 'name' | 'experience'>>): Promise<void>;
  setUnit(u: Unit, resetEquipment: boolean): Promise<void>;
  setLanguage(l: Lang): Promise<void>;
  updateSettings(fn: (s: Settings) => Settings): Promise<void>;

  startWorkout(o: StartOptions): Promise<ID>;
  updateSet(workoutId: ID, entryId: ID, setId: ID, patch: Partial<SetLog>): Promise<void>;
  toggleSet(workoutId: ID, entryId: ID, setId: ID): Promise<boolean>;
  addSet(workoutId: ID, entryId: ID): Promise<void>;
  removeSet(workoutId: ID, entryId: ID, setId: ID): Promise<void>;
  addExercise(workoutId: ID, exerciseId: ID): Promise<void>;
  substituteExercise(workoutId: ID, entryId: ID, exerciseId: ID): Promise<void>;
  removeEntry(workoutId: ID, entryId: ID): Promise<void>;
  moveEntry(workoutId: ID, entryId: ID, dir: -1 | 1): Promise<void>;
  setEntrySkipped(workoutId: ID, entryId: ID, skipped: boolean): Promise<void>;
  setEntryNotes(workoutId: ID, entryId: ID, notes: string): Promise<void>;
  updateWorkout(workoutId: ID, patch: Partial<Pick<Workout, 'name' | 'notes' | 'startedAt' | 'finishedAt'>>): Promise<void>;
  finishWorkout(workoutId: ID): Promise<PersonalRecord[]>;
  discardWorkout(workoutId: ID): Promise<void>;
  deleteWorkout(workoutId: ID): Promise<void>;

  saveTemplate(t: WorkoutTemplate): Promise<void>;
  newTemplate(name: string): WorkoutTemplate;
  deleteTemplate(id: ID): Promise<void>;
  saveExercise(e: Exercise): Promise<void>;
  newExercise(name: string): Exercise;

  createProgram(): Promise<void>;
  saveProgram(p: Program): Promise<void>;
  setProgramActive(active: boolean): Promise<void>;
  advanceBlock(toIndex?: number): Promise<void>;

  startTimer(sec: number): void;
  adjustTimer(deltaSec: number): void;
  stopTimer(): void;
  dismissDeload(): Promise<void>;

  exportData(): string;
  importData(json: string): Promise<void>;
  resetAll(): Promise<void>;
}

export type AppStore = StoreApi<AppState & Actions>;

const BACKUP_VERSION = 1;

function blankProfile(now: number): Profile {
  return { id: 'profile', name: '', experience: 'intermediate', unit: 'kg', onboarded: false, settings: defaultSettings('kg'), createdAt: now, updatedAt: now };
}

/** Completed, non-deleted workouts → history per exercise for the progression engine. */
export function historyFor(workouts: Workout[], exerciseId: ID, excludeId?: ID): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const w of workouts) {
    if (w.status !== 'completed' || w.deleted || w.id === excludeId) continue;
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId || e.skipped) continue;
      out.push({ date: w.startedAt, isDeload: w.isDeload, isHeavy: w.isHeavy, target: e.target, sets: e.sets });
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

export function rebuildPRs(workouts: Workout[]): PersonalRecord[] {
  const done = workouts.filter((w) => w.status === 'completed' && !w.deleted).sort((a, b) => a.startedAt - b.startedAt);
  const out: PersonalRecord[] = [];
  done.forEach((w, i) => out.push(...detectPRs(w, done.slice(0, i))));
  return out;
}

export function activeBlock(program: Program | null, now: number): Block | null {
  return program ? programStatus(program, now)?.block ?? null : null;
}

export function createAppStore(repo: Repo, clock: () => number = Date.now): AppStore {
  return createStore<AppState & Actions>()((set, get) => {
    const persistWorkout = (w: Workout) => repo.put('workouts', w);
    const persistMeta = async () => {
      const { timer, deloadDismissedAt } = get();
      await repo.put('meta', { id: 'ui', timer, deloadDismissedAt });
    };

    /** Immutable update of one workout + persist. */
    const mutate = async (workoutId: ID, fn: (w: Workout) => Workout) => {
      const w = get().workouts.find((x) => x.id === workoutId);
      if (!w) return;
      const next = { ...fn(w), updatedAt: clock() };
      const workouts = get().workouts.map((x) => (x.id === workoutId ? next : x));
      set({ workouts, ...(next.status === 'completed' ? { prs: rebuildPRs(workouts) } : {}) });
      await persistWorkout(next);
    };
    const mutateEntry = (workoutId: ID, entryId: ID, fn: (e: WorkoutEntry) => WorkoutEntry) =>
      mutate(workoutId, (w) => ({ ...w, entries: w.entries.map((e) => (e.id === entryId ? fn(e) : e)) }));

    const buildEntry = (ex: Exercise, item: TemplateItem | null, o: StartOptions, excludeId?: ID): WorkoutEntry => {
      const { workouts, profile, program } = get();
      const now = clock();
      const block = activeBlock(program, now);
      const target = resolveTarget(ex, item, block);
      const isDeload = !!o.deload || block?.type === 'deload';
      const rec = recommend(ex, target, historyFor(workouts, ex.id, excludeId), profile.settings, {
        isDeload, isHeavy: !!o.heavy,
        deloadLoadFactor: block?.type === 'deload' ? block.loadFactor : undefined,
        deloadSetFactor: block?.type === 'deload' ? block.setFactor : undefined,
      });
      const fallbackW = rec.previous.find((s) => s.kind !== 'warmup')?.weightKg ?? 0;
      return {
        id: uid('ent'), exerciseId: ex.id, notes: '', substitutedFrom: null, skipped: false,
        target: rec.target,
        rec: { action: rec.action, weightKg: rec.weightKg, reasons: rec.reasons },
        sets: rec.plan.map((p) => ({
          id: uid('set'), kind: p.kind, weightKg: p.weightKg ?? fallbackW, reps: p.reps, rir: null, done: false, completedAt: null,
        })),
      };
    };

    const exById = (id: ID) => get().exercises.find((e) => e.id === id);

    return {
      ready: false,
      persistent: repo.persistent,
      profile: blankProfile(clock()),
      exercises: [],
      templates: [],
      workouts: [],
      program: null,
      timer: null,
      deloadDismissedAt: null,
      prs: [],

      async init() {
        const now = clock();
        const [metaRows, exercises, templates, workouts] = await Promise.all([
          repo.getAll<{ id: string; [k: string]: unknown }>('meta'),
          repo.getAll<Exercise>('exercises'),
          repo.getAll<WorkoutTemplate>('templates'),
          repo.getAll<Workout>('workouts'),
        ]);
        const meta = new Map(metaRows.map((r) => [r.id, r]));
        const profile = (meta.get('profile') as unknown as Profile | undefined) ?? blankProfile(now);
        profile.language = profile.language ?? detectLang();
        setLang(profile.language);
        // Forward-compatible settings: fill any keys added in newer versions.
        const d = defaultSettings(profile.unit);
        profile.settings = {
          ...d, ...profile.settings,
          progression: { ...d.progression, ...profile.settings?.progression },
          equipment: { ...d.equipment, ...profile.settings?.equipment },
        };
        // Add any built-in exercises missing from storage (new app versions).
        const have = new Set(exercises.map((e) => e.id));
        const missing = seedExercises(now).filter((e) => !have.has(e.id));
        if (missing.length) await repo.putMany('exercises', missing);
        const ui = meta.get('ui') as { timer?: Timer | null; deloadDismissedAt?: number | null } | undefined;
        const program = (meta.get('program') as unknown as Program | undefined) ?? null;
        const ws = workouts;
        set({
          ready: true, profile, program,
          exercises: [...exercises, ...missing].sort((a, b) => a.name.localeCompare(b.name)),
          templates: templates.filter((t) => !t.deleted).sort((a, b) => a.createdAt - b.createdAt),
          workouts: ws,
          prs: rebuildPRs(ws),
          timer: ui?.timer && ui.timer.endsAt > now ? ui.timer : null,
          deloadDismissedAt: ui?.deloadDismissedAt ?? null,
        });
      },

      async completeOnboarding({ name, unit, experience, usePrograms }) {
        const now = clock();
        const profile: Profile = {
          ...get().profile, name: name.trim(), unit, experience, onboarded: true,
          settings: { ...defaultSettings(unit), heavyEveryWeeks: usePrograms ? 0 : experience === 'beginner' ? 0 : 4 },
          updatedAt: now,
        };
        set({ profile });
        await repo.put('meta', profile);
        if (get().templates.length === 0) {
          const templates = seedTemplates(get().exercises, now);
          set({ templates });
          await repo.putMany('templates', templates);
        }
        if (usePrograms) await get().createProgram();
      },

      async updateProfile(p) {
        const profile = { ...get().profile, ...p, updatedAt: clock() };
        set({ profile });
        await repo.put('meta', profile);
      },

      async setLanguage(language) {
        setLang(language);
        const now = clock();
        const profile = { ...get().profile, language, updatedAt: now };
        // Rename the names the app created for you (Push → Empurrar, ...) so the UI stays in one language.
        const renamed = <T extends { name: string }>(items: T[]) => {
          const changed: T[] = [];
          const out = items.map((x) => {
            const name = seedName(x.name, language);
            if (name === x.name) return x;
            const y = { ...x, name, updatedAt: now };
            changed.push(y);
            return y;
          });
          return { out, changed };
        };
        const tpl = renamed(get().templates);
        const wk = renamed(get().workouts);
        let program = get().program;
        if (program) {
          const blocks = program.blocks.map((b) => ({ ...b, name: seedName(b.name, language) }));
          program = { ...program, name: seedName(program.name, language), blocks };
        }
        set({ profile, templates: tpl.out, workouts: wk.out, program });
        await repo.put('meta', profile);
        if (program) await repo.put('meta', program);
        if (tpl.changed.length) await repo.putMany('templates', tpl.changed);
        if (wk.changed.length) await repo.putMany('workouts', wk.changed);
      },

      async setUnit(unit, resetEquipment) {
        const cur = get().profile;
        const settings = resetEquipment ? { ...cur.settings, equipment: defaultEquipment(unit) } : cur.settings;
        const profile = { ...cur, unit, settings, updatedAt: clock() };
        set({ profile });
        await repo.put('meta', profile);
      },

      async updateSettings(fn) {
        const cur = get().profile;
        const profile = { ...cur, settings: fn(cur.settings), updatedAt: clock() };
        set({ profile });
        await repo.put('meta', profile);
      },

      async startWorkout(o) {
        const existing = get().workouts.find((w) => w.status === 'active' && !w.deleted);
        if (existing) return existing.id;
        const now = clock();
        const block = activeBlock(get().program, now);
        let name = o.name ?? t('Workout');
        let items: (TemplateItem | { exerciseId: ID; item: null })[] = [];
        if (o.templateId) {
          const t = get().templates.find((x) => x.id === o.templateId);
          if (t) { name = t.name; items = t.items; }
        } else if (o.repeatWorkoutId) {
          const w = get().workouts.find((x) => x.id === o.repeatWorkoutId);
          if (w) {
            name = w.name;
            items = w.entries.filter((e) => !e.skipped).map((e) => ({ ...e.target, exerciseId: e.exerciseId }) as TemplateItem);
          }
        }
        const entries = items
          .map((it) => {
            const ex = exById(it.exerciseId);
            return ex ? buildEntry(ex, 'sets' in it ? it : null, o) : null;
          })
          .filter((e): e is WorkoutEntry => !!e);
        const w: Workout = {
          id: uid('wo'), name, status: 'active', startedAt: now, finishedAt: null,
          templateId: o.templateId ?? null, blockName: block?.name ?? null,
          isDeload: !!o.deload || block?.type === 'deload', isHeavy: !!o.heavy,
          notes: '', entries, createdAt: now, updatedAt: now,
        };
        set({ workouts: [...get().workouts, w] });
        await persistWorkout(w);
        return w.id;
      },

      async updateSet(workoutId, entryId, setId, patch) {
        await mutateEntry(workoutId, entryId, (e) => {
          const idx = e.sets.findIndex((s) => s.id === setId);
          if (idx < 0) return e;
          const old = e.sets[idx];
          const sets = e.sets.map((s, i) => {
            if (i === idx) return { ...s, ...patch };
            // Carry a changed weight forward to later, untouched sets of the same kind.
            if (i > idx && !s.done && s.kind === old.kind && patch.weightKg != null && Math.abs(s.weightKg - old.weightKg) < 1e-6) {
              return { ...s, weightKg: patch.weightKg };
            }
            return s;
          });
          return { ...e, sets };
        });
      },

      async toggleSet(workoutId, entryId, setId) {
        let nowDone = false;
        await mutateEntry(workoutId, entryId, (e) => ({
          ...e,
          sets: e.sets.map((s) => {
            if (s.id !== setId) return s;
            nowDone = !s.done;
            return { ...s, done: nowDone, completedAt: nowDone ? clock() : null };
          }),
        }));
        return nowDone;
      },

      async addSet(workoutId, entryId) {
        await mutateEntry(workoutId, entryId, (e) => {
          const last = e.sets[e.sets.length - 1];
          const s: SetLog = {
            id: uid('set'), kind: last?.kind === 'top' ? 'backoff' : last?.kind ?? 'working',
            weightKg: last?.weightKg ?? 0, reps: last?.reps ?? e.target.repMin, rir: null, done: false, completedAt: null,
          };
          return { ...e, sets: [...e.sets, s] };
        });
      },

      async removeSet(workoutId, entryId, setId) {
        await mutateEntry(workoutId, entryId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
      },

      async addExercise(workoutId, exerciseId) {
        const ex = exById(exerciseId);
        if (!ex) return;
        const w = get().workouts.find((x) => x.id === workoutId);
        const entry = buildEntry(ex, null, { deload: w?.isDeload, heavy: w?.isHeavy }, workoutId);
        await mutate(workoutId, (w) => ({ ...w, entries: [...w.entries, entry] }));
      },

      async substituteExercise(workoutId, entryId, exerciseId) {
        const ex = exById(exerciseId);
        const w = get().workouts.find((x) => x.id === workoutId);
        const old = w?.entries.find((e) => e.id === entryId);
        if (!ex || !w || !old) return;
        // Keep the slot's prescription (sets/rep range) but use the new exercise's own history.
        const item: TemplateItem = { exerciseId, sets: old.target.sets, repMin: old.target.repMin, repMax: old.target.repMax, targetRir: old.target.targetRir, restSec: old.target.restSec, method: old.target.method };
        const entry = { ...buildEntry(ex, ex.type === 'compound' ? item : itemFor(ex), { deload: w.isDeload, heavy: w.isHeavy }, workoutId), id: old.id, substitutedFrom: old.substitutedFrom ?? old.exerciseId };
        await mutate(workoutId, (w) => ({ ...w, entries: w.entries.map((e) => (e.id === entryId ? entry : e)) }));
      },

      async removeEntry(workoutId, entryId) {
        await mutate(workoutId, (w) => ({ ...w, entries: w.entries.filter((e) => e.id !== entryId) }));
      },

      async moveEntry(workoutId, entryId, dir) {
        await mutate(workoutId, (w) => {
          const i = w.entries.findIndex((e) => e.id === entryId);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= w.entries.length) return w;
          const entries = [...w.entries];
          [entries[i], entries[j]] = [entries[j], entries[i]];
          return { ...w, entries };
        });
      },

      async setEntrySkipped(workoutId, entryId, skipped) {
        await mutateEntry(workoutId, entryId, (e) => ({ ...e, skipped }));
      },

      async setEntryNotes(workoutId, entryId, notes) {
        await mutateEntry(workoutId, entryId, (e) => ({ ...e, notes }));
      },

      async updateWorkout(workoutId, patch) {
        await mutate(workoutId, (w) => ({ ...w, ...patch }));
      },

      async finishWorkout(workoutId) {
        const now = clock();
        await mutate(workoutId, (w) => ({ ...w, status: 'completed', finishedAt: now }));
        get().stopTimer();
        return get().prs.filter((p) => p.workoutId === workoutId);
      },

      async discardWorkout(workoutId) {
        set({ workouts: get().workouts.filter((w) => w.id !== workoutId) });
        await repo.remove('workouts', workoutId);
        get().stopTimer();
      },

      async deleteWorkout(workoutId) {
        await mutate(workoutId, (w) => ({ ...w, deleted: true }));
        set({ prs: rebuildPRs(get().workouts) });
      },

      newTemplate(name) {
        const now = clock();
        return { id: uid('tpl'), name, items: [], createdAt: now, updatedAt: now };
      },

      async saveTemplate(t) {
        const next = { ...t, updatedAt: clock() };
        const exists = get().templates.some((x) => x.id === t.id);
        set({ templates: exists ? get().templates.map((x) => (x.id === t.id ? next : x)) : [...get().templates, next] });
        await repo.put('templates', next);
      },

      async deleteTemplate(id) {
        const t = get().templates.find((x) => x.id === id);
        if (!t) return;
        set({ templates: get().templates.filter((x) => x.id !== id) });
        await repo.put('templates', { ...t, deleted: true, updatedAt: clock() });
      },

      newExercise(name) {
        const now = clock();
        return {
          id: uid('ex'), name, primary: 'chest', secondary: [], equipment: 'dumbbell', pattern: 'isolation', type: 'isolation',
          repMin: 8, repMax: 12, sets: 3, method: 'double', incrementKg: 2.5, cues: [], mistakes: [], notes: '',
          isCustom: true, active: true, createdAt: now, updatedAt: now,
        };
      },

      async saveExercise(e) {
        const next = { ...e, updatedAt: clock() };
        const exists = get().exercises.some((x) => x.id === e.id);
        const exercises = (exists ? get().exercises.map((x) => (x.id === e.id ? next : x)) : [...get().exercises, next])
          .sort((a, b) => a.name.localeCompare(b.name));
        set({ exercises });
        await repo.put('exercises', next);
      },

      async createProgram() {
        const now = clock();
        const program: Program = { id: 'program', name: t('Hypertrophy → Strength'), active: true, blocks: defaultBlocks(), currentBlockIndex: 0, blockStartedAt: now, createdAt: now, updatedAt: now };
        set({ program });
        await repo.put('meta', program);
      },

      async saveProgram(p) {
        const program = { ...p, updatedAt: clock() };
        set({ program });
        await repo.put('meta', program);
      },

      async setProgramActive(active) {
        const p = get().program;
        if (!p) { if (active) await get().createProgram(); return; }
        await get().saveProgram({ ...p, active, blockStartedAt: active && !p.active ? clock() : p.blockStartedAt });
      },

      async advanceBlock(toIndex) {
        const p = get().program;
        if (!p) return;
        await get().saveProgram(advanceProgram(p, clock(), toIndex));
      },

      startTimer(sec) {
        set({ timer: { endsAt: clock() + sec * 1000, total: sec } });
        void persistMeta();
      },
      adjustTimer(delta) {
        const t = get().timer;
        if (!t) return;
        const endsAt = Math.max(clock() + 1000, t.endsAt + delta * 1000);
        set({ timer: { endsAt, total: Math.max(t.total + delta, 1) } });
        void persistMeta();
      },
      stopTimer() {
        if (!get().timer) return;
        set({ timer: null });
        void persistMeta();
      },
      async dismissDeload() {
        set({ deloadDismissedAt: clock() });
        await persistMeta();
      },

      exportData() {
        const { profile, exercises, templates, workouts, program } = get();
        return JSON.stringify({ app: 'ironlog', version: BACKUP_VERSION, exportedAt: clock(), profile, exercises, templates, workouts, program }, null, 1);
      },

      async importData(json) {
        let d: { app?: string; version?: number; profile?: Profile; exercises?: Exercise[]; templates?: WorkoutTemplate[]; workouts?: Workout[]; program?: Program | null };
        try { d = JSON.parse(json); } catch { throw new Error(t('That file is not valid JSON.')); }
        if (d.app !== 'ironlog' || !Array.isArray(d.workouts) || !Array.isArray(d.exercises) || !d.profile) {
          throw new Error(t('That file is not an IronLog backup.'));
        }
        if ((d.version ?? 0) > BACKUP_VERSION) throw new Error(t('Backup is from a newer app version.'));
        await repo.clearAll();
        await repo.put('meta', d.profile);
        if (d.program) await repo.put('meta', d.program);
        await repo.putMany('exercises', d.exercises);
        await repo.putMany('templates', d.templates ?? []);
        await repo.putMany('workouts', d.workouts);
        await get().init();
      },

      async resetAll() {
        await repo.clearAll();
        set({ ready: false, profile: blankProfile(clock()), exercises: [], templates: [], workouts: [], program: null, timer: null, prs: [] });
        await get().init();
      },
    };
  });
}
