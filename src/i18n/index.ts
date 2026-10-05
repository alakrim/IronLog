/**
 * Tiny i18n layer. English text is the key; {name} placeholders are filled from params.
 * Domain rules use the same t() so explanations ("Why?") are translated too.
 * The language is module-level state; the UI remounts when it changes (see App.tsx).
 */
import { PT } from './pt';
import type { Exercise } from '../domain/types';
import { PT_EXERCISES } from './pt-exercises';

export type Lang = 'en' | 'pt';
export const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
];

let lang: Lang = 'en';
export const setLang = (l: Lang) => { lang = l; };
export const getLang = (): Lang => lang;
export const dateLocale = (): string | undefined => (lang === 'pt' ? 'pt-BR' : undefined);

export function detectLang(): Lang {
  try {
    return (globalThis.navigator?.language ?? 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';
  } catch { return 'en'; }
}

export function t(key: string, p?: Record<string, string | number>): string {
  let s = lang === 'pt' ? PT[key] ?? key : key;
  const ctx = s.indexOf('||'); // 'Back||muscles' disambiguates identical English words
  if (ctx >= 0) s = s.slice(0, ctx);
  if (p) s = s.replace(/\{(\w+)\}/g, (_, k: string) => (p[k] === undefined ? '' : String(p[k])));
  return s;
}

/** Plural helper: both forms are translation keys. {n} is filled automatically. */
export function tn(n: number, one: string, other: string, p?: Record<string, string | number>): string {
  return t(n === 1 ? one : other, { n, ...p });
}

// Names of things the app creates for you (starter templates, cycle blocks). When the language
// changes they are renamed to match, unless you edited them.
const SEED_NAMES: [string, string][] = [
  ['Push', 'Empurrar'], ['Pull', 'Puxar'], ['Legs', 'Pernas'], ['Workout', 'Treino'],
  ['Hypertrophy I', 'Hipertrofia I'], ['Hypertrophy II', 'Hipertrofia II'],
  ['Strength I', 'Força I'], ['Strength II', 'Força II'], ['Deload', 'Descarga'],
  ['Hypertrophy → Strength', 'Hipertrofia → Força'],
];
export function seedName(name: string, to: Lang): string {
  for (const [en, pt] of SEED_NAMES) if (name === en || name === pt) return to === 'pt' ? pt : en;
  return name;
}

// Built-in exercises are translated by id; custom exercises keep what the user typed.
export const exName = (e: Pick<Exercise, 'id' | 'name' | 'isCustom'>): string =>
  lang === 'pt' && !e.isCustom ? PT_EXERCISES[e.id]?.name ?? e.name : e.name;
export const exCues = (e: Exercise): string[] =>
  lang === 'pt' && !e.isCustom ? PT_EXERCISES[e.id]?.cues ?? e.cues : e.cues;
export const exMistakes = (e: Exercise): string[] =>
  lang === 'pt' && !e.isCustom ? PT_EXERCISES[e.id]?.mistakes ?? e.mistakes : e.mistakes;
