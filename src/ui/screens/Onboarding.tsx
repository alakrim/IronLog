import { useState } from 'react';
import type { Experience, Unit } from '../../domain/types';
import { LANGS, getLang, t } from '../../i18n';
import { useActions } from '../ctx';
import { Seg } from '../components';

export function Onboarding() {
  const { completeOnboarding, setLanguage } = useActions();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('kg');
  const [exp, setExp] = useState<Experience>('intermediate');
  const [prog, setProg] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    await completeOnboarding({ name, unit, experience: exp, usePrograms: !!prog });
  };

  return (
    <div className="onb">
      <div className="dots" aria-label={t('Step {n} of 3', { n: step + 1 })}>{[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <>
          <h1>{t('Log the set.')}<br />{t('Lift more next time.')}</h1>
          <p className="lead">{t('IronLog remembers every set and tells you exactly when to add weight, using rules you can read and change.')}</p>
          <div className="stack">
            <div className="field"><span>{t('Language')}</span>
              <Seg label={t('Language')} value={getLang()} onChange={(l) => setLanguage(l)} options={LANGS} />
            </div>
            <label className="field"><span>{t('Your name (optional)')}</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('So the app can greet you')} autoComplete="given-name" />
            </label>
            <div className="field"><span>{t('Weights in')}</span>
              <Seg label={t('Units')} value={unit} onChange={setUnit} options={[{ value: 'kg', label: t('Kilograms') }, { value: 'lb', label: t('Pounds') }]} />
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn primary block" onClick={() => setStep(1)}>{t('Continue')}</button>
        </>
      )}

      {step === 1 && (
        <>
          <h1>{t('How long have you been lifting?')}</h1>
          <p className="lead">{t('This only sets a few defaults. You can change everything later.')}</p>
          {([
            ['beginner', t('Under a year'), t('Simple progression, no heavy days by default.')],
            ['intermediate', t('1–3 years'), t('Rep-range progression with periodic heavier work.')],
            ['advanced', t('More than 3 years'), t('Same tools, with more control over blocks and deloads.')],
          ] as [Experience, string, string][]).map(([v, title, d]) => (
            <button key={v} className="choice" aria-pressed={exp === v} onClick={() => setExp(v)}><b>{title}</b><span>{d}</span></button>
          ))}
          <div style={{ flex: 1 }} />
          <div className="row"><button className="btn ghost" onClick={() => setStep(0)}>{t('Back')}</button><button className="btn primary grow" onClick={() => setStep(2)}>{t('Continue')}</button></div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>{t('Follow a training cycle?')}</h1>
          <p className="lead">{t('A cycle moves you from higher-rep hypertrophy blocks into strength blocks, then a deload week.')}</p>
          <button className="choice" aria-pressed={prog === true} onClick={() => setProg(true)}>
            <b>{t('Yes, run the 15-week cycle')}</b>
            <span>{t('8–12 reps, 6–10 reps, 3–6 reps, 3–5 reps, deload. Applies to compound lifts; you confirm each block change.')}</span>
          </button>
          <button className="choice" aria-pressed={prog === false} onClick={() => setProg(false)}>
            <b>{t('No, just track my workouts')}</b>
            <span>{t('Progression per exercise, with optional deload and heavy-day reminders.')}</span>
          </button>
          <p className="small muted" style={{ marginTop: 8 }}>{t("You'll start with Push, Pull and Legs templates and standard gym plates. Edit both in Settings.")}</p>
          <div style={{ flex: 1 }} />
          <div className="row"><button className="btn ghost" onClick={() => setStep(1)}>{t('Back')}</button>
            <button className="btn primary grow" disabled={prog == null || busy} onClick={finish}>{t('Start training')}</button></div>
        </>
      )}
    </div>
  );
}
