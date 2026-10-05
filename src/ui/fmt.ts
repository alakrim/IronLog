import type { Equipment, MovementPattern, Muscle, PRType, ProgressionMethod, Workout } from '../domain/types';
import { dateLocale, t } from '../i18n';

/** Label tables expose translated text through getters so call sites stay `LABEL[key]`. */
function labels<K extends string>(get: Record<K, () => string>): Record<K, string> {
  const o = {} as Record<K, string>;
  for (const k of Object.keys(get) as K[]) Object.defineProperty(o, k, { get: get[k], enumerable: true });
  return o;
}

export const MUSCLE_LABEL: Record<Muscle, string> = labels<Muscle>({
  chest: () => t('Chest'), back: () => t('Upper back'), lats: () => t('Lats'), traps: () => t('Traps'),
  shoulders: () => t('Shoulders'), rear_delts: () => t('Rear delts'), biceps: () => t('Biceps'), triceps: () => t('Triceps'),
  forearms: () => t('Forearms'), quads: () => t('Quads'), hamstrings: () => t('Hamstrings'), glutes: () => t('Glutes'),
  calves: () => t('Calves'), abs: () => t('Abs'), lower_back: () => t('Lower back'), adductors: () => t('Adductors'),
});

export const EQUIP_LABEL: Record<Equipment, string> = labels<Equipment>({
  barbell: () => t('Barbell'), dumbbell: () => t('Dumbbell'), machine: () => t('Machine'),
  cable: () => t('Cable'), bodyweight: () => t('Bodyweight'), other: () => t('Other'),
});

export const PATTERN_LABEL: Record<MovementPattern, string> = labels<MovementPattern>({
  horizontal_push: () => t('Horizontal push'), vertical_push: () => t('Vertical push'),
  horizontal_pull: () => t('Horizontal pull'), vertical_pull: () => t('Vertical pull'),
  squat: () => t('Squat'), hinge: () => t('Hinge'), lunge: () => t('Lunge'),
  isolation: () => t('Isolation'), core: () => t('Core'), carry: () => t('Carry'),
});

export const METHOD_LABEL: Record<ProgressionMethod, string> = labels<ProgressionMethod>({
  double: () => t('Double progression'), linear: () => t('Linear (fixed reps)'),
  top_backoff: () => t('Top set + back-offs'), none: () => t('Off (manual)'),
});

export const ACTION_LABEL: Record<string, string> = labels<string>({
  start: () => t('First time'), increase: () => t('Add weight'), maintain: () => t('Same weight'),
  reduce: () => t('Reduce'), transition: () => t('New rep range'), deload: () => t('Deload'), heavy: () => t('Heavy day'),
});

export const PR_TEXT: Record<PRType, string> = labels<PRType>({
  max_weight: () => t('Heaviest weight'), reps_at_weight: () => t('Rep PR'), e1rm: () => t('Best est. 1RM'),
  volume: () => t('Volume PR'), tested_1rm: () => t('Tested 1RM'),
});

export function fmtDate(ts: number, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(ts).toLocaleDateString(dateLocale(), opts);
}

export function relDay(ts: number, now = Date.now()) {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(ts); d1.setHours(0, 0, 0, 0);
  const days = Math.round((d0.getTime() - d1.getTime()) / 86400000);
  if (days === 0) return t('Today');
  if (days === 1) return t('Yesterday');
  if (days < 7) return t('{n} days ago', { n: days });
  return fmtDate(ts);
}

export function fmtDuration(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtBig(n: number) {
  if (n >= 100000) return `${Math.round(n / 1000)}k`;
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString(dateLocale());
}

export const doneSets = (w: Workout) => w.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
