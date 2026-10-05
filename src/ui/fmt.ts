import type { Muscle, PRType, Workout } from '../domain/types';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Upper back', lats: 'Lats', traps: 'Traps', shoulders: 'Shoulders', rear_delts: 'Rear delts',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  calves: 'Calves', abs: 'Abs', lower_back: 'Lower back', adductors: 'Adductors',
};

export const ACTION_LABEL: Record<string, string> = {
  start: 'First time', increase: 'Add weight', maintain: 'Same weight', reduce: 'Reduce', transition: 'New rep range',
  deload: 'Deload', heavy: 'Heavy day',
};

export const PR_TEXT: Record<PRType, string> = {
  max_weight: 'Heaviest weight', reps_at_weight: 'Rep PR', e1rm: 'Best est. 1RM', volume: 'Volume PR', tested_1rm: 'Tested 1RM',
};

export function fmtDate(t: number, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(t).toLocaleDateString(undefined, opts);
}

export function relDay(t: number, now = Date.now()) {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(t); d1.setHours(0, 0, 0, 0);
  const days = Math.round((d0.getTime() - d1.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fmtDate(t);
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
  return Math.round(n).toLocaleString();
}

export const doneSets = (w: Workout) => w.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
