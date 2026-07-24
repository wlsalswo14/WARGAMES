import type { TerrainProfile } from '../math';
import type { FactionId } from '../types';
import type { BattlefieldTheme } from './themes';
import type { BaseLayout, OutpostLayout } from './layout';
import type { StructurePlan } from './structurePlans';

export const CHALLENGE_OUTPOSTS: OutpostLayout[] = [
  { x: -132, z: 0, owner: 'azure' },
  { x: -78, z: -68, owner: null },
  { x: -58, z: 72, owner: null },
  { x: 0, z: 0, owner: null },
  { x: 58, z: -72, owner: null },
  { x: 78, z: 68, owner: null },
  { x: 132, z: 0, owner: 'crimson' },
];

export const CHALLENGE_BASES: Record<FactionId, BaseLayout> = {
  azure: { x: -174, z: 0, yaw: Math.PI / 2 },
  crimson: { x: 174, z: 0, yaw: -Math.PI / 2 },
  amber: { x: 0, z: 220, yaw: Math.PI },
};

export const CHALLENGE_STAGING: Record<FactionId, Array<{ x: number; z: number }>> = {
  azure: [
    { x: -152, z: -56 },
    { x: -146, z: 58 },
  ],
  crimson: [
    { x: 152, z: 56 },
    { x: 146, z: -58 },
  ],
  amber: [],
};

const CHALLENGE_TERRAIN: TerrainProfile = {
  phaseX: 173,
  phaseZ: -291,
  heightScale: 0.62,
  riverAmplitude: 520,
  riverFrequency: 0.001,
  riverPhase: Math.PI / 2,
};

export const CHALLENGE_THEME: BattlefieldTheme = {
  id: 'urban',
  label: '헤드헌터 시가지',
  description: '7분 동안 거점망을 장악하고 적 지휘 AI의 예측을 역이용하십시오.',
  palette: {
    low: 0x35423d,
    high: 0x667068,
    riverBank: 0x4d4942,
  },
  terrainProfile: CHALLENGE_TERRAIN,
  treeDensity: 0.28,
  terrainStamps: [
    { kind: 'mountain', x: 0, z: 142 },
    { kind: 'mountain', x: 0, z: -145 },
    { kind: 'trench', x: -42, z: -20 },
    { kind: 'trench', x: 42, z: 20 },
  ],
  buildings: [],
  walls: [],
};

export const CHALLENGE_STRUCTURES: StructurePlan[] = [
  cityBuilding('tower-west', -104, 26, 14, 52, 11, 0.08, 0x69747a),
  cityBuilding('tower-west-south', -98, -38, 12, 34, 10, -0.06, 0x817069),
  cityBuilding('west-block', -50, 36, 16, 29, 12, Math.PI / 2, 0x6d7367),
  cityBuilding('west-apartment', -44, -50, 13, 38, 11, Math.PI / 2, 0x747c7e),
  cityBuilding('central-north', -6, 48, 17, 56, 13, 0.03, 0x77716a),
  cityBuilding('central-south', 8, -48, 15, 40, 12, -0.04, 0x667278),
  cityBuilding('east-apartment', 45, 51, 14, 36, 11, Math.PI / 2, 0x827668),
  cityBuilding('east-block', 52, -34, 16, 31, 13, Math.PI / 2, 0x6c746b),
  cityBuilding('tower-east-north', 98, 38, 12, 35, 10, 0.07, 0x757b7d),
  cityBuilding('tower-east', 106, -27, 14, 52, 11, -0.08, 0x7f7066),
  cityBuilding('north-landmark', 34, 105, 13, 60, 12, 0.12, 0x657177),
  cityBuilding('south-landmark', -34, -106, 13, 60, 12, -0.12, 0x786c63),
  wall('west-barricade', -124, -22, 25, 7, Math.PI / 2, 0x315e9b, 'azure'),
  wall('east-barricade', 124, 22, 25, 7, Math.PI / 2, 0x8f343c, 'crimson'),
  wall('central-wall-north', -20, 16, 30, 6, 0.15, 0x5f6767),
  wall('central-wall-south', 20, -16, 30, 6, 0.15, 0x5f6767),
];

function cityBuilding(
  id: string,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  yaw: number,
  color: number,
): StructurePlan {
  return {
    id,
    kind: 'building',
    x,
    z,
    width,
    height,
    depth,
    yaw,
    color,
    openCenter: true,
  };
}

function wall(
  id: string,
  x: number,
  z: number,
  width: number,
  height: number,
  yaw: number,
  color: number,
  faction: FactionId | null = null,
): StructurePlan {
  return {
    id,
    kind: 'wall',
    x,
    z,
    width,
    height,
    depth: 1,
    yaw,
    color,
    openCenter: false,
    faction,
  };
}
