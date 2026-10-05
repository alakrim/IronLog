import { useState } from 'react';
import type { ProgressionMethod, TemplateItem, WorkoutTemplate } from '../../domain/types';
import { itemFor } from '../../data/seedTemplates';
import { exName, t } from '../../i18n';
import { useActions } from '../ctx';
import { useNav } from '../nav';
import { Confirm, ExercisePicker, TopBar } from '../components';
import { IconChevron, IconDown, IconPlus, IconUp, IconX } from '../icons';

export function Templates() {
  const s = useActions();
  const nav = useNav();
  return (
    <div className="screen">
      <TopBar title={t('Templates')} onBack={nav.back} right={<button className="btn small" onClick={() => nav.push({ name: 'template', id: null })}><IconPlus width={18} /> {t('New')}</button>} />
      {s.templates.length === 0 ? (
        <div className="empty"><h3>{t('No templates')}</h3><p>{t('Templates hold your exercise list and targets so starting a workout is one tap.')}</p></div>
      ) : (
        <div className="list">
          {s.templates.map((tp) => (
            <button key={tp.id} className="list-item" onClick={() => nav.push({ name: 'template', id: tp.id })}>
              <div className="grow"><div style={{ fontWeight: 600 }}>{tp.name}</div>
                <div className="tiny muted trunc">{tp.items.map((i) => { const e = s.exercises.find((x) => x.id === i.exerciseId); return e ? exName(e) : null; }).filter(Boolean).join(', ') || t('No exercises')}</div></div>
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
        <button type="button" aria-label={t('Decrease {label}', { label })} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span className="val" style={{ display: 'grid', placeItems: 'center', fontSize: 20 }}>{value}</span>
        <button type="button" aria-label={t('Increase {label}', { label })} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}

export function TemplateEditor({ id }: { id: string | null }) {
  const s = useActions();
  const nav = useNav();
  const existing = id ? s.templates.find((x) => x.id === id) : undefined;
  const [tpl, setTpl] = useState<WorkoutTemplate>(() => existing ?? s.newTemplate(''));
  const [picker, setPicker] = useState(false);
  const [del, setDel] = useState(false);
  const setItem = (i: number, patch: Partial<TemplateItem>) => setTpl({ ...tpl, items: tpl.items.map((it, j) => {
    if (j !== i) return it;
    const n = { ...it, ...patch };
    if (patch.repMin != null && n.repMax < n.repMin) n.repMax = n.repMin;
    if (patch.repMax != null && n.repMin > n.repMax) n.repMin = n.repMax;
    return n;
  }) });
  const move = (i: number, d: number) => {
    const items = [...tpl.items]; const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    setTpl({ ...tpl, items });
  };
  const valid = tpl.name.trim().length > 0;

  return (
    <div className="screen">
      <TopBar title={existing ? t('Edit template') : t('New template')} onBack={nav.back}
        right={<button className="btn small primary" disabled={!valid} onClick={async () => { await s.saveTemplate({ ...tpl, name: tpl.name.trim() }); nav.back(); }}>{t('Save')}</button>} />
      <label className="field"><span>{t('Name')}</span><input className="input" value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} placeholder={t('e.g. Upper A')} /></label>

      <div className="section-h">{t('Exercises')}</div>
      {tpl.items.map((it, i) => {
        const ex = s.exercises.find((e) => e.id === it.exerciseId);
        return (
          <div key={`${it.exerciseId}-${i}`} className="card" style={{ marginBottom: 10 }}>
            <div className="row">
              <b className="grow trunc" style={{ fontFamily: 'Barlow Condensed', fontSize: 20 }}>{ex ? exName(ex) : t('Missing exercise')}</b>
              <button className="icon-btn" aria-label={t('Move up')} disabled={i === 0} onClick={() => move(i, -1)}><IconUp /></button>
              <button className="icon-btn" aria-label={t('Move down')} disabled={i === tpl.items.length - 1} onClick={() => move(i, 1)}><IconDown /></button>
              <button className="icon-btn" aria-label={t('Remove')} onClick={() => setTpl({ ...tpl, items: tpl.items.filter((_, j) => j !== i) })}><IconX /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6 }}>
              <Mini label={t('Sets')} value={it.sets} onChange={(n) => setItem(i, { sets: n })} />
              <Mini label={t('Min reps')} value={it.repMin} onChange={(n) => setItem(i, { repMin: n })} />
              <Mini label={t('Max reps')} value={it.repMax} onChange={(n) => setItem(i, { repMax: n })} />
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <select className="input" aria-label={t('Progression')} value={it.method} onChange={(e) => setItem(i, { method: e.target.value as ProgressionMethod })}>
                <option value="double">{t('Double progression')}</option>
                <option value="linear">{t('Linear (fixed reps)')}</option>
                <option value="top_backoff">{t('Top set + back-offs')}</option>
                <option value="none">{t('No auto progression')}</option>
              </select>
              <select className="input" aria-label={t('Target RIR')} style={{ width: 120 }} value={it.targetRir ?? ''} onChange={(e) => setItem(i, { targetRir: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">{t('No RIR')}</option>{[0, 1, 2, 3].map((r) => <option key={r} value={r}>RIR {r}</option>)}
              </select>
            </div>
          </div>
        );
      })}
      <button className="btn block" onClick={() => setPicker(true)}><IconPlus width={20} /> {t('Add exercise')}</button>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(e) => setTpl({ ...tpl, items: [...tpl.items, itemFor(e)] })} />

      {existing && <button className="btn danger block" style={{ marginTop: 24 }} onClick={() => setDel(true)}>{t('Delete template')}</button>}
      <Confirm open={del} onClose={() => setDel(false)} danger title={t('Delete {name}?', { name: tpl.name })} body={t('Past workouts made from it stay in your history.')} confirmLabel={t('Delete template')}
        onConfirm={async () => { await s.deleteTemplate(tpl.id); nav.back(); }} />
    </div>
  );
}
