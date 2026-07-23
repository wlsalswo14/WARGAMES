import type { UnitKind } from '../types';
import type { Strategy } from '../systems/BattlefieldAI';

export const INITIAL_FORCE: UnitKind[] = [
  'infantry', 'infantry', 'infantry', 'infantry', 'infantry',
  'infantry', 'infantry', 'infantry', 'infantry', 'infantry',
  'tank', 'tank', 'tank', 'tank',
  'drone', 'drone',
  'helicopter',
  'fighter',
];

export const TARGET_UNITS_PER_FACTION = INITIAL_FORCE.length;

export function chooseReinforcementKind(strategy: Strategy, roll = Math.random()): UnitKind {
  if (strategy === 'air-superiority') {
    return roll > 0.55 ? 'fighter' : 'drone';
  }
  if (strategy === 'assault') {
    return roll > 0.42 ? 'tank' : 'infantry';
  }
  if (strategy === 'capture') {
    return roll > 0.68 ? 'drone' : 'infantry';
  }
  return roll > 0.82 ? 'helicopter' : 'infantry';
}
