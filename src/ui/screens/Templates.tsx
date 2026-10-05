import { useState } from 'react';
import type { ProgressionMethod, TemplateItem, WorkoutTemplate } from '../../domain/types';
import { itemFor } from '../../data/seedTemplates';
import { useActions } from '../ctx';
import { useNav } from '../nav';
import { Confirm, ExercisePicker, TopBar } from '../components';
import { IconChevron, IconDown, IconPlus, IconUp, IconX } from '../icons';

export function Templates() {
  const s = useActions();
  const nav = useNav();
  return (
    <div className="screen">
      <TopBar title="Templates" onBack={nav.back} right={<button className="btn small" onClick={() => nav.push({ name: 'template', id: null })}><IconPlus width={18} /> New</button>} />
      {s.templates.length === 0 ? (
        <div className="empty"><h3>No templates</h3><p>Templates hold your exercise list and targets so starting a workout is one tap.</p></div>
      ) : (
        <div className="list">
          {s.templates.map((t) => (
            <button key={t.id} className="list-item" onClick={() => nav.push({ name: 'template', id: t.id })}>
              <div className="grow"><div style={{ fontWeight: 600 }}>{t.name}</div>
                <div className="tiny muted trunc">{t.items.map((i) => s.exercises.find((e) => e.id === i.exerciseId)?.name).filter(Boolean).join(', ') || 'No exercises'}</div></div>
              <IconChevron width={18} className="muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, onChange, min = 1 }: { label: string; value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="tiny muted">{label}</div>
      <div className="stepper" style={{ height: 40 }}>
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span className="val" style={{ display: 'grid', placeItems: 'center', fontSize: 20 }}>{value}</span>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}

export function TemplateEditor({ id }: { id: string | null }) {
  const s = useActions();
  const nav = useNav();
  const existing = id ? s.templates.find((t) => t.id === id) : undefined;
  const [t, setT] = useState<WorkoutTemplate>(() => existing ?? s.newTemplate(''));
  const [picker, setPicker] = useState(false);
  const [del, setDel] = useState(false);
  const setItem = (i: number, patch: Partial<TemplateItem>) => setT({ ...t, items: t.items.map((it, j) => {
    if (j !== i) return it;
    const n = { ...it, ...patch };
    if (patch.repMin != null && n.repMax < n.repMin) n.repMax = n.repMin;
    if (patch.repMax != null && n.repMin > n.repMax) n.repMin = n.repMax;
    return n;
  }) });
  const move = (i: number, d: number) => {
    const items = [...t.items]; const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    setT({ ...t, items });
  };
  const valid = t.name.trim().length > 0;

  return (
    <div className="screen">
      <TopBar title={existing ? 'Edit template' : 'New template'} onBack={nav.back}
        right={<button className="btn small primary" disabled={!valid} onClick={async () => { await s.saveTemplate({ ...t, name: t.name.trim() }); nav.back(); }}>Save</button>} />
      <label className="field"><span>Name</span><input className="input" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="e.g. Upper A" /></label>

      <div className="section-h">Exercises</div>
      {t.items.map((it, i) => {
        const ex = s.exercises.find((e) => e.id === it.exerciseId);
        return (
          <div key={`${it.exerciseId}-${i}`} className="card" style={{ marginBottom: 10 }}>
            <div className="row">
              <b className="grow trunc" style={{ fontFamily: 'Barlow Condensed', fontSize: 20 }}>{ex?.name ?? 'Missing exercise'}</b>
              <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><IconUp /></button>
              <button className="icon-btn" aria-label="Move down" disabled={i === t.items.length - 1} onClick={() => move(i, 1)}><IconDown /></button>
              <button className="icon-btn" aria-label="Remove" onClick={() => setT({ ...t, items: t.items.filter((_, j) => j !== i) })}><IconX /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6 }}>
              <Mini label="Sets" value={it.sets} onChange={(n) => setItem(i, { sets: n })} />
              <Mini label="Min reps" value={it.repMin} onChange={(n) => setItem(i, { repMin: n })} />
              <Mini label="Max reps" value={it.repMax} onChange={(n) => setItem(i, { repMax: n })} />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <select className="input" aria-label="Progression" value={it.method} onChange={(e) => setItem(i, { method: e.target.value as ProgressionMethod })}>
                <option value="double">Double progression</option>
                <option value="linear">Linear (fixed reps)</option>
                <option value="top_backoff">Top set + back-offs</option>
                <option value="none">No auto progression</option>
              </select>
              <select className="input" aria-label="Target RIR" style={{ width: 120 }} value={it.targetRir ?? ''} onChange={(e) => setItem(i, { targetRir: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">No RIR</option>{[0, 1, 2, 3].map((r) => <option key={r} value={r}>RIR {r}</option>)}
              </select>
            </div>
          </div>
        );
      })}
      <button className="btn block" onClick={() => setPicker(true)}><IconPlus width={20} /> Add exercise</button>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(e) => setT({ ...t, items: [...t.items, itemFor(e)] })} />

      {existing && <button className="btn danger block" style={{ marginTop: 24 }} onClick={() => setDel(true)}>Delete template</button>}
      <Confirm open={del} onClose={() => setDel(false)} danger title={`Delete ${t.name}?`} body="Past workouts made from it stay in your history." confirmLabel="Delete template"
        onConfirm={async () => { await s.deleteTemplate(t.id); nav.back(); }} />
    </div>
  );
}
