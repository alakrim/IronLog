// Core domain types. Weights are always kilograms internally.

export type ID = string;
export type Unit = 'kg' | 'lb';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

export type Muscle =
  | 'chest' | 'back' | 'lats' | 'traps' | 'shoulders' | 'rear_delts' | 'biceps' | 'triceps'
  | 'forearms' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs' | 'lower_back' | 'adductors';

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';
export type MovementPattern =
  | 'horizontal_push' | 'vertical_push' | 'horizontal_pull' | 'vertical_pull'
  | 'squat' | 'hinge' | 'lunge' | 'isolation' | 'core' | 'carry';

export type ProgressionMethod = 'double' | 'linear' | 'top_backoff' | 'none';
export type SetKind = 'warmup' | 'working' | 'top' | 'backoff';
export type BlockType = 'hypertrophy' | 'strength' | 'mixed' | 'deload';

export interface Timestamps { createdAt: number; updatedAt: number }

export interface Exercise extends Timestamps {
  id: ID;
  name: string;
  primary: Muscle;
  secondary: Muscle[];
  equipment: Equipment;
  pattern: MovementPattern;
  type: 'compound' | 'isolation';
  repMin: number;
  repMax: number;
  sets: number;
  method: ProgressionMethod;
  /** Preferred jump in kg. Actual jump is snapped to achievable loads. */
  incrementKg: number;
  cues: string[];
  mistakes: string[];
  notes: string;
  mediaUrl?: string;
  isCustom: boolean;
  active: boolean;
}

export interface EquipmentProfile {
  barKg: number;
  /** Plates available, per side. */
  platesKg: number[];
  /** Individual dumbbell weights available (per hand). */
  dumbbellsKg: number[];
  machineStepKg: number;
  cableStepKg: number;
  /** Never recommend a jump larger than this fraction of current load (e.g. 0.1 = 10 %). */
  maxJumpPct: number;
}

export interface ProgressionSettings {
  /** If set, sets that recorded RIR must have RIR >= this to count toward an increase. */
  minRirToProgress: number | null;
  /** Consecutive sessions below the rep floor before a weight reduction is suggested. */
  failuresBeforeReduce: number;
  /** Reduction applied after repeated failures (fraction). */
  reducePct: number;
  /** Back-off sets use this fraction of the top set. */
  backoffPct: number;
}

export interface Settings {
  restSec: number;
  autoStartTimer: boolean;
  askRir: boolean;
  /** Recommend a deload after this many weeks without one (0 = off). Ignored while a programme is active. */
  deloadEveryWeeks: number;
  /** Suggest a heavy session after this many weeks without one (0 = off). */
  heavyEveryWeeks: number;
  progression: ProgressionSettings;
  equipment: EquipmentProfile;
}

export interface Profile extends Timestamps {
  id: 'profile';
  name: string;
  experience: Experience;
  unit: Unit;
  onboarded: boolean;
  settings: Settings;
}

export interface TemplateItem {
  exerciseId: ID;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number | null;
  restSec: number | null;
  method: ProgressionMethod;
}

export interface WorkoutTemplate extends Timestamps {
  id: ID;
  name: string;
  items: TemplateItem[];
  deleted?: boolean;
}

export interface SetLog {
  id: ID;
  kind: SetKind;
  weightKg: number;
  reps: number;
  rir: number | null;
  done: boolean;
  completedAt: number | null;
}

export interface EntryTarget {
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number | null;
  method: ProgressionMethod;
  restSec: number | null;
}

export interface EntryRecommendation {
  action: string;
  weightKg: number | null;
  reasons: string[];
}

export interface WorkoutEntry {
  id: ID;
  exerciseId: ID;
  /** Snapshot of the recommendation shown when the workout started (explainability). */
  rec?: EntryRecommendation;
  notes: string;
  substitutedFrom: ID | null;
  skipped: boolean;
  target: EntryTarget;
  sets: SetLog[];
}

export interface Workout extends Timestamps {
  id: ID;
  name: string;
  status: 'active' | 'completed';
  startedAt: number;
  finishedAt: number | null;
  templateId: ID | null;
  blockName: string | null;
  isDeload: boolean;
  isHeavy: boolean;
  notes: string;
  entries: WorkoutEntry[];
  deleted?: boolean;
}

export interface Block {
  id: ID;
  name: string;
  type: BlockType;
  weeks: number;
  repMin: number;
  repMax: number;
  sets: number;
  targetRir: number | null;
  method: ProgressionMethod;
  /** Multiplies the normal set count (deload uses 0.5). */
  setFactor: number;
  /** Multiplies the working load (deload uses 0.9). */
  loadFactor: number;
}

export interface Program extends Timestamps {
  id: ID;
  name: string;
  active: boolean;
  blocks: Block[];
  currentBlockIndex: number;
  blockStartedAt: number;
}

export type PRType = 'max_weight' | 'reps_at_weight' | 'e1rm' | 'volume' | 'tested_1rm';

export interface PersonalRecord {
  id: ID;
  exerciseId: ID;
  type: PRType;
  value: number;
  weightKg: number;
  reps: number;
  workoutId: ID;
  date: number;
}
