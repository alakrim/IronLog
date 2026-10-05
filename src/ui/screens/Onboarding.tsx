import { useState } from 'react';
import type { Experience, Unit } from '../../domain/types';
import { useActions } from '../ctx';
import { Seg } from '../components';

export function Onboarding() {
  const { completeOnboarding } = useActions();
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
      <div className="dots" aria-label={`Step ${step + 1} of 3`}>{[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <>
          <h1>Log the set.<br />Lift more next time.</h1>
          <p className="lead">IronLog remembers every set and tells you exactly when to add weight, using rules you can read and change.</p>
          <div className="stack">
            <label className="field"><span>Your name (optional)</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="So the app can greet you" autoComplete="given-name" />
            </label>
            <div className="field"><span>Weights in</span>
              <Seg label="Units" value={unit} onChange={setUnit} options={[{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }]} />
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="btn primary block" onClick={() => setStep(1)}>Continue</button>
        </>
      )}

      {step === 1 && (
        <>
          <h1>How long have you been lifting?</h1>
          <p className="lead">This only sets a few defaults. You can change everything later.</p>
          {([
            ['beginner', 'Under a year', 'Simple progression, no heavy days by default.'],
            ['intermediate', '1–3 years', 'Rep-range progression with periodic heavier work.'],
            ['advanced', 'More than 3 years', 'Same tools, with more control over blocks and deloads.'],
          ] as [Experience, string, string][]).map(([v, t, d]) => (
            <button key={v} className="choice" aria-pressed={exp === v} onClick={() => setExp(v)}><b>{t}</b><span>{d}</span></button>
          ))}
          <div style={{ flex: 1 }} />
          <div className="row"><button className="btn ghost" onClick={() => setStep(0)}>Back</button><button className="btn primary grow" onClick={() => setStep(2)}>Continue</button></div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Follow a training cycle?</h1>
          <p className="lead">A cycle moves you from higher-rep hypertrophy blocks into strength blocks, then a deload week.</p>
          <button className="choice" aria-pressed={prog === true} onClick={() => setProg(true)}>
            <b>Yes, run the 15-week cycle</b>
            <span>8–12 reps, 6–10 reps, 3–6 reps, 3–5 reps, deload. Applies to compound lifts; you confirm each block change.</span>
          </button>
          <button className="choice" aria-pressed={prog === false} onClick={() => setProg(false)}>
            <b>No, just track my workouts</b>
            <span>Progression per exercise, with optional deload and heavy-day reminders.</span>
          </button>
          <p className="small muted" style={{ marginTop: 8 }}>You'll start with Push, Pull and Legs templates and standard gym plates. Edit both in Settings.</p>
          <div style={{ flex: 1 }} />
          <div className="row"><button className="btn ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary grow" disabled={prog == null || busy} onClick={finish}>Start training</button></div>
        </>
      )}
    </div>
  );
}
