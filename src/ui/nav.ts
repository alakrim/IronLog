import { createContext, useContext } from 'react';
import type { ID } from '../domain/types';

export type Tab = 'home' | 'history' | 'progress' | 'exercises' | 'settings';
export type Route =
  | { name: Tab }
  | { name: 'workout'; id: ID }
  | { name: 'workoutDetail'; id: ID; finished?: boolean }
  | { name: 'exercise'; id: ID }
  | { name: 'exerciseEdit'; id: ID | null }
  | { name: 'template'; id: ID | null }
  | { name: 'templates' }
  | { name: 'program' }
  | { name: 'equipment' }
  | { name: 'rules' };

export interface Nav {
  route: Route;
  tab: Tab;
  push(r: Route): void;
  replace(r: Route): void;
  back(): void;
  setTab(t: Tab): void;
  toast(msg: string): void;
}

export const NavCtx = createContext<Nav | null>(null);
export function useNav(): Nav {
  const n = useContext(NavCtx);
  if (!n) throw new Error('NavCtx missing');
  return n;
}
