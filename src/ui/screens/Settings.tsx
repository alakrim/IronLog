import { useRef, useState } from 'react';
import { E1RM_MAX_REPS } from '../../domain/e1rm';
import { achievableLoads, fmtLoad, fromDisplay, toDisplay } from '../../domain/loads';
import { defaultBlocks, DECLINE_EXERCISES, DECLINE_SESSIONS, HARD_SESSION_STREAK, programStatus } from '../../domain/periodization';
import { HEAVY_TARGET, TRANSITION_CAP } from '../../domain/progression';
import type { Block, EquipmentProfile } from '../../domain/types';
import { getLang, LANGS, t, tn } from '../../i18n';
import { useActions, useApp } from '../ctx';
import { useNav } from '../nav';
import { Confirm, Seg, SettingRow, Sheet, Switch, TopBar } from '../components';
import { fmtDate } from '../fmt';
import { IconChevron } from '../icons';

export type Theme = 'system' | 'light' | 'dark';
export function readTheme(): Theme {
  try { return (localStorage.getItem('ironlog.theme') as Theme) || 'system'; } catch { return 'system'; }
}
export function applyTheme(th: Theme) {
  if (th === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', th);
  try { localStorage.setItem('ironlog.theme', th); } catch { /* per-device only */ }
}

export function Settings() {
  const s = useActions();
  const nav = useNav();
  const st = s.profile.settings;
  const [theme, setTheme] = useState<Theme>(readTheme());
  const [unitAsk, setUnitAsk] = useState<null | 'kg' | 'lb'>(null);
  const [reset, setReset] = useState(false);
  const [backup, setBackup] = useState(false);
  const status = s.program ? programStatus(s.program, Date.now()) : null;
  const up = (fn: (x: typeof st) => typeof st) => s.updateSettings(fn);

  return (
    <div className="screen">
      <TopBar title={t('Settings')} />
      {!s.persistent && <div className="note red" style={{ marginBottom: 12 }}><b>{t('Storage unavailable.')}</b> {t('This browser is blocking local storage, so data will be lost when you close the app. Export a backup before leaving.')}</div>}

      <div className="section-h">{t('You')}</div>
      <div className="list">
        <SettingRow title={t('Name')}><input className="input" style={{ width: 160 }} value={s.profile.name} onChange={(e) => s.updateProfile({ name: e.target.value })} placeholder={t('Optional')} aria-label={t('Name')} /></SettingRow>
        <SettingRow title={t('Language')}><div style={{ width: 200 }}><Seg label={t('Language')} value={getLang()} onChange={(l) => s.setLanguage(l)} options={LANGS} /></div></SettingRow>
        <SettingRow title={t('Units')}><div style={{ width: 140 }}><Seg label={t('Units')} value={s.profile.unit} onChange={(u) => u !== s.profile.unit && setUnitAsk(u)} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} /></div></SettingRow>
        <SettingRow title={t('Appearance')}><div style={{ width: 200 }}><Seg label={t('Theme')} value={theme} onChange={(th) => { setTheme(th); applyTheme(th); }} options={[{ value: 'system', label: t('Auto') }, { value: 'light', label: t('Light') }, { value: 'dark', label: t('Dark') }]} /></div></SettingRow>
      </div>

      <div className="section-h">{t('Training')}</div>
      <div className="list">
        <button className="list-item" onClick={() => nav.push({ name: 'program' })}>
          <div className="grow">{t('Training cycle')}<div className="tiny muted">{status ? t('{block}, week {week} of {weeks}', { block: status.block.name, week: Math.min(status.week, status.block.weeks), weeks: status.block.weeks }) : t('Off')}</div></div>
          <IconChevron width={18} className="muted" />
        </button>
        <button className="list-item" onClick={() => nav.push({ name: 'templates' })}><div className="grow">{t('Templates')}<div className="tiny muted">{t('{n} saved', { n: s.templates.length })}</div></div><IconChevron width={18} className="muted" /></button>
        <button className="list-item" onClick={() => nav.push({ name: 'equipment' })}><div className="grow">{t('Plates and equipment')}<div className="tiny muted">{t('Used to round every suggested weight')}</div></div><IconChevron width={18} className="muted" /></button>
        <SettingRow title={t('Default rest')}>
          <div style={{ width: 210 }}><Seg label={t('Rest')} value={st.restSec} onChange={(v) => up((x) => ({ ...x, restSec: v }))} options={[60, 90, 120, 180].map((v) => ({ value: v, label: v < 120 ? `${v}s` : `${v / 60}m` }))} /></div>
        </SettingRow>
        <SettingRow title={t('Start rest timer when a set is ticked')}><Switch label={t('Auto rest timer')} checked={st.autoStartTimer} onChange={(v) => up((x) => ({ ...x, autoStartTimer: v }))} /></SettingRow>
        <SettingRow title={t('Ask reps in reserve')} hint={t('Optional one-tap rating after each set')}><Switch label={t('Ask RIR')} checked={st.askRir} onChange={(v) => up((x) => ({ ...x, askRir: v }))} /></SettingRow>
      </div>

      <div className="section-h">{t('Progression rules')}</div>
      <div className="list">
        <SettingRow title={t('Effort needed to add weight')} hint={t('Average reps in reserve when you hit the top of the range. Sets without RIR are ignored.')}>
          <div style={{ width: 200 }}><Seg label={t('Minimum RIR')} value={st.progression.minRirToProgress ?? -1} onChange={(v) => up((x) => ({ ...x, progression: { ...x.progression, minRirToProgress: v < 0 ? null : v } }))}
            options={[{ value: -1, label: t('Any') }, { value: 1, label: '1+' }, { value: 2, label: '2+' }]} /></div>
        </SettingRow>
        <SettingRow title={t('Reduce weight after')} hint={t('Sessions in a row below the bottom of the rep range')}>
          <div style={{ width: 160 }}><Seg label={t('Failures')} value={st.progression.failuresBeforeReduce} onChange={(v) => up((x) => ({ ...x, progression: { ...x.progression, failuresBeforeReduce: v } }))}
            options={[2, 3, 4].map((v) => ({ value: v, label: String(v) }))} /></div>
        </SettingRow>
        <SettingRow title={t('Deload reminder')} hint={status ? t('Your training cycle schedules deloads') : t('Weeks between planned deloads')}>
          <div style={{ width: 200 }}><Seg label={t('Deload weeks')} value={st.deloadEveryWeeks} onChange={(v) => up((x) => ({ ...x, deloadEveryWeeks: v }))}
            options={[{ value: 0, label: t('Off') }, { value: 6, label: '6' }, { value: 8, label: '8' }, { value: 10, label: '10' }]} /></div>
        </SettingRow>
        <SettingRow title={t('Heavy day reminder')} hint={t('Weeks between heavier 4 × 4–6 sessions')}>
          <div style={{ width: 200 }}><Seg label={t('Heavy weeks')} value={st.heavyEveryWeeks} onChange={(v) => up((x) => ({ ...x, heavyEveryWeeks: v }))}
            options={[{ value: 0, label: t('Off') }, { value: 3, label: '3' }, { value: 4, label: '4' }, { value: 6, label: '6' }]} /></div>
        </SettingRow>
        <button className="list-item" onClick={() => nav.push({ name: 'rules' })}><div className="grow">{t('How suggestions are calculated')}</div><IconChevron width={18} className="muted" /></button>
      </div>

      <div className="section-h">{t('Your data')}</div>
      <div className="list">
        <button className="list-item" onClick={() => setBackup(true)}><div className="grow">{t('Backup and restore')}<div className="tiny muted">{t('Everything stays on this phone. Export a file to keep a copy.')}</div></div><IconChevron width={18} className="muted" /></button>
        <button className="list-item" style={{ color: 'var(--plate-red)' }} onClick={() => setReset(true)}>{t('Erase all data')}</button>
      </div>
      <p className="tiny muted" style={{ textAlign: 'center', marginTop: 24 }}>{t('IronLog 0.1. Works offline. No account, no tracking, no AI.')}</p>

      <BackupSheet open={backup} onClose={() => setBackup(false)} />
      <Confirm open={unitAsk != null} onClose={() => setUnitAsk(null)} title={t('Switch to {unit}?', { unit: unitAsk ?? '' })}
        body={t('Your history is converted automatically. Your plate and dumbbell list will be reset to standard {unit} equipment; you can edit it afterwards.', { unit: unitAsk ?? '' })}
        confirmLabel={t('Use {unit}', { unit: unitAsk ?? '' })} onConfirm={() => unitAsk && s.setUnit(unitAsk, true)} />
      <Confirm open={reset} onClose={() => setReset(false)} danger title={t('Erase all data?')} body={t('Every workout, template and setting on this phone will be deleted. Export a backup first if you might want it back.')}
        confirmLabel={t('Erase everything')} onConfirm={() => s.resetAll()} />
    </div>
  );
}

function BackupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useActions();
  const nav = useNav();
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const exportFile = () => {
    const json = s.exportData();
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `ironlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      nav.toast(t('Saving backup file. If nothing downloads, use Copy instead.'));
    } catch { setErr(t('Download is blocked here. Use Copy instead.')); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(s.exportData()); nav.toast(t('Backup copied to clipboard')); }
    catch { setErr(t('Clipboard is blocked here. Use Save backup file instead.')); }
  };
  const importFile = async (f: File) => {
    setErr(null);
    try { await s.importData(await f.text()); nav.toast(t('Backup restored')); onClose(); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('Backup and restore')}>
      <p className="small ink2" style={{ marginTop: 0 }}>{t('A backup is a single file with every workout, template, exercise and setting.')}</p>
      <div className="stack">
        <button className="btn primary block" onClick={exportFile}>{t('Save backup file')}</button>
        <button className="btn block" onClick={copy}>{t('Copy backup to clipboard')}</button>
        <button className="btn block" onClick={() => file.current?.click()}>{t('Restore from file')}</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
      </div>
      <p className="tiny muted">{t('Restoring replaces everything currently on this phone.')}</p>
      {err && <div className="note red">{err}</div>}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

const PLATE_OPTIONS = { kg: [0.25, 0.5, 1, 1.25, 2, 2.5, 5, 10, 15, 20, 25], lb: [1.25, 2.5, 5, 10, 15, 25, 35, 45, 55] };

export function EquipmentScreen() {
  const s = useActions();
  const nav = useNav();
  const unit = s.profile.unit;
  const eq = s.profile.settings.equipment;
  const save = (patch: Partial<EquipmentProfile>) => s.updateSettings((x) => ({ ...x, equipment: { ...x.equipment, ...patch } }));
  const d = (kg: number) => Math.round(toDisplay(kg, unit) * 100) / 100;
  const k = (v: number) => Math.round(fromDisplay(v, unit) * 1e6) / 1e6;
  const hasPlate = (p: number) => eq.platesKg.some((x) => Math.abs(d(x) - p) < 0.01);
  const db = eq.dumbbellsKg.map(d);
  const [dbFrom, setFrom] = useState(String(db[0] ?? (unit === 'kg' ? 2.5 : 5)));
  const [dbTo, setTo] = useState(String(db[db.length - 1] ?? (unit === 'kg' ? 50 : 100)));
  const [dbStep, setStep] = useState(String(db.length > 1 ? Math.round((db[1] - db[0]) * 100) / 100 : unit === 'kg' ? 2.5 : 5));
  const bar = achievableLoads('barbell', eq);
  const smallest = bar.length > 1 ? bar[1] - bar[0] : 0;
  const num = (v: string) => parseFloat(v.replace(',', '.'));

  return (
    <div className="screen">
      <TopBar title={t('Plates and equipment')} onBack={nav.back} />
      <p className="small ink2" style={{ marginTop: 0 }}>{t('Suggested weights are rounded to loads you can actually set up with this equipment.')}</p>

      <div className="section-h">{t('Barbell')}</div>
      <div className="card stack">
        <label className="field"><span>{t('Bar weight ({unit})', { unit })}</span>
          <input className="input" inputMode="decimal" defaultValue={d(eq.barKg)} onBlur={(e) => { const v = num(e.target.value); if (v >= 0) save({ barKg: k(v) }); }} /></label>
        <div className="field"><span>{t('Plates available (per side)')}</span>
          <div className="chips">{PLATE_OPTIONS[unit].map((p) => (
            <button key={p} className="chip" aria-pressed={hasPlate(p)} onClick={() => save({ platesKg: hasPlate(p) ? eq.platesKg.filter((x) => Math.abs(d(x) - p) >= 0.01) : [...eq.platesKg, k(p)].sort((a, b) => b - a) })}>{p}</button>
          ))}</div></div>
        <div className="note blue">{t('Smallest barbell jump:')} <b>{fmtLoad(smallest, unit)} {unit}</b>{eq.platesKg.length === 0 ? `. ${t('Add at least one plate.')}` : ''}</div>
      </div>

      <div className="section-h">{t('Dumbbells (per hand)')}</div>
      <div className="card stack">
        <div className="row">
          <label className="field grow"><span>{t('From')}</span><input className="input" inputMode="decimal" value={dbFrom} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field grow"><span>{t('To')}</span><input className="input" inputMode="decimal" value={dbTo} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="field grow"><span>{t('Step')}</span><input className="input" inputMode="decimal" value={dbStep} onChange={(e) => setStep(e.target.value)} /></label>
        </div>
        <button className="btn block" onClick={() => {
          const from = num(dbFrom), to = num(dbTo), step = num(dbStep);
          if (!(from > 0 && to >= from && step > 0) || (to - from) / step > 200) { nav.toast(t('Check the dumbbell range')); return; }
          const out: number[] = []; for (let v = from; v <= to + 1e-9; v += step) out.push(k(Math.round(v * 100) / 100));
          save({ dumbbellsKg: out }); nav.toast(tn(out.length, '{n} dumbbell saved', '{n} dumbbells saved'));
        }}>{t('Set dumbbell range')}</button>
        <div className="tiny muted">{t('Currently:')} {db.slice(0, 12).join(', ')}{db.length > 12 ? ` … ${db[db.length - 1]}` : ''}</div>
      </div>

      <div className="section-h">{t('Machines and cables')}</div>
      <div className="card stack">
        <div className="row">
          <label className="field grow"><span>{t('Machine stack step ({unit})', { unit })}</span>
            <input className="input" inputMode="decimal" defaultValue={d(eq.machineStepKg)} onBlur={(e) => { const v = num(e.target.value); if (v > 0) save({ machineStepKg: k(v) }); }} /></label>
          <label className="field grow"><span>{t('Cable stack step ({unit})', { unit })}</span>
            <input className="input" inputMode="decimal" defaultValue={d(eq.cableStepKg)} onBlur={(e) => { const v = num(e.target.value); if (v > 0) save({ cableStepKg: k(v) }); }} /></label>
        </div>
      </div>

      <div className="section-h">{t('Largest automatic jump')}</div>
      <div className="card">
        <Seg label={t('Max jump')} value={eq.maxJumpPct} onChange={(v) => save({ maxJumpPct: v })} options={[0.05, 0.1, 0.15].map((v) => ({ value: v, label: `${v * 100}%` }))} />
        <div className="tiny muted" style={{ marginTop: 8 }}>{t('If the smallest available step is bigger (common with dumbbells), the app still suggests it and tells you to expect fewer reps.')}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ProgramScreen() {
  const s = useActions();
  const nav = useNav();
  const p = s.program;
  const status = p ? programStatus(p, Date.now()) : null;
  const [edit, setEdit] = useState<number | null>(null);
  const [jump, setJump] = useState<number | null>(null);
  const saveBlock = (i: number, b: Block) => p && s.saveProgram({ ...p, blocks: p.blocks.map((x, j) => (j === i ? b : x)) });

  return (
    <div className="screen">
      <TopBar title={t('Training cycle')} onBack={nav.back} />
      <div className="list">
        <SettingRow title={t('Follow a training cycle')} hint={t('Blocks change rep ranges for compound lifts. You confirm each change.')}>
          <Switch label={t('Cycle active')} checked={!!p?.active} onChange={(v) => s.setProgramActive(v)} />
        </SettingRow>
      </div>

      {p && (
        <>
          <div className="section-h">{t('Blocks')}</div>
          <div className="list">
            {p.blocks.map((b, i) => {
              const cur = p.active && i === p.currentBlockIndex;
              return (
                <button key={b.id} className="list-item" style={cur ? { background: 'var(--tint-yellow)' } : undefined} onClick={() => setEdit(i)}>
                  <div className="num" style={{ width: 24, fontSize: 20, color: 'var(--ink-3)' }}>{i + 1}</div>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{b.name}</div>
                    <div className="tiny muted">
                      {tn(b.weeks, '{n} week', '{n} weeks')}, {b.type === 'deload'
                        ? t('{sets}% sets, {load}% load', { sets: Math.round(b.setFactor * 100), load: Math.round(b.loadFactor * 100) })
                        : `${b.sets} × ${b.repMin}–${b.repMax}, RIR ${b.targetRir ?? '—'}`}
                    </div>
                    {cur && status && <div className="tiny" style={{ fontWeight: 600 }}>{t('Now: week {week}, started {date}', { week: Math.min(status.week, b.weeks), date: fmtDate(p.blockStartedAt) })}{status.complete ? `, ${t('complete')}` : ''}</div>}
                  </div>
                  <IconChevron width={18} className="muted" />
                </button>
              );
            })}
          </div>
          {p.active && status && (
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => s.advanceBlock()}>{t('Start {name} now', { name: status.next.name })}</button>
          )}
          <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => s.saveProgram({ ...p, blocks: defaultBlocks(), currentBlockIndex: 0, blockStartedAt: Date.now() })}>{t('Reset to the default cycle')}</button>
          <p className="tiny muted">{t('Isolation exercises keep their own rep ranges in every block. When a block changes the rep range, the first suggested weight is worked out from your estimated 1RM, rounded down.')}</p>

          <Sheet open={edit != null} onClose={() => setEdit(null)} title={edit != null ? p.blocks[edit].name : ''}>
            {edit != null && <BlockEditor block={p.blocks[edit]} onSave={(b) => { saveBlock(edit, b); setEdit(null); }}
              onJump={p.active && edit !== p.currentBlockIndex ? () => { setJump(edit); setEdit(null); } : undefined} />}
          </Sheet>
          <Confirm open={jump != null} onClose={() => setJump(null)} title={t('Switch to {name}?', { name: jump != null ? p.blocks[jump].name : '' })} body={t('The block starts today.')} confirmLabel={t('Switch block')}
            onConfirm={() => jump != null && s.advanceBlock(jump)} />
        </>
      )}
    </div>
  );
}

function BlockEditor({ block, onSave, onJump }: { block: Block; onSave: (b: Block) => void; onJump?: () => void }) {
  const [b, setB] = useState(block);
  const n = (v: string, min = 0) => Math.max(min, Math.round(Number(v) || 0));
  return (
    <div className="stack">
      <label className="field"><span>{t('Name')}</span><input className="input" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></label>
      <div className="row">
        <label className="field grow"><span>{t('Weeks')}</span><input className="input" inputMode="numeric" value={b.weeks} onChange={(e) => setB({ ...b, weeks: n(e.target.value, 1) })} /></label>
        {b.type !== 'deload' && <label className="field grow"><span>{t('Sets')}</span><input className="input" inputMode="numeric" value={b.sets} onChange={(e) => setB({ ...b, sets: n(e.target.value, 1) })} /></label>}
      </div>
      {b.type !== 'deload' && (
        <div className="row">
          <label className="field grow"><span>{t('Min reps')}</span><input className="input" inputMode="numeric" value={b.repMin} onChange={(e) => setB({ ...b, repMin: n(e.target.value, 1) })} /></label>
          <label className="field grow"><span>{t('Max reps')}</span><input className="input" inputMode="numeric" value={b.repMax} onChange={(e) => setB({ ...b, repMax: n(e.target.value, 1) })} /></label>
          <label className="field grow"><span>{t('Target RIR')}</span><input className="input" inputMode="numeric" value={b.targetRir ?? ''} onChange={(e) => setB({ ...b, targetRir: e.target.value === '' ? null : n(e.target.value) })} /></label>
        </div>
      )}
      {b.repMax < b.repMin && <div className="note red">{t('Max reps must be at least min reps.')}</div>}
      <button className="btn primary block" disabled={b.repMax < b.repMin || !b.name.trim()} onClick={() => onSave(b)}>{t('Save block')}</button>
      {onJump && <button className="btn block" onClick={onJump}>{t('Switch to this block now')}</button>}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RulesScreen() {
  const nav = useNav();
  const st = useApp((s) => s.profile.settings);
  const p = st.progression;
  return (
    <div className="screen">
      <TopBar title={t('How suggestions work')} onBack={nav.back} />
      <div className="card stack small">
        <p style={{ margin: 0 }}>{t('Every suggestion comes from the fixed rules below, applied to the sets you logged last time. Nothing is guessed, and you can override any number before you tick a set.')}</p>
        <div><b>{t('Add weight')}</b> {t('when every prescribed set reached the top of the rep range')}{p.minRirToProgress != null ? ` ${t('and the sets where you rated effort averaged at least {n} reps in reserve', { n: p.minRirToProgress })}` : ''}. {t('The new weight is the closest load your equipment can make to your preferred jump, never more than {pct}% unless the smallest step is larger.', { pct: Math.round(st.equipment.maxJumpPct * 100) })}</div>
        <div><b>{t('Keep the weight')}</b> {t("when you're inside the range, didn't finish all sets, or effort was too high. Rep targets are last time's reps plus one.")}</div>
        <div><b>{t('Reduce about {pct}%', { pct: Math.round(p.reducePct * 100) })}</b> {t('after {n} sessions in a row below the bottom of the range at the same weight.', { n: p.failuresBeforeReduce })}</div>
        <div><b>{t('New rep range')}</b> {t('(new block, edited template): the first weight is your best estimated 1RM converted to the new top rep target at the target RIR, rounded down, and capped at +{pct}%.', { pct: TRANSITION_CAP * 100 })}</div>
        <div><b>{t('Heavy day')}</b>{t(': compound lifts become {sets} × {range} at RIR {rir}, with load from your estimated 1RM. Heavy days don\'t change your normal progression.', { sets: HEAVY_TARGET.sets, range: `${HEAVY_TARGET.repMin}–${HEAVY_TARGET.repMax}`, rir: HEAVY_TARGET.targetRir ?? 2 })}</div>
        <div><b>{t('Deload')}</b>{t(': half the sets (rounded up), about 90% of the last weight lifted, stop 4 reps short of failure. Deload sessions are ignored by progression. A deload is recommended when any of these is true:')} {st.deloadEveryWeeks ? `${t('{n} weeks since the last one (without a cycle);', { n: st.deloadEveryWeeks })} ` : ''}{t('estimated 1RM fell {sessions} sessions in a row on {n}+ exercises; or {streak} sessions in a row with every rated set at RIR 0.', { sessions: DECLINE_SESSIONS, n: DECLINE_EXERCISES, streak: HARD_SESSION_STREAK })}</div>
        <div><b>{t('Estimated 1RM')}</b> {t('uses the Epley formula, weight × (1 + reps ÷ 30), only for sets of {n} reps or fewer. It tracks trends; it is not a tested max. Tested 1RM only counts real singles.', { n: E1RM_MAX_REPS })}</div>
        <div><b>{t('Records')}</b> {t('are detected automatically once an exercise has history: heaviest weight, more reps at a weight or heavier, best estimated 1RM, and most volume in a session.')}</div>
        <div className="muted">{t('Warm-up sets and unticked sets never count.')}</div>
      </div>
    </div>
  );
}
