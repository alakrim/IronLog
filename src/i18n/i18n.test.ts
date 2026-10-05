import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PT } from './pt';
import { PT_EXERCISES } from './pt-exercises';
import { SEED_EXERCISE_IDS, seedExercises } from '../data/seedExercises';

function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const q = `'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"`;
const ev = (s: string) => (0, eval)(s) as string;
function keys(): string[] {
  const out = new Set<string>();
  for (const f of walk('src').filter((x) => /\.tsx?$/.test(x) && !/test|i18n\/pt/.test(x))) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(new RegExp(`(?<![\\w.])t\\(\\s*(${q})`, 'g'))) out.add(ev(m[1]));
    for (const m of s.matchAll(new RegExp(`(?<![\\w.])tn\\(\\s*[^,]+,\\s*(${q})\\s*,\\s*(${q})`, 'g'))) { out.add(ev(m[1])); out.add(ev(m[2])); }
  }
  return [...out];
}
const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('Portuguese coverage', () => {
  const ks = keys();
  it('finds the keys', () => expect(ks.length).toBeGreaterThan(300));
  it('translates every key', () => expect(ks.filter((k) => !(k in PT))).toEqual([]));
  it('keeps placeholders identical', () => expect(ks.filter((k) => k in PT && ph(k.replace(/\|\|.*/, '')) !== ph(PT[k]))).toEqual([]));
  it('has no unused entries', () => expect(Object.keys(PT).filter((k) => !ks.includes(k))).toEqual([]));
  it('translates all seed exercises', () => {
    expect(SEED_EXERCISE_IDS.filter((id) => !PT_EXERCISES[id])).toEqual([]);
    for (const e of seedExercises(0)) {
      expect(PT_EXERCISES[e.id].cues.length, e.id).toBe(e.cues.length);
      expect(PT_EXERCISES[e.id].mistakes.length, e.id).toBe(e.mistakes.length);
    }
  });
});
