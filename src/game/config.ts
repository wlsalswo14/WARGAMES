import type {
  FactionDefinition,
  FactionId,
  ProjectileAttackMode,
  UnitKind,
  UnitStats,
  WeaponStats,
} from './types';

export const FACTIONS: Record<FactionId, FactionDefinition> = {
  azure: {
    id: 'azure',
    name: '청람 연방',
    color: 0x006cff,
    accent: '#1688ff',
    doctrine: 'mobility',
  },
  crimson: {
    id: 'crimson',
    name: '적월 공화국',
    color: 0xff1828,
    accent: '#ff3b49',
    doctrine: 'firepower',
  },
  amber: {
    id: 'amber',
    name: '황토 방위령',
    color: 0xffcf00,
    accent: '#ffe13b',
    doctrine: 'entrenchment',
  },
};

export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  infantry: {
    maxHealth: 60,
    speed: 6.8,
    turnRate: 4.8,
    range: 34,
    armor: 4,
    cost: 60,
    capturePower: 1,
  },
  tank: {
    maxHealth: 280,
    speed: 10.2,
    turnRate: 1.25,
    range: 115,
    armor: 75,
    cost: 260,
    capturePower: 2,
  },
  fighter: {
    maxHealth: 145,
    speed: 55,
    turnRate: 0.95,
    range: 165,
    armor: 18,
    cost: 420,
    capturePower: 1,
  },
  helicopter: {
    maxHealth: 180,
    speed: 29,
    turnRate: 1.5,
    range: 130,
    armor: 24,
    cost: 360,
    capturePower: 1,
  },
  drone: {
    maxHealth: 48,
    speed: 23,
    turnRate: 2.8,
    range: 72,
    armor: 3,
    cost: 120,
    capturePower: 1,
  },
};

const NORMAL_WEAPONS: Record<UnitKind, WeaponStats> = {
  infantry: {
    reload: 0.55,
    damage: 9,
    projectileSpeed: 81,
    penetration: 12,
    blastRadius: 0.8,
    destroysStructures: false,
  },
  tank: {
    reload: 0.42,
    damage: 12,
    projectileSpeed: 88,
    penetration: 16,
    blastRadius: 0.8,
    destroysStructures: false,
  },
  fighter: {
    reload: 0.16,
    damage: 13,
    projectileSpeed: 128,
    penetration: 28,
    blastRadius: 0.8,
    destroysStructures: false,
  },
  helicopter: {
    reload: 0.22,
    damage: 16,
    projectileSpeed: 111,
    penetration: 20,
    blastRadius: 0.8,
    destroysStructures: false,
  },
  drone: {
    reload: 0.5,
    damage: 10,
    projectileSpeed: 90,
    penetration: 12,
    blastRadius: 0.8,
    destroysStructures: false,
  },
};

const SPECIAL_WEAPONS: Partial<Record<UnitKind, WeaponStats>> = {
  tank: {
    reload: 7.5,
    damage: 520,
    projectileSpeed: 68,
    penetration: 280,
    blastRadius: 12,
    destroysStructures: true,
  },
  fighter: {
    reload: 6,
    damage: 520,
    projectileSpeed: 105,
    penetration: 280,
    blastRadius: 12,
    destroysStructures: true,
  },
  helicopter: {
    reload: 7,
    damage: 520,
    projectileSpeed: 82,
    penetration: 280,
    blastRadius: 12,
    destroysStructures: true,
  },
  drone: {
    reload: 9,
    damage: 700,
    projectileSpeed: 0,
    penetration: 300,
    blastRadius: 15,
    destroysStructures: true,
  },
};

export function getWeaponStats(
  kind: UnitKind,
  mode: ProjectileAttackMode,
): WeaponStats | null {
  return mode === 'special'
    ? SPECIAL_WEAPONS[kind] ?? null
    : NORMAL_WEAPONS[kind];
}

export function getDroneSuicideStats(): WeaponStats {
  return SPECIAL_WEAPONS.drone as WeaponStats;
}

export const WORLD = {
  chunkSize: 96,
  chunkRadius: 3,
  gravity: 18,
  waterLevel: -1.7,
  battlefieldRadius: 430,
  outpostCaptureRadius: 19,
  territoryRadius: 64,
  outpostCaptureTime: 5,
  resourceTick: 2,
  diplomacyInterval: 45,
  maxProjectiles: 110,
  maxRubble: 48,
} as const;
