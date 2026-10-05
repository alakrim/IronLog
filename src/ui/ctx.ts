import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { AppState, AppStore, Actions } from '../store/store';
import type { ID, Unit } from '../domain/types';
import { fmtLoad } from '../domain/loads';

export const StoreCtx = createContext<AppStore | null>(null);

export function useApp<T>(sel: (s: AppState & Actions) => T): T {
  const store = useContext(StoreCtx);
  if (!store) throw new Error('StoreCtx missing');
  return useStore(store, sel);
}
export const useActions = () => useApp((s) => s);

export function useUnit(): Unit {
  return useApp((s) => s.profile.unit);
}

/** "82.5 kg" */
export function useW() {
  const unit = useUnit();
  return (kg: number | null | undefined) => (kg == null ? '—' : `${fmtLoad(kg, unit)} ${unit}`);
}

export function useExercise(id: ID | undefined) {
  return useApp((s) => s.exercises.find((e) => e.id === id));
}
