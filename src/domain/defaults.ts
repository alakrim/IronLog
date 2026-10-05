import { KG_PER_LB } from './loads';
import type { EquipmentProfile, Settings, Unit } from './types';

const lb = (v: number) => Math.round(v * KG_PER_LB * 1e6) / 1e6;
const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 1e4) / 1e4);
  return out;
};

export function defaultEquipment(unit: Unit): EquipmentProfile {
  if (unit === 'lb') {
    return {
      barKg: lb(45),
      platesKg: [45, 35, 25, 10, 5, 2.5].map(lb),
      dumbbellsKg: range(5, 120, 5).map(lb),
      machineStepKg: lb(10),
      cableStepKg: lb(5),
      maxJumpPct: 0.1,
    };
  }
  return {
    barKg: 20,
    platesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
    dumbbellsKg: range(2.5, 60, 2.5),
    machineStepKg: 5,
    cableStepKg: 2.5,
    maxJumpPct: 0.1,
  };
}

export function defaultSettings(unit: Unit = 'kg'): Settings {
  return {
    restSec: 120,
    autoStartTimer: true,
    askRir: true,
    deloadEveryWeeks: 8,
    heavyEveryWeeks: 0,
    progression: {
      minRirToProgress: null,
      failuresBeforeReduce: 2,
      reducePct: 0.1,
      backoffPct: 0.85,
    },
    equipment: defaultEquipment(unit),
  };
}
