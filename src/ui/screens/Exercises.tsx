import { useMemo, useState } from 'react';
import { exerciseSeries } from '../../domain/analytics';
import { toDisplay } from '../../domain/loads';
import { programStatus } from '../../domain/periodization';
import { recommend, resolveTarget } from '../../domain/progression';
import type { Equipment, Exercise, MovementPattern, Muscle, ProgressionMethod } from '../../domain/types';
import { activeBlock, historyFor } from '../../store/store';
import { useActions, useApp, useW } from '../ctx';
import { useNav } from '../nav';
import { ExerciseList, Seg, Switch, TopBar } from '../components';
import { LineChart } from '../charts';
import { ACTION_LABEL, fmtDate, MUSCLE_LABEL, PR_TEXT, relDay } from '../fmt';
import { IconPlus } from '../icons';

export function Exercises() {
  const nav = useNav();
  return (
    <div className="screen">
      <TopBar title="Exercises" right={<button className="btn small" onClick={() => nav.push({ name: 'exerciseEdit', id: null })}><IconPlus width={18} /> New</button>} />
      <ExerciseList onPick={(e) => nav.push({ name: 'exercise', id: e.id })} />
    </div>
  );
}

const METHOD_LABEL: Record<ProgressionMethod, string> = {
  double: 'Double progression', linear: 'Linear (fixed reps)', top_backoff: 'Top set + back-offs', none: 'Off (manual)',
};

