import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { workoutVolume } from '../../domain/analytics';
import { achievableLoads, EPS, fmtLoad, fromDisplay, platesPerSide, toDisplay } from '../../domain/loads';
import { bestsFor, setPRs, type Bests } from '../../domain/prs';
import type { Exercise, SetLog, Workout, WorkoutEntry } from '../../domain/types';
import { exName, t, tn } from '../../i18n';
import { historyFor } from '../../store/store';
import { useActions, useApp, useUnit, useW } from '../ctx';
import { useNav } from '../nav';
import { Confirm, ExercisePicker, Sheet } from '../components';
import { ACTION_LABEL, doneSets, fmtBig, fmtClock, fmtDuration, PR_TEXT } from '../fmt';
import { IconBack, IconCheck, IconDown, IconInfo, IconMore, IconPlus, IconSwap, IconUp, IconX } from '../icons';

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

export function WorkoutScreen({ id }: { id: string }) {
  const nav = useNav();
  const s = useActions();
  const workout = s.workouts.find((w) => w.id === id);
  const [picker, setPicker] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [discard, setDiscard] = useState(false);
  useTick(1000);

  const completed = useMemo(
    () => s.workouts.filter((w) => w.status === 'completed' && !w.deleted && w.id !== id),
    [s.workouts, id],
  );

  if (!workout) {
    return <div className="screen"><div className="empty"><h3>{t('Workout not found')}</h3><button className="btn" onClick={nav.back}>{t('Go back')}</button></div></div>;
  }
  if (workout.status === 'completed') {
    // Finished elsewhere (e.g. another tab) — show the summary.
    nav.replace({ name: 'workoutDetail', id });
    return null;
  }

  const current = currentSetOf(workout);
  const total = workout.entries.filter((e) => !e.skipped).reduce((a, e) => a + e.sets.length, 0);
  const done = doneSets(workout);

  return (
    <div className="screen" style={{ paddingBottom: s.timer ? 170 : 110 }}>
      <div className="wk-head">
        <button className="icon-btn" aria-label={t('Back to home (workout keeps running)')} onClick={nav.back}><IconBack /></button>
        <div className="title">
          <b className="trunc">{workout.name}{workout.isHeavy ? `, ${t('heavy day')}` : ''}{workout.isDeload ? `, ${t('deload')}` : ''}</b>
          <span className="clock num" style={{ fontWeight: 600 }}>{fmtClock(Date.now() - workout.startedAt)}</span>
          {workout.blockName && <span className="clock">  {workout.blockName}</span>}
        </div>
        <button className="icon-btn" aria-label={t('Workout options')} onClick={() => setMenu(true)}><IconMore /></button>
        <button className="btn primary small" onClick={() => setFinishing(true)}>{t('Finish')}</button>
      </div>
      <div className="wk-progress" aria-hidden="true"><div style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>

      {workout.entries.length === 0 && (
        <div className="empty"><h3>{t('Empty workout')}</h3><p>{t('Add your first exercise to start logging.')}</p></div>
      )}
      {workout.entries.map((e, i) => (
        <EntryCard key={e.id} workout={workout} entry={e} index={i} currentSetId={current?.setId ?? null} completed={completed} live />
      ))}

      <button className="btn block" style={{ marginTop: 4 }} onClick={() => setPicker(true)}><IconPlus width={20} /> {t('Add exercise')}</button>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(ex) => s.addExercise(id, ex.id)} />

      <Sheet open={menu} onClose={() => setMenu(false)} title={t('Workout options')}>
        <label className="field" style={{ marginBottom: 12 }}><span>{t('Workout name')}</span>
          <input className="input" value={workout.name} onChange={(e) => s.updateWorkout(id, { name: e.target.value })} />
        </label>
        <button className="btn danger block" onClick={() => { setMenu(false); setDiscard(true); }}>{t('Discard workout')}</button>
      </Sheet>
      <Confirm open={discard} onClose={() => setDiscard(false)} danger title={t('Discard this workout?')}
        body={t("All sets logged in this workout will be deleted. This can't be undone.")} confirmLabel={t('Discard workout')}
        onConfirm={async () => { await s.discardWorkout(id); nav.back(); }} />
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} workout={workout} />
    </div>
  );
}

