import { useMemo, useState } from 'react';
import { weeklyBuckets, weekStreak } from '../../domain/analytics';
import { deloadAdvice, heavyDue, programStatus } from '../../domain/periodization';
import type { WorkoutTemplate } from '../../domain/types';
import { useActions, useW } from '../ctx';
import { useNav } from '../nav';
import { Sheet, Switch } from '../components';
import { doneSets, fmtClock, fmtDate, PR_TEXT, relDay } from '../fmt';
import { IconChevron, IconTrophy } from '../icons';

export function Home() {
  const s = useActions();
  const nav = useNav();
  const w = useW();
  const now = Date.now();
  const { profile, templates, workouts, program, prs, exercises, deloadDismissedAt } = s;
  const active = workouts.find((x) => x.status === 'active' && !x.deleted);
  const completed = useMemo(() => workouts.filter((x) => x.status === 'completed' && !x.deleted).sort((a, b) => b.startedAt - a.startedAt), [workouts]);
  const status = program ? programStatus(program, now) : null;
  const deload = deloadAdvice(completed, profile.settings, !!status, now, deloadDismissedAt);
  const heavy = heavyDue(completed, profile.settings, status?.block.type ?? null, now);
  const [other, setOther] = useState(false);
  const [opts, setOpts] = useState({ heavy: false, deload: false });

  const nextTpl: WorkoutTemplate | undefined = useMemo(() => {
    if (!templates.length) return undefined;
    const last = completed.find((x) => x.templateId && templates.some((t) => t.id === x.templateId));
    if (!last) return templates[0];
    const i = templates.findIndex((t) => t.id === last.templateId);
    return templates[(i + 1) % templates.length];
  }, [templates, completed]);

  const start = async (o: { templateId?: string | null; repeatWorkoutId?: string; name?: string; heavy?: boolean; deload?: boolean }) => {
    const id = await s.startWorkout(o);
    nav.push({ name: 'workout', id });
  };

  const week = weeklyBuckets(completed, 1, now)[0];
  const streak = weekStreak(completed, now);
  const exName = (id: string) => exercises.find((e) => e.id === id)?.name ?? 'Exercise';
  const recentPRs = [...prs].filter((p) => p.type !== 'volume').sort((a, b) => b.date - a.date).slice(0, 4);

  return (
    <div className="screen">
      <div className="big-title">{fmtDate(now, { weekday: 'long' })}</div>
      <div className="muted" style={{ marginBottom: 16 }}>
        {profile.name ? `${profile.name}, ` : ''}{fmtDate(now, { day: 'numeric', month: 'long' })}
      </div>

      {active ? (
        <div className="next-up">
          <div className="plate-mark" />
          <div className="label">In progress, started {fmtClock(now - active.startedAt)} ago</div>
          <h2>{active.name}</h2>
          <div className="lifts">{doneSets(active)} sets logged</div>
          <button className="btn primary" onClick={() => nav.push({ name: 'workout', id: active.id })}>Resume workout</button>
        </div>
      ) : (
        <div className="next-up">
          <div className="plate-mark" />
          <div className="label">{status ? `${status.block.name}, week ${Math.min(status.week, status.block.weeks)} of ${status.block.weeks}` : 'Next up'}</div>
          <h2>{nextTpl?.name ?? 'Empty workout'}</h2>
          <div className="lifts">{nextTpl ? nextTpl.items.slice(0, 5).map((i) => exName(i.exerciseId)).join(', ') : 'Add exercises as you go.'}</div>
          <div className="row">
            <button className="btn primary" onClick={() => start({ templateId: nextTpl?.id ?? null, deload: status?.block.type === 'deload' })}>Start workout</button>
            <button className="btn" style={{ background: 'color-mix(in srgb, var(--on-hero) 14%, transparent)', color: 'var(--on-hero)' }} onClick={() => setOther(true)}>Other</button>
          </div>
        </div>
      )}

      {status?.complete && (
        <div className="note yellow" style={{ marginTop: 12 }}>
          <b>{status.block.name} is complete.</b> Next is {status.next.name}{status.next.type !== 'deload' ? ` (${status.next.repMin}–${status.next.repMax} reps)` : ''}.
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small primary" onClick={() => s.advanceBlock()}>Start {status.next.name}</button>
            <button className="btn small ghost" onClick={() => nav.push({ name: 'program' })}>View cycle</button>
          </div>
        </div>
      )}
      {!active && deload.recommend && (
        <div className="note red" style={{ marginTop: 12 }}>
          <b>A deload is recommended.</b> {deload.reasons.join(' ')}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small" onClick={() => start({ templateId: nextTpl?.id ?? null, deload: true })}>Start a deload workout</button>
            <button className="btn small ghost" onClick={() => s.dismissDeload()}>Not now</button>
          </div>
        </div>
      )}
      {!active && heavy && !deload.recommend && (
        <div className="note blue" style={{ marginTop: 12 }}>
          <b>Heavy day due.</b> It's been {profile.settings.heavyEveryWeeks}+ weeks since your last heavy session. Compound lifts become 4 × 4–6.
          <div style={{ marginTop: 10 }}>
            <button className="btn small" onClick={() => start({ templateId: nextTpl?.id ?? null, heavy: true })}>Start {nextTpl?.name ?? 'workout'} as a heavy day</button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 24, marginBottom: 8 }}>
        <div className="section-h grow" style={{ margin: 0 }}>Templates</div>
        <button className="btn small ghost" onClick={() => nav.push({ name: 'templates' })}>Edit</button>
      </div>
      <div className="tpl-scroll">
        {templates.map((t) => (
          <button key={t.id} className="tpl-pill" disabled={!!active} onClick={() => start({ templateId: t.id })}>
            <b>{t.name}</b><span className="tiny muted">{t.items.length} exercises</span>
          </button>
        ))}
        <button className="tpl-pill" onClick={() => nav.push({ name: 'template', id: null })}><b>New</b><span className="tiny muted">template</span></button>
      </div>

      <div className="section-h">This week</div>
      <div className="stat-row">
        <div className="stat"><div className="num">{week?.workouts ?? 0}</div><div className="muted">workouts</div></div>
        <div className="stat"><div className="num">{week?.sets ?? 0}</div><div className="muted">hard sets</div></div>
        <div className="stat"><div className="num">{streak}</div><div className="muted">week streak</div></div>
      </div>

      {recentPRs.length > 0 && (
        <>
          <div className="section-h">Recent records</div>
          <div className="list">
            {recentPRs.map((p) => (
              <button key={p.id} className="list-item" onClick={() => nav.push({ name: 'exercise', id: p.exerciseId })}>
                <IconTrophy width={20} style={{ color: 'var(--plate-green)' }} />
                <div className="grow">
                  <div className="trunc">{exName(p.exerciseId)}</div>
                  <div className="tiny muted">{PR_TEXT[p.type]}, {relDay(p.date)}</div>
                </div>
                <div className="num" style={{ fontSize: 18 }}>{p.type === 'e1rm' ? w(Math.round(p.value * 2) / 2) : `${w(p.weightKg)} × ${p.reps}`}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {completed.length > 0 && (
        <>
          <div className="section-h">Last workout</div>
          <button className="list-item card" style={{ borderTop: 0 }} onClick={() => nav.push({ name: 'workoutDetail', id: completed[0].id })}>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{completed[0].name}</div>
              <div className="tiny muted">{relDay(completed[0].startedAt)}, {doneSets(completed[0])} sets</div>
            </div>
            <IconChevron width={20} className="muted" />
          </button>
        </>
      )}

      <Sheet open={other} onClose={() => setOther(false)} title="Start a workout">
        <div className="list" style={{ marginBottom: 12 }}>
          {templates.map((t) => (
            <button key={t.id} className="list-item" onClick={() => { setOther(false); start({ templateId: t.id, ...opts }); }}>
              <div className="grow"><b>{t.name}</b><div className="tiny muted">{t.items.length} exercises</div></div>
            </button>
          ))}
          {completed[0] && (
            <button className="list-item" onClick={() => { setOther(false); start({ repeatWorkoutId: completed[0].id, ...opts }); }}>
              <div className="grow"><b>Repeat last workout</b><div className="tiny muted">{completed[0].name}, {relDay(completed[0].startedAt)}</div></div>
            </button>
          )}
          <button className="list-item" onClick={() => { setOther(false); start({ name: 'Workout', ...opts }); }}>
            <div className="grow"><b>Empty workout</b><div className="tiny muted">Add exercises as you go</div></div>
          </button>
        </div>
        <div className="list">
          <div className="list-item">
            <div className="grow">Heavy day<div className="tiny muted">Compound lifts become 4 × 4–6 at RIR 2</div></div>
            <Switch label="Heavy day" checked={opts.heavy} onChange={(v) => setOpts({ heavy: v, deload: v ? false : opts.deload })} />
          </div>
          <div className="list-item">
            <div className="grow">Deload<div className="tiny muted">Half the sets, about 90% load</div></div>
            <Switch label="Deload" checked={opts.deload} onChange={(v) => setOpts({ deload: v, heavy: v ? false : opts.heavy })} />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