export function ExerciseDetail({ id }: { id: string }) {
  const s = useActions();
  const nav = useNav();
  const w = useW();
  const unit = s.profile.unit;
  const ex = s.exercises.find((e) => e.id === id);
  const [tab, setTab] = useState<'progress' | 'form'>('progress');
  const series = useMemo(() => exerciseSeries(id, s.workouts), [id, s.workouts]);
  const prs = useMemo(() => s.prs.filter((p) => p.exerciseId === id).sort((a, b) => b.date - a.date), [s.prs, id]);
  const next = useMemo(() => {
    if (!ex) return null;
    const block = activeBlock(s.program, Date.now());
    const tplItem = s.templates.flatMap((t) => t.items).find((i) => i.exerciseId === id) ?? null;
    return recommend(ex, resolveTarget(ex, tplItem, block), historyFor(s.workouts, id), s.profile.settings, { isDeload: block?.type === 'deload' });
  }, [ex, s.program, s.templates, s.workouts, s.profile.settings, id]);
  if (!ex) return <div className="screen"><TopBar title="Exercise" onBack={nav.back} /><div className="empty"><h3>Exercise not found</h3></div></div>;

  const d = (kg: number) => Math.round(toDisplay(kg, unit) * 10) / 10;
  const ests = series.filter((p) => p.bestE1rm != null);
  const bestEst = ests.length ? Math.max(...ests.map((p) => p.bestE1rm!)) : null;
  const tested = series.filter((p) => p.tested1rm != null);
  const bestTested = tested.length ? Math.max(...tested.map((p) => p.tested1rm!)) : null;
  const heaviest = series.length ? Math.max(...series.map((p) => p.topWeight)) : null;
  const prDates = new Set(prs.filter((p) => p.type === 'e1rm').map((p) => p.date));
  const status = s.program ? programStatus(s.program, Date.now()) : null;

  return (
    <div className="screen">
      <TopBar title={ex.name} sub={`${MUSCLE_LABEL[ex.primary]}, ${ex.equipment}`} onBack={nav.back}
        right={<button className="btn small" onClick={() => nav.push({ name: 'exerciseEdit', id })}>Edit</button>} />
      <Seg label="Section" value={tab} onChange={setTab} options={[{ value: 'progress', label: 'Progress' }, { value: 'form', label: 'How to' }]} />

      {tab === 'progress' ? (
        <>
          {next && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row" style={{ marginBottom: 6 }}>
                <div className="grow small muted">Next session{status ? `, ${status.block.name}` : ''}</div>
                <span className={`badge ${next.action}`}>{ACTION_LABEL[next.action]}</span>
              </div>
              <div className="num" style={{ fontSize: 34, lineHeight: 1.1 }}>
                {next.weightKg != null ? w(next.weightKg) : 'Pick a weight'} <span className="ink2" style={{ fontSize: 22 }}>
                  {next.target.sets} × {next.target.repMin === next.target.repMax ? next.target.repMin : `${next.target.repMin}–${next.target.repMax}`}</span>
              </div>
              <ul className="small ink2" style={{ paddingLeft: 18, margin: '8px 0 0' }}>{next.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}

          <div className="stat-row" style={{ marginTop: 12 }}>
            <div className="stat"><div className="num">{bestEst ? w(Math.round(bestEst * 2) / 2) : '—'}</div><div className="muted">best est. 1RM</div></div>
            <div className="stat"><div className="num">{heaviest != null ? w(heaviest) : '—'}</div><div className="muted">heaviest set</div></div>
            <div className="stat"><div className="num">{bestTested ? w(bestTested) : '—'}</div><div className="muted">tested 1RM</div></div>
          </div>

          <div className="section-h">Estimated 1RM</div>
          <div className="card">
            <LineChart label={`Estimated 1RM for ${ex.name}`}
              points={ests.map((p) => ({ x: p.date, y: d(p.bestE1rm!), pr: prDates.has(p.date) }))}
              alt={series.map((p) => ({ x: p.date, y: d(p.topWeight) }))} />
            <div className="legend"><span><i />Est. 1RM (Epley, sets of 12 or fewer)</span><span><i className="alt" />Top set weight</span></div>
            <p className="tiny muted" style={{ margin: '8px 0 0' }}>An estimate for tracking trends, not a tested max. Tested 1RM only counts real singles.</p>
          </div>

          <div className="section-h">Sessions</div>
          {series.length === 0 ? <div className="card muted small">No sessions logged yet.</div> : (
            <div className="list">
              {[...series].reverse().slice(0, 20).map((p) => {
                const wk = s.workouts.find((x) => x.id === p.workoutId);
                const sets = wk?.entries.filter((e) => e.exerciseId === id).flatMap((e) => e.sets.filter((x) => x.done && x.kind !== 'warmup')) ?? [];
                return (
                  <button key={p.workoutId} className="list-item" onClick={() => nav.push({ name: 'workoutDetail', id: p.workoutId })}>
                    <div className="grow">
                      <div className="small muted">{relDay(p.date)}</div>
                      <div className="num" style={{ fontSize: 17 }}>{sets.map((x) => `${d(x.weightKg)}×${x.reps}`).join('  ')}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {prs.length > 0 && (
            <>
              <div className="section-h">Record history</div>
              <div className="list">
                {prs.slice(0, 15).map((p) => (
                  <div key={p.id} className="list-item">
                    <div className="grow"><div>{PR_TEXT[p.type]}</div><div className="tiny muted">{fmtDate(p.date)}</div></div>
                    <div className="num" style={{ fontSize: 18 }}>{p.type === 'volume' || p.type === 'e1rm' ? w(Math.round(p.value * 2) / 2) : `${w(p.weightKg)} × ${p.reps}`}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div className="card">
            <div className="small muted">Works</div>
            <div>{MUSCLE_LABEL[ex.primary]}{ex.secondary.length ? `, plus ${ex.secondary.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(', ')}` : ''}</div>
            <div className="small muted" style={{ marginTop: 10 }}>Default prescription</div>
            <div>{ex.sets} sets of {ex.repMin}–{ex.repMax} reps, {METHOD_LABEL[ex.method].toLowerCase()}</div>
          </div>
          {ex.cues.length > 0 && (<><div className="section-h">Cues</div>
            <div className="card"><ul style={{ margin: 0, paddingLeft: 18 }}>{ex.cues.map((c) => <li key={c} style={{ marginBottom: 4 }}>{c}</li>)}</ul></div></>)}
          {ex.mistakes.length > 0 && (<><div className="section-h">Avoid</div>
            <div className="card" style={{ background: 'var(--tint-red)' }}><ul style={{ margin: 0, paddingLeft: 18 }}>{ex.mistakes.map((c) => <li key={c} style={{ marginBottom: 4 }}>{c}</li>)}</ul></div></>)}
          {ex.notes && (<><div className="section-h">Your notes</div><div className="card">{ex.notes}</div></>)}
          <a className="btn block" style={{ marginTop: 16, textDecoration: 'none' }} target="_blank" rel="noopener noreferrer"
            href={ex.mediaUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.name} exercise proper form`)}`}>
            Watch a demo video (needs internet)
          </a>
        </div>
      )}
    </div>
  );
}

const MUSCLES = Object.keys(MUSCLE_LABEL) as Muscle[];
const EQUIP: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];
const PATTERNS: MovementPattern[] = ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'squat', 'hinge', 'lunge', 'isolation', 'core', 'carry'];

export function ExerciseEdit({ id }: { id: string | null }) {
  const s = useActions();
  const nav = useNav();
  const unit = useApp((x) => x.profile.unit);
  const existing = id ? s.exercises.find((e) => e.id === id) : undefined;
  const [e, setE] = useState<Exercise>(() => existing ?? s.newExercise(''));
  const set = <K extends keyof Exercise>(k: K, v: Exercise[K]) => setE({ ...e, [k]: v });
  const num = (v: string, min = 0) => Math.max(min, Math.round(Number(v) || 0));
  const valid = e.name.trim().length > 0 && e.repMin >= 1 && e.repMax >= e.repMin && e.sets >= 1;

  return (
    <div className="screen">
      <TopBar title={existing ? 'Edit exercise' : 'New exercise'} onBack={nav.back}
        right={<button className="btn small primary" disabled={!valid} onClick={async () => { await s.saveExercise({ ...e, name: e.name.trim() }); nav.back(); }}>Save</button>} />
      <div className="stack">
        <label className="field"><span>Name</span><input className="input" value={e.name} onChange={(x) => set('name', x.target.value)} placeholder="e.g. Smith Machine Incline Press" /></label>
        <div className="row">
          <label className="field grow"><span>Main muscle</span>
            <select className="input" value={e.primary} onChange={(x) => set('primary', x.target.value as Muscle)}>
              {MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_LABEL[m]}</option>)}
            </select></label>
          <label className="field grow"><span>Equipment</span>
            <select className="input" value={e.equipment} onChange={(x) => set('equipment', x.target.value as Equipment)}>
              {EQUIP.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
            </select></label>
        </div>
        <div className="field"><span>Also works</span>
          <div className="chips">{MUSCLES.filter((m) => m !== e.primary).map((m) => (
            <button key={m} className="chip" aria-pressed={e.secondary.includes(m)} onClick={() => set('secondary', e.secondary.includes(m) ? e.secondary.filter((x) => x !== m) : [...e.secondary, m])}>{MUSCLE_LABEL[m]}</button>
          ))}</div></div>
        <div className="field"><span>Type</span>
          <Seg label="Type" value={e.type} onChange={(v) => set('type', v)} options={[{ value: 'compound', label: 'Compound' }, { value: 'isolation', label: 'Isolation' }]} />
          <div className="tiny muted" style={{ marginTop: 4 }}>Training blocks and heavy days change rep ranges for compound lifts only.</div></div>
        <label className="field"><span>Movement</span>
          <select className="input" value={e.pattern} onChange={(x) => set('pattern', x.target.value as MovementPattern)}>
            {PATTERNS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select></label>
        <div className="row">
          <label className="field grow"><span>Sets</span><input className="input" inputMode="numeric" value={e.sets} onChange={(x) => set('sets', num(x.target.value, 1))} /></label>
          <label className="field grow"><span>Min reps</span><input className="input" inputMode="numeric" value={e.repMin} onChange={(x) => set('repMin', num(x.target.value, 1))} /></label>
          <label className="field grow"><span>Max reps</span><input className="input" inputMode="numeric" value={e.repMax} onChange={(x) => set('repMax', num(x.target.value, 1))} /></label>
        </div>
        {e.repMax < e.repMin && <div className="note red">Max reps must be at least min reps.</div>}
        <label className="field"><span>Progression</span>
          <select className="input" value={e.method} onChange={(x) => set('method', x.target.value as ProgressionMethod)}>
            {(Object.keys(METHOD_LABEL) as ProgressionMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select></label>
        <label className="field"><span>Preferred weight jump ({unit})</span>
          <input className="input" inputMode="decimal" defaultValue={Math.round(toDisplay(e.incrementKg, unit) * 100) / 100}
            onBlur={(x) => { const v = parseFloat(x.target.value.replace(',', '.')); if (v > 0) set('incrementKg', unit === 'kg' ? v : v * 0.45359237); }} />
          <div className="tiny muted" style={{ marginTop: 4 }}>Snapped to what your plates, dumbbells or machine stack can actually make.</div></label>
        <label className="field"><span>Notes</span><textarea className="input" value={e.notes} onChange={(x) => set('notes', x.target.value)} placeholder="Setup, seat position, grip…" /></label>
        <div className="list"><div className="list-item"><div className="grow">Show in exercise lists</div><Switch label="Active" checked={e.active} onChange={(v) => set('active', v)} /></div></div>
      </div>
    </div>
  );
}