function currentSetOf(w: Workout): { entryId: string; setId: string } | null {
  for (const e of w.entries) {
    if (e.skipped) continue;
    const s = e.sets.find((x) => !x.done);
    if (s) return { entryId: e.id, setId: s.id };
  }
  return null;
}

// ---------------------------------------------------------------------------

export const EntryCard = memo(function EntryCard({ workout, entry, index, currentSetId, completed, live }: {
  workout: Workout; entry: WorkoutEntry; index: number; currentSetId: string | null; completed: Workout[]; live: boolean;
}) {
  const s = useActions();
  const nav = useNav();
  const w = useW();
  const ex = s.exercises.find((x) => x.id === entry.exerciseId);
  const [menu, setMenu] = useState(false);
  const [why, setWhy] = useState(false);
  const [swap, setSwap] = useState(false);
  const [notes, setNotes] = useState(false);

  const prior = useMemo(() => completed.filter((x) => x.startedAt < workout.startedAt), [completed, workout.startedAt]);
  const bests = useMemo(() => bestsFor(entry.exerciseId, prior), [entry.exerciseId, prior]);
  const previous = useMemo(() => {
    const h = historyFor(prior, entry.exerciseId, workout.id).filter((x) => !x.isDeload);
    return h[0]?.sets.filter((x) => x.done) ?? [];
  }, [prior, entry.exerciseId, workout.id]);

  if (!ex) return null;
  const tg = entry.target;
  const allDone = entry.sets.length > 0 && entry.sets.every((x) => x.done);
  const lastDoneId = [...entry.sets].reverse().find((x) => x.done)?.id;
  const swappedEx = entry.substitutedFrom ? s.exercises.find((x) => x.id === entry.substitutedFrom) : undefined;
  const swapped = swappedEx ? exName(swappedEx) : null;
  const prevByKind = (set: SetLog, i: number) => {
    const sameKind = previous.filter((p) => p.kind === set.kind || (set.kind === 'working' && p.kind !== 'warmup'));
    const kindIndex = entry.sets.slice(0, i).filter((x) => x.kind === set.kind).length;
    return sameKind[kindIndex] ?? null;
  };

  return (
    <section className={`ex-card${allDone ? ' done-all' : ''}${entry.skipped ? ' skipped' : ''}`} aria-label={exName(ex)}>
      <div className="ex-top">
        <div className="grow">
          <h3>{exName(ex)}</h3>
          <div className="meta">
            {entry.skipped ? t('Skipped') : `${tg.sets} × ${tg.repMin === tg.repMax ? tg.repMin : `${tg.repMin}–${tg.repMax}`} ${t('reps')}${tg.targetRir != null ? `, RIR ${tg.targetRir}` : ''}`}
            {swapped ? `, ${t('replaces {name}', { name: swapped })}` : ''}
          </div>
        </div>
        <button className="icon-btn" aria-label={t('Options for {name}', { name: exName(ex) })} onClick={() => setMenu(true)}><IconMore /></button>
      </div>

      {live && entry.rec && !entry.skipped && (
        <button className="rec" onClick={() => setWhy(true)} aria-label={t('Why this recommendation')}>
          <span className={`badge ${entry.rec.action}`}>{ACTION_LABEL[entry.rec.action] ?? entry.rec.action}{entry.rec.weightKg != null ? ` ${w(entry.rec.weightKg)}` : ''}</span>
          <span className="grow" style={{ lineHeight: 1.3 }}>{entry.rec.reasons[0]} <span style={{ color: 'var(--plate-blue)', fontWeight: 600 }}>{t('Why?')}</span></span>
        </button>
      )}
      {entry.notes && <div className="small ink2" style={{ margin: '0 16px 8px' }}>{t('Note: {text}', { text: entry.notes })}</div>}

      {!entry.skipped && (
        <>
          <div className="set-head" aria-hidden="true">
            <span style={{ textAlign: 'center' }}>{t('Set')}</span><span>{s.profile.unit}</span><span>{t('Reps')}</span><span />
          </div>
          {entry.sets.map((set, i) => (
            <SetRow key={set.id} workout={workout} entry={entry} ex={ex} set={set} index={i}
              number={entry.sets.slice(0, i + 1).filter((x) => x.kind !== 'warmup').length}
              current={set.id === currentSetId} showRir={live && set.id === lastDoneId}
              prev={prevByKind(set, i)} bests={bests} live={live} />
          ))}
          <div className="ex-foot">
            <button className="btn small" onClick={() => s.addSet(workout.id, entry.id)}><IconPlus width={18} /> {t('Add set')}</button>
            <div className="grow" />
            {entry.sets.length > 0 && !entry.sets[entry.sets.length - 1].done && (
              <button className="btn small ghost" onClick={() => s.removeSet(workout.id, entry.id, entry.sets[entry.sets.length - 1].id)}>{t('Remove last set')}</button>
            )}
          </div>
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={exName(ex)}>
        <div className="list">
          <button className="list-item" onClick={() => { setMenu(false); nav.push({ name: 'exercise', id: ex.id }); }}><IconInfo width={20} /> {t('Form tips and progress')}</button>
          <button className="list-item" onClick={() => { setMenu(false); setSwap(true); }}><IconSwap width={20} /> {t('Substitute exercise')}</button>
          <button className="list-item" onClick={() => { setMenu(false); setNotes(true); }}><IconPlus width={20} /> {entry.notes ? t('Edit note') : t('Add note')}</button>
          {index > 0 && <button className="list-item" onClick={() => { s.moveEntry(workout.id, entry.id, -1); setMenu(false); }}><IconUp width={20} /> {t('Move up')}</button>}
          {index < workout.entries.length - 1 && <button className="list-item" onClick={() => { s.moveEntry(workout.id, entry.id, 1); setMenu(false); }}><IconDown width={20} /> {t('Move down')}</button>}
          <button className="list-item" onClick={() => { s.setEntrySkipped(workout.id, entry.id, !entry.skipped); setMenu(false); }}><IconX width={20} /> {entry.skipped ? t('Unskip') : t('Skip today')}</button>
          <button className="list-item" style={{ color: 'var(--plate-red)' }} onClick={() => { s.removeEntry(workout.id, entry.id); setMenu(false); }}><IconX width={20} /> {t('Remove from workout')}</button>
        </div>
      </Sheet>
      <Sheet open={why} onClose={() => setWhy(false)} title={t('Why this suggestion')}>
        <ul style={{ paddingLeft: 18, margin: '0 0 12px' }}>{entry.rec?.reasons.map((r, i) => <li key={i} style={{ marginBottom: 6 }}>{r}</li>)}</ul>
        <p className="small muted">{t('Suggestions come from fixed rules using your logged sets. Change any weight or rep before you tick the set; the app never locks you in. Rule settings live in Settings.')}</p>
      </Sheet>
      <ExercisePicker open={swap} onClose={() => setSwap(false)} title={t('Replace {name}', { name: exName(ex) })}
        filter={(e) => e.id !== ex.id}
        onPick={(n) => s.substituteExercise(workout.id, entry.id, n.id)} />
      <NotesSheet open={notes} onClose={() => setNotes(false)} value={entry.notes} onSave={(v) => s.setEntryNotes(workout.id, entry.id, v)} />
    </section>
  );
});

function NotesSheet({ open, onClose, value, onSave }: { open: boolean; onClose: () => void; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { if (open) setV(value); }, [open, value]);
  return (
    <Sheet open={open} onClose={onClose} title={t('Exercise note')}>
      <textarea className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={t('Seat height 4, felt a twinge in the left shoulder…')} autoFocus />
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => { onSave(v.trim()); onClose(); }}>{t('Save note')}</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

function SetRow({ workout, entry, ex, set, index, number, current, showRir, prev, bests, live }: {
  workout: Workout; entry: WorkoutEntry; ex: Exercise; set: SetLog; index: number; number: number; current: boolean;
  showRir: boolean; prev: SetLog | null; bests: Bests; live: boolean;
}) {
  const s = useActions();
  const unit = useUnit();
  const settings = useApp((x) => x.profile.settings);
  const loads = useMemo(() => achievableLoads(ex.equipment, settings.equipment, ex.incrementKg), [ex.equipment, ex.incrementKg, settings.equipment]);
  const rowRef = useRef<HTMLDivElement>(null);
  const wasCurrent = useRef(current);

  // Bring the next set into view after the previous one is ticked.
  useEffect(() => {
    if (current && !wasCurrent.current && rowRef.current) {
      const r = rowRef.current.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 160 || r.top < 60) rowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    wasCurrent.current = current;
  }, [current]);

  const up = () => {
    const next = loads.find((l) => l > set.weightKg + EPS);
    s.updateSet(workout.id, entry.id, set.id, { weightKg: next ?? set.weightKg + (ex.incrementKg || 1) });
  };
  const down = () => {
    const below = loads.filter((l) => l < set.weightKg - EPS);
    s.updateSet(workout.id, entry.id, set.id, { weightKg: below.length ? below[below.length - 1] : 0 });
  };
  const bw = ex.equipment === 'bodyweight';
  const weightText = set.weightKg === 0 && (bw || set.done) ? (bw ? t('BW') : '0') : set.weightKg === 0 ? '' : fmtLoad(set.weightKg, unit);

  const toggle = async () => {
    const nowDone = await s.toggleSet(workout.id, entry.id, set.id);
    if (nowDone && live) {
      try { navigator.vibrate?.(30); } catch { /* unsupported */ }
      if (settings.autoStartTimer) s.startTimer(entry.target.restSec ?? settings.restSec);
    }
  };

  const prs = live && set.done ? setPRs(set, bests) : [];
  const plates = current && ex.equipment === 'barbell' && set.weightKg > 0 ? platesPerSide(set.weightKg, settings.equipment) : null;

  return (
    <div ref={rowRef} className={`set-row${current ? ' current' : ''}${set.done ? ' done' : ''}`}>
      <div className="set-no">
        {set.kind === 'warmup' ? 'W' : number}
        {(set.kind === 'top' || set.kind === 'backoff') && <small>{set.kind === 'top' ? t('top') : t('back-off')}</small>}
      </div>
      <StepperCell label={t('Set {n} weight', { n: number })} display={weightText} placeholder={unit} decimal
        onCommit={(n) => s.updateSet(workout.id, entry.id, set.id, { weightKg: Math.round(fromDisplay(n, unit) * 1e4) / 1e4 })}
        onDec={down} onInc={up} />
      <StepperCell label={t('Set {n} reps', { n: number })} display={String(set.reps)}
        onCommit={(n) => s.updateSet(workout.id, entry.id, set.id, { reps: Math.round(n) })}
        onDec={() => s.updateSet(workout.id, entry.id, set.id, { reps: Math.max(0, set.reps - 1) })}
        onInc={() => s.updateSet(workout.id, entry.id, set.id, { reps: set.reps + 1 })} />
      <button className={`check${set.done ? ' on' : ''}`} aria-pressed={set.done} aria-label={set.done ? t('Set {n} done. Tap to undo', { n: number }) : t('Complete set {n}', { n: number })} onClick={toggle}>
        <IconCheck />
      </button>
      {!set.done && (prev || (plates && plates.length > 0)) && (
        <div className="prev">
          {prev && <>{t('Last time')} <span className="num">{fmtLoad(prev.weightKg, unit)} × {prev.reps}</span>{prev.rir != null ? `, RIR ${prev.rir}` : ''}</>}
          {plates && plates.length > 0 && <div>{t('Per side:')} {plates.map((p) => fmtLoad(p, unit)).join(' + ')}</div>}
        </div>
      )}
      {prs.length > 0 && (
        <div className="pr-flag"><span className="badge pr">{t('New PR')}</span> <span className="small ink2">{prs.map((p) => PR_TEXT[p.type]).join(', ')}</span></div>
      )}
      {showRir && settings.askRir && (
        <div className="rir-row" role="group" aria-label={t('Reps in reserve (optional)')}>
          <span>{t('Reps left?')}</span>
          {[0, 1, 2, 3, 4].map((r) => (
            <button key={r} aria-pressed={set.rir === r} onClick={() => s.updateSet(workout.id, entry.id, set.id, { rir: set.rir === r ? null : r })}>{r === 4 ? '4+' : r}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function StepperCell(p: { label: string; display: string; placeholder?: string; decimal?: boolean; onCommit: (n: number) => void; onDec: () => void; onInc: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  // Focusing clears the field (old value stays as placeholder) so typing replaces it; blur with nothing typed keeps it.
  const commit = () => {
    if (draft == null) return;
    const n = parseFloat(draft.replace(',', '.'));
    if (draft.trim() !== '' && Number.isFinite(n) && n >= 0 && n < 10000) p.onCommit(n);
    setDraft(null);
  };
  return (
    <div className="stepper">
      <button type="button" aria-label={t('Decrease {label}', { label: p.label })} onClick={p.onDec}>−</button>
      <input className="val" aria-label={p.label} inputMode={p.decimal ? 'decimal' : 'numeric'} enterKeyHint="done"
        value={draft ?? p.display} placeholder={draft != null ? p.display || p.placeholder : p.placeholder}
        onFocus={() => setDraft('')}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <button type="button" aria-label={t('Increase {label}', { label: p.label })} onClick={p.onInc}>+</button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FinishSheet({ open, onClose, workout }: { open: boolean; onClose: () => void; workout: Workout }) {
  const s = useActions();
  const nav = useNav();
  const [notes, setNotes] = useState(workout.notes);
  useEffect(() => { if (open) setNotes(workout.notes); }, [open, workout.notes]);
  const done = doneSets(workout);
  const open_ = workout.entries.filter((e) => !e.skipped).reduce((a, e) => a + e.sets.filter((x) => !x.done).length, 0);
  return (
    <Sheet open={open} onClose={onClose} title={done ? t('Finish workout?') : t('Nothing logged yet')}>
      {done ? (
        <>
          <div className="stat-row" style={{ marginBottom: 12 }}>
            <div className="stat"><div className="num">{fmtDuration(Date.now() - workout.startedAt)}</div><div className="muted">{t('duration')}</div></div>
            <div className="stat"><div className="num">{done}</div><div className="muted">{t('sets')}</div></div>
            <div className="stat"><div className="num">{fmtBig(toDisplay(workoutVolume(workout), s.profile.unit))}</div><div className="muted">{t('{unit} lifted', { unit: s.profile.unit })}</div></div>
          </div>
          {open_ > 0 && <div className="note yellow" style={{ marginBottom: 12 }}>{tn(open_, "{n} unticked set won't count toward progress.", "{n} unticked sets won't count toward progress.")}</div>}
          <label className="field"><span>{t('Workout note (optional)')}</span>
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Slept badly, gym was busy…')} />
          </label>
          <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn primary block" onClick={async () => {
              await s.updateWorkout(workout.id, { notes: notes.trim() });
              await s.finishWorkout(workout.id);
              onClose();
              nav.replace({ name: 'workoutDetail', id: workout.id, finished: true });
            }}>{t('Finish workout')}</button>
            <button className="btn ghost block" onClick={onClose}>{t('Keep going')}</button>
          </div>
        </>
      ) : (
        <>
          <p className="ink2">{t('Tick at least one set to save this workout, or discard it.')}</p>
          <div className="stack">
            <button className="btn block" onClick={onClose}>{t('Keep going')}</button>
            <button className="btn danger block" onClick={async () => { await s.discardWorkout(workout.id); onClose(); nav.back(); }}>{t('Discard workout')}</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

export function TimerBar() {
  const timer = useApp((x) => x.timer);
  const { adjustTimer, stopTimer } = useActions();
  const [, setN] = useState(0);
  const buzzed = useRef<number | null>(null);
  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setN((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [timer]);
  useEffect(() => {
    if (!timer) return;
    const left = timer.endsAt - Date.now();
    if (left <= 0 && buzzed.current !== timer.endsAt) {
      buzzed.current = timer.endsAt;
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported */ }
    }
  });
  if (!timer) return null;
  const left = timer.endsAt - Date.now();
  const over = left <= 0;
  if (left < -60000) { setTimeout(stopTimer, 0); return null; }
  const pct = Math.max(0, Math.min(1, left / (timer.total * 1000)));
  return (
    <div className={`timer-bar${over ? ' over' : ''}`} role="timer" aria-live="off">
      <div className="track" style={{ width: `${pct * 100}%` }} />
      <div className="inner">
        <span className="num">{over ? fmtClock(-left) : fmtClock(left + 999)}</span>
        <span className="lbl">{over ? t('Rest done, next set') : t('Rest')}</span>
        {!over && <button onClick={() => adjustTimer(-15)} aria-label={t('Remove 15 seconds')}>−15</button>}
        {!over && <button onClick={() => adjustTimer(15)} aria-label={t('Add 15 seconds')}>+15</button>}
        <button onClick={stopTimer}>{over ? t('Close') : t('Skip')}</button>
      </div>
    </div>
  );
}
