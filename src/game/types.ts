import type { Vector3 } from 'three';

export type FactionId = 'azure' | 'crimson' | 'amber';
export type Relation = 'allied' | 'neutral' | 'hostile';
export type UnitKind = 'infantry' | 'tank' | 'fighter' | 'helicopter' | 'drone';
export type AttackMode = 'normal' | 'special' | 'suicide';
export type ProjectileAttackMode = Exclude<AttackMode, 'suicide'>;
export type DeployKind = UnitKind | 'wall' | 'mountain' | 'trench' | 'building' | 'tree';
export type GameMode = 'god' | 'possession';
export type CameraView = 'thirdPerson' | 'firstPerson';

export interface FactionDefinition {
  id: FactionId;
  name: string;
  color: number;
  accent: string;
  doctrine: 'firepower' | 'mobility' | 'entrenchment';
}

export interface UnitStats {
  maxHealth: number;
  speed: number;
  turnRate: number;
  range: number;
  armor: number;
  cost: number;
  capturePower: number;
}

export interface WeaponStats {
  reload: number;
  damage: number;
  projectileSpeed: number;
  penetration: number;
  blastRadius: number;
  destroysStructures: boolean;
}

export interface CommandOrder {
  type: 'move' | 'attack' | 'hold';
  destination: Vector3;
  targetId?: string;
}

export interface DamageResult {
  destroyed: boolean;
  ricochet: boolean;
  penetrated: boolean;
  damage: number;
}

export interface DiplomacyEvent {
  from: FactionId;
  to: FactionId;
  relation: Relation;
  reason: string;
}

export interface BattlefieldStats {
  unitCounts: Record<FactionId, number>;
  outpostCounts: Record<FactionId, number>;
  neutralOutposts: number;
}
