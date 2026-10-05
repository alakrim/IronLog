import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Exercise, ID, Muscle } from '../domain/types';
import { useApp } from './ctx';
import { MUSCLE_LABEL } from './fmt';
import { IconSearch } from './icons';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Confirm({ open, title, body, confirmLabel, danger, onConfirm, onClose }: {
  open: boolean; title: string; body?: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {body && <div className="ink2" style={{ marginBottom: 16 }}>{body}</div>}
      <div className="stack">
        <button className={`btn block ${danger ? 'danger' : 'primary'}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        <button className="btn block ghost" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

/** Large ± stepper with a tappable value for direct entry. */
export function Stepper({ value, display, onCommit, onDec, onInc, placeholder, decimal, label }: {
  value: number; display: string; onCommit: (n: number) => void; onDec: () => void; onInc: () => void;
  placeholder?: string; decimal?: boolean; label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const n = parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) onCommit(n);
    setDraft(null);
  };
  return (
    <div className="stepper">
      <button type="button" aria-label={`Decrease ${label}`} onClick={onDec}>−</button>
      <input
        className="val" aria-label={label} inputMode={decimal ? 'decimal' : 'numeric'}
        value={draft ?? display} placeholder={placeholder}
        onFocus={(e) => { setDraft(display); requestAnimationFrame(() => e.target.select()); }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <button type="button" aria-label={`Increase ${label}`} onClick={onInc}>+</button>
      <span hidden>{value}</span>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function SettingRow({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="list-item" style={{ flexWrap: 'wrap' }}>
      <div className="grow">
        <div>{title}</div>
        {hint && <div className="tiny muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

const GROUPS: { label: string; muscles: Muscle[] }[] = [
  { label: 'Chest', muscles: ['chest'] },
  { label: 'Back', muscles: ['back', 'lats', 'traps'] },
  { label: 'Shoulders', muscles: ['shoulders', 'rear_delts'] },
  { label: 'Legs', muscles: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'] },
  { label: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { label: 'Core', muscles: ['abs', 'lower_back'] },
];
export const MUSCLE_GROUPS = GROUPS;

export function ExerciseList({ onPick, filter, highlight }: { onPick: (e: Exercise) => void; filter?: (e: Exercise) => boolean; highlight?: ID }) {
  const all = useApp((s) => s.exercises);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const list = useMemo(() => {
    const g = GROUPS.find((x) => x.label === group);
    const qq = q.trim().toLowerCase();
    return all.filter((e) => e.active && (!filter || filter(e)) && (!g || g.muscles.includes(e.primary)) &&
      (!qq || e.name.toLowerCase().includes(qq) || MUSCLE_LABEL[e.primary].toLowerCase().includes(qq) || e.equipment.includes(qq)));
  }, [all, q, group, filter]);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="row" style={{ background: 'var(--deck)', borderRadius: 12, padding: '0 12px', border: '1px solid var(--line)' }}>
        <IconSearch width={20} className="muted" />
        <input ref={ref} className="input" style={{ border: 0, padding: '10px 0', background: 'none' }} placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" />
      </div>
      <div className="chips" style={{ margin: '10px 0 12px' }}>
        {GROUPS.map((g) => (
          <button key={g.label} className="chip" aria-pressed={group === g.label} onClick={() => setGroup(group === g.label ? null : g.label)}>{g.label}</button>
        ))}
      </div>
      <div className="list">
        {list.map((e) => (
          <button key={e.id} className="list-item" onClick={() => onPick(e)} style={e.id === highlight ? { background: 'var(--tint-yellow)' } : undefined}>
            <div className="grow">
              <div className="trunc" style={{ fontWeight: 500 }}>{e.name}</div>
              <div className="tiny muted">{MUSCLE_LABEL[e.primary]}, {e.equipment}{e.isCustom ? ', custom' : ''}</div>
            </div>
          </button>
        ))}
        {list.length === 0 && <div className="empty small">No exercises match. Try another word, or add a custom exercise in the Exercises tab.</div>}
      </div>
    </div>
  );
}

export function ExercisePicker({ open, onClose, onPick, title = 'Add exercise', filter }: {
  open: boolean; onClose: () => void; onPick: (e: Exercise) => void; title?: string; filter?: (e: Exercise) => boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ExerciseList onPick={(e) => { onPick(e); onClose(); }} filter={filter} />
    </Sheet>
  );
}

export function TopBar({ title, sub, onBack, right }: { title: ReactNode; sub?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="topbar">
      {onBack && (
        <button className="icon-btn" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      <div className="grow" style={{ paddingLeft: onBack ? 0 : 4 }}>
        <h1 className="trunc">{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
