import { useMemo, useState } from 'react';
import { workoutVolume } from '../../domain/analytics';
import { e1rm } from '../../domain/e1rm';
import { toDisplay } from '../../domain/loads';
import { useActions, useApp, useW } from '../ctx';
import { useNav } from '../nav';
import { Confirm, TopBar } from '../components';
import { doneSets, fmtBig, fmtDate, fmtDuration, PR_TEXT } from '../fmt';
import { IconChevron, IconTrophy } from '../icons';
import { EntryCard } from './Workout';

export function History() {
  const workouts = useApp((s) => s.workouts);
  const prs = useApp((s) => s.prs);
  const unit = useApp((s) => s.profile.unit);
  const nav = useNav();
  const list = useMemo(() => workouts.filter((w) => w.status === 'completed' && !w.deleted).sort((a, b) => b.startedAt - a.startedAt), [workouts]);
  const groups = useMemo(() => {
    const g = new Map<string, typeof list>();
    for (const w of list) {
      const k = fmtDate(w.startedAt, { month: 'long', year: 'numeric' });
      g.set(k, [...(g.get(k) ?? []), w]);
    }
    return [...g.entries()];
  }, [list]);
  // Count exercises that set a record (not every record type), so the badge stays meaningful.
  const prCount = (id: string) => new Set(prs.filter((p) => p.workoutId === id && p.type !== 'volume').map((p) => p.exerciseId)).size;

  return (
    <div className="screen">
      <TopBar title="History" sub={`${list.length} workout${list.length === 1 ? '' : 's'}`} />
      {list.length === 0 && (
        <div className="empty"><h3>No workouts yet</h3><p>Finished workouts appear here with every set you logged.</p>
          <button className="btn primary" onClick={() => nav.setTab('home')}>Start a workout</button></div>
      )}
      {groups.map(([month, ws]) => (
        <div key={month}>
          <div className="section-h">{month}</div>
          <div className="list">
            {ws.map((w) => (
              <button key={w.id} className="list-item" onClick={() => nav.push({ name: 'workoutDetail', id: w.id })}>
                <div style={{ width: 44, textAlign: 'center' }}>
                  <div className="num" style={{ fontSize: 24, lineHeight: 1 }}>{new Date(w.startedAt).getDate()}</div>
                  <div className="tiny muted">{fmtDate(w.startedAt, { weekday: 'short' })}</div>
                </div>
                <div className="grow">
                  <div style={{ fontWeight: 600 }} className="trunc">{w.name}{w.isDeload ? ' (deload)' : ''}{w.isHeavy ? ' (heavy)' : ''}</div>
                  <div className="tiny muted">
                    {w.finishedAt ? fmtDuration(w.finishedAt - w.startedAt) : ''}, {doneSets(w)} sets, {fmtBig(toDisplay(workoutVolume(w), unit))} {unit}
                  </div>
                </div>
                {prCount(w.id) > 0 && <span className="badge pr"><IconTrophy width={14} /> {prCount(w.id)}</span>}
                <IconChevron width={18} className="muted" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkoutDetail({ id, finished }: { id: string; finished?: boolean }) {
  const s = useActions();
  const nav = useNav();
  const w = useW();
  const workout = s.workouts.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [del, setDel] = useState(false);
  const completed = useMemo(() => s.workouts.filter((x) => x.status === 'completed' && !x.deleted && x.id !== id), [s.workouts, id]);
  if (!workout || workout.deleted) return <div className="screen"><TopBar title="Workout" onBack={nav.back} /><div className="empty"><h3>This workout was deleted</h3></div></div>;
  const prs = s.prs.filter((p) => p.workoutId === id);
  const exName = (eid: string) => s.exercises.find((e) => e.id === eid)?.name ?? 'Deleted exercise';

  return (
    <div className="screen">
      <TopBar title={workout.name} sub={fmtDate(workout.startedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        onBack={nav.back}
        right={<button className="btn small" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>} />

      {finished && (
        <div className="note green" style={{ marginBottom: 12 }}>
          <b>Workout saved.</b> {prs.length ? `${prs.length} new record${prs.length > 1 ? 's' : ''} today.` : 'Next session\'s targets are ready.'}
        </div>
      )}
      {prs.length > 0 && (
        <div className="list" style={{ marginBottom: 12 }}>
          {prs.map((p) => (
            <div key={p.id} className="list-item">
              <IconTrophy width={20} style={{ color: 'var(--plate-green)' }} />
              <div className="grow"><div>{exName(p.exerciseId)}</div><div className="tiny muted">{PR_TEXT[p.type]}</div></div>
              <div className="num" style={{ fontSize: 18 }}>
                {p.type === 'volume' || p.type === 'e1rm' ? w(Math.round(p.value * 2) / 2) : `${w(p.weightKg)} × ${p.reps}`}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="num">{workout.finishedAt ? fmtDuration(workout.finishedAt - workout.startedAt) : '—'}</div><div className="muted">duration</div></div>
        <div className="stat"><div className="num">{doneSets(workout)}</div><div className="muted">sets</div></div>
        <div className="stat"><div className="num">{fmtBig(toDisplay(workoutVolume(workout), s.profile.unit))}</div><div className="muted">{s.profile.unit} lifted</div></div>
      </div>
      {workout.notes && <div className="card small ink2" style={{ marginBottom: 12 }}>{workout.notes}</div>}

      {editing ? (
        <>
          <div className="note blue" style={{ marginBottom: 12 }}>Changes save immediately. Records and future suggestions update to match.</div>
          {workout.entries.map((e, i) => <EntryCard key={e.id} workout={workout} entry={e} index={i} currentSetId={null} completed={completed} live={false} />)}
        </>
      ) : (
        workout.entries.filter((e) => e.sets.some((x) => x.done)).map((e) => (
          <div key={e.id} className="card" style={{ marginBottom: 12 }}>
            <button className="row" style={{ border: 0, background: 'none', padding: 0, width: '100%', textAlign: 'left' }} onClick={() => nav.push({ name: 'exercise', id: e.exerciseId })}>
              <b className="grow" style={{ fontFamily: 'Barlow Condensed', fontSize: 20 }}>{exName(e.exerciseId)}</b>
              <IconChevron width={18} className="muted" />
            </button>
            {e.notes && <div className="small ink2">{e.notes}</div>}
            <table className="set-table" style={{ marginTop: 6 }}>
              <tbody>
                {e.sets.filter((x) => x.done).map((x, i) => {
                  const est = e1rm(x.weightKg, x.reps);
                  return (
                    <tr key={x.id}>
                      <td className="muted" style={{ width: 36 }}>{x.kind === 'warmup' ? 'W' : i + 1}</td>
                      <td className="num" style={{ fontSize: 18 }}>{w(x.weightKg)} × {x.reps}</td>
                      <td className="muted small">{x.rir != null ? `RIR ${x.rir}` : ''}</td>
                      <td className="r muted small">{est ? `est. 1RM ${w(Math.round(est * 2) / 2)}` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}

      <button className="btn danger block" style={{ marginTop: 16 }} onClick={() => setDel(true)}>Delete workout</button>
      <Confirm open={del} onClose={() => setDel(false)} danger title="Delete this workout?"
        body="It will be removed from history, charts and records." confirmLabel="Delete workout"
        onConfirm={async () => { await s.deleteWorkout(id); nav.back(); }} />
    </div>
  );
}
