import type { Exercise, TemplateItem, WorkoutTemplate } from '../domain/types';
import { uid } from './uid';

const PRESETS: [string, string[]][] = [
  ['Push', ['bench_press', 'incline_db_press', 'lateral_raise', 'db_shoulder_press', 'triceps_pushdown']],
  ['Pull', ['pull_up', 'barbell_row', 'lat_pulldown', 'rear_delt_fly', 'db_curl']],
  ['Legs', ['squat', 'rdl', 'leg_press', 'leg_curl', 'calf_raise']],
];

export function itemFor(ex: Exercise): TemplateItem {
  return { exerciseId: ex.id, sets: ex.sets, repMin: ex.repMin, repMax: ex.repMax, targetRir: 2, restSec: null, method: ex.method };
}

export function seedTemplates(exercises: Exercise[], now: number): WorkoutTemplate[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return PRESETS.map(([name, ids], i) => ({
    id: uid('tpl'),
    name,
    items: ids.map((id) => byId.get(id)).filter((e): e is Exercise => !!e).map(itemFor),
    createdAt: now + i,
    updatedAt: now + i,
  }));
}
