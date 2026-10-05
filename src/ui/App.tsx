import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
import { useApp } from './ctx';
import { NavCtx, type Nav, type Route, type Tab } from './nav';
import { IconChart, IconGear, IconHistory, IconHome, IconList } from './icons';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { TimerBar, WorkoutScreen } from './screens/Workout';
import { History, WorkoutDetail } from './screens/History';
import { Progress } from './screens/Progress';
import { ExerciseDetail, ExerciseEdit, Exercises } from './screens/Exercises';
import { TemplateEditor, Templates } from './screens/Templates';
import { applyTheme, EquipmentScreen, ProgramScreen, readTheme, RulesScreen, Settings } from './screens/Settings';

const TABS: { id: Tab; label: () => string; Icon: typeof IconHome }[] = [
  { id: 'home', label: () => t('Train'), Icon: IconHome },
  { id: 'history', label: () => t('History'), Icon: IconHistory },
  { id: 'progress', label: () => t('Progress'), Icon: IconChart },
  { id: 'exercises', label: () => t('Exercises'), Icon: IconList },
  { id: 'settings', label: () => t('Settings'), Icon: IconGear },
];

function canUseHistory() {
  try { window.history.replaceState({ ironlog: 0 }, ''); return true; } catch { return false; }
}

export function App() {
  const ready = useApp((s) => s.ready);
  const language = useApp((s) => s.profile.language);
  const onboarded = useApp((s) => s.profile.onboarded);
  const activeId = useApp((s) => s.workouts.find((w) => w.status === 'active' && !w.deleted)?.id);
  const [tab, setTabState] = useState<Tab>('home');
  const [stack, setStack] = useState<Route[]>([]);
  const [toastMsg, setToast] = useState<string | null>(null);
  const histOk = useRef<boolean | null>(null);
  const resumed = useRef(false);

  useEffect(() => { applyTheme(readTheme()); }, []);
  useEffect(() => { histOk.current = canUseHistory(); }, []);

  // Hardware / browser back pops our stack.
  useEffect(() => {
    const onPop = () => setStack((s) => s.slice(0, -1));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((r: Route) => {
    setStack((s) => [...s, r]);
    if (histOk.current) { try { window.history.pushState({ ironlog: 1 }, ''); } catch { histOk.current = false; } }
    window.scrollTo(0, 0);
  }, []);
  const replace = useCallback((r: Route) => setStack((s) => (s.length ? [...s.slice(0, -1), r] : [r])), []);
  const back = useCallback(() => {
    if (histOk.current) window.history.back();
    else setStack((s) => s.slice(0, -1));
  }, []);
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    setStack((s) => {
      if (s.length && histOk.current) { try { window.history.go(-s.length); } catch { /* ignore */ } }
      return [];
    });
    window.scrollTo(0, 0);
  }, []);
  const toast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); }, []);

  // After a restart mid-workout, go straight back to it.
  useEffect(() => {
    if (ready && onboarded && activeId && !resumed.current) {
      resumed.current = true;
      push({ name: 'workout', id: activeId });
    }
    if (ready) resumed.current = true;
  }, [ready, onboarded, activeId, push]);

  const route: Route = stack[stack.length - 1] ?? { name: tab };
  const nav: Nav = useMemo(() => ({ route, tab, push, replace, back, setTab, toast }), [route, tab, push, replace, back, setTab, toast]);

  if (!ready) return <div className="app" aria-busy="true" />;
  if (!onboarded) return <Onboarding key={language} />;

  const inWorkout = route.name === 'workout';
  return (
    <NavCtx.Provider value={nav}>
      <div className="app" key={language}>
        <main key={JSON.stringify(route)}>{renderRoute(route)}</main>
        {!inWorkout && (
          <div className="tabbar">
            <nav aria-label={t('Main')}>
              {TABS.map(({ id, label, Icon }) => (
                <button key={id} className="tab" aria-current={tab === id && stack.length === 0 ? 'page' : undefined} onClick={() => setTab(id)}>
                  <Icon />{label()}
                </button>
              ))}
            </nav>
          </div>
        )}
        {inWorkout ? <TimerBar /> : activeId && route.name !== 'workoutDetail' ? (
          <button className="btn primary" style={{ position: 'fixed', bottom: 'calc(72px + env(safe-area-inset-bottom))', right: 16, zIndex: 11, boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}
            onClick={() => push({ name: 'workout', id: activeId })}>{t('Resume workout')}</button>
        ) : null}
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </NavCtx.Provider>
  );
}

function renderRoute(r: Route) {
  switch (r.name) {
    case 'home': return <Home />;
    case 'history': return <History />;
    case 'progress': return <Progress />;
    case 'exercises': return <Exercises />;
    case 'settings': return <Settings />;
    case 'workout': return <WorkoutScreen id={r.id} />;
    case 'workoutDetail': return <WorkoutDetail id={r.id} finished={r.finished} />;
    case 'exercise': return <ExerciseDetail id={r.id} />;
    case 'exerciseEdit': return <ExerciseEdit id={r.id} />;
    case 'template': return <TemplateEditor id={r.id} />;
    case 'templates': return <Templates />;
    case 'program': return <ProgramScreen />;
    case 'equipment': return <EquipmentScreen />;
    case 'rules': return <RulesScreen />;
  }
}
