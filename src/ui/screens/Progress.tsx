import { useMemo, useState } from 'react';
import { exerciseFrequency, exerciseSeries, monthlyBuckets, muscleSets, weeklyBuckets, weekStreak } from '../../domain/analytics';
import { toDisplay } from '../../domain/loads';
import { useApp, useW } from '../ctx';
import { useNav } from '../nav';
import { Seg, TopBar } from '../components';
import { BarChart, Sparkline } from '../charts';
import { fmtBig, fmtDate, MUSCLE_LABEL, PR_TEXT, relDay } from '../fmt';

type View = 'sets' | 'volume' | 'workouts' | 'monthly';

export function Progress() {
  const workouts = useApp((s) => s.workouts);
  const exercises = useApp((s) => s.exercises);
  const prs = useApp((s) => s.prs);
  const unit = useApp((s) => s.profile.unit);
  const nav = useNav();
  const w = useW();
  const [view, setView] = useState<View>('sets');
  const now = Date.now();
  const completed = useMemo(() => workouts.filter((x) => x.status === 'completed' && !x.deleted), [workouts]);
  const weeks = useMemo(() => weeklyBuckets(completed, 12, now), [completed, now]);
  const months = useMemo(() => monthlyBuckets(completed, 6, now), [completed, now]);
  const exMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const muscles = useMemo(() => muscleSets(completed, exMap, now - 7 * 86400000), [completed, exMap, now]);
  const lifts = useMemo(() => {
    // Bodyweight lifts are excluded: their est. 1RM would only reflect added load.
    const freq = [...exerciseFrequency(completed).entries()].filter(([id]) => exMap.get(id)?.equipment !== 'bodyweight').sort((a, b) => b[1] - a[1]).slice(0, 6);
    return freq.map(([id]) => {
      const series = exerciseSeries(id, completed).filter((p) => p.bestE1rm != null);
      const recent = series.slice(-10).map((p) => p.bestE1rm!);
      const cutoff = now - 56 * 86400000;
      const before = series.filter((p) => p.date <= cutoff).pop() ?? series[0];
      const last = series[series.length - 1];
      const change = before && last && before !== last ? ((last.bestE1rm! - before.bestE1rm!) / before.bestE1rm!) * 100 : null;
      return { id, name: exMap.get(id)?.name ?? 'Exercise', recent, last: last?.bestE1rm ?? null, change };
    });
  }, [completed, exMap, now]);

  const last30 = completed.filter((x) => x.startedAt > now - 30 * 86400000).length;
  const streak = weekStreak(completed, now);
  const wkLabel = (t: number) => fmtDate(t, { day: 'numeric', month: 'short' });
  const bars = view === 'monthly'
    ? months.map((m, i) => ({ label: new Date(`${m.month}-01T12:00`).toLocaleDateString(undefined, { month: 'short' }), value: Math.round(toDisplay(m.volume, unit)), now: i === months.length - 1 }))
    : weeks.map((b, i) => ({ label: wkLabel(b.weekStart), now: i === weeks.length - 1, value: view === 'sets' ? b.sets : view === 'workouts' ? b.workouts : Math.round(toDisplay(b.volume, unit)) }));
  const maxMuscle = Math.max(20, ...muscles.map((m) => m.sets));

  if (completed.length === 0) {
    return (
      <div className="screen"><TopBar title="Progress" />
        <div className="empty"><h3>Your progress shows up here</h3><p>Finish a workout or two to see volume, consistency, records and strength trends.</p></div></div>
    );
  }

  return (
    <div className="screen">
      <TopBar title="Progress" />
      <div className="stat-row">
        <div className="stat"><div className="num">{last30}</div><div className="muted">workouts, 30 days</div></div>
        <div className="stat"><div className="num">{streak}</div><div className="muted">week streak</div></div>
        <div className="stat"><div className="num">{new Set(prs.filter((p) => p.date > now - 30 * 86400000 && p.type !== 'volume').map((p) => `${p.workoutId}:${p.exerciseId}`)).size}</div><div className="muted">lifts with a record, 30 days</div></div>
      </div>

      <div className="section-h">Training load</div>
      <div className="card">
        <Seg label="Chart" value={view} onChange={setView} options={[
          { value: 'sets', label: 'Sets' }, { value: 'volume', label: 'Volume' }, { value: 'workouts', label: 'Sessions' }, { value: 'monthly', label: 'Monthly' },
        ]} />
        <div style={{ marginTop: 12 }}>
          <BarChart bars={bars} label={`${view} chart`} yFmt={view === 'volume' || view === 'monthly' ? (v) => fmtBig(v) : undefined} />
        </div>
        <div className="tiny muted">
          {view === 'sets' && 'Hard sets per week (warm-ups excluded). The most useful single measure of hypertrophy volume.'}
          {view === 'volume' && `Weight × reps per week, in ${unit}.`}
          {view === 'workouts' && 'Workouts per week. Consistency beats intensity.'}
          {view === 'monthly' && `Weight × reps per month, in ${unit}.`}
        </div>
      </div>

      <div className="section-h">Sets per muscle, last 7 days</div>
      <div className="card">
        {muscles.length === 0 && <div className="small muted">No sets in the last 7 days.</div>}
        {muscles.map((m) => (
          <div key={m.muscle} className="muscle-bar">
            <span className="trunc">{MUSCLE_LABEL[m.muscle]}</span>
            <div className="track"><div className={`fill${m.sets < 6 ? ' low' : m.sets > 20 ? ' high' : ''}`} style={{ width: `${(m.sets / maxMuscle) * 100}%` }} /></div>
            <span className="num" style={{ textAlign: 'right' }}>{m.sets % 1 ? m.sets.toFixed(1) : m.sets}</span>
          </div>
        ))}
        <div className="tiny muted" style={{ marginTop: 8 }}>Secondary muscles count as half a set. Roughly 10–20 hard sets per muscle per week suits most people.</div>
      </div>

      {lifts.length > 0 && (
        <>
          <div className="section-h">Main lifts, estimated 1RM</div>
          <div className="list">
            {lifts.map((l) => (
              <button key={l.id} className="list-item" onClick={() => nav.push({ name: 'exercise', id: l.id })}>
                <div className="grow">
                  <div className="trunc" style={{ fontWeight: 500 }}>{l.name}</div>
                  <div className="tiny" style={{ color: l.change == null ? 'var(--ink-3)' : l.change >= 0 ? 'var(--plate-green)' : 'var(--plate-red)' }}>
                    {l.change == null ? 'Not enough data yet' : `${l.change >= 0 ? '+' : ''}${l.change.toFixed(1)}% over 8 weeks`}
                  </div>
                </div>
                <Sparkline values={l.recent} />
                <div className="num" style={{ fontSize: 18, minWidth: 72, textAlign: 'right' }}>{l.last ? w(Math.round(l.last * 2) / 2) : '—'}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {prs.length > 0 && (
        <>
          <div className="section-h">Recent records</div>
          <div className="list">
            {[...prs].sort((a, b) => b.date - a.date).slice(0, 10).map((p) => (
              <button key={p.id} className="list-item" onClick={() => nav.push({ name: 'exercise', id: p.exerciseId })}>
                <div className="grow"><div className="trunc">{exMap.get(p.exerciseId)?.name}</div><div className="tiny muted">{PR_TEXT[p.type]}, {relDay(p.date)}</div></div>
                <div className="num" style={{ fontSize: 17 }}>{p.type === 'volume' || p.type === 'e1rm' ? w(Math.round(p.value * 2) / 2) : `${w(p.weightKg)} × ${p.reps}`}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
