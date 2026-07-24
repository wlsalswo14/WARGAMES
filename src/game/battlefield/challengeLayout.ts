import type { TerrainProfile } from '../math';
import type { ChallengeFormat } from '../modes/PlayMode';
import type { FactionId } from '../types';
import type { BattlefieldTheme } from './themes';
import type { BaseLayout, OutpostLayout } from './layout';
import type { StructurePlan } from './structurePlans';

export interface ChallengeLayout {
  outposts: OutpostLayout[];
  bases: Record<FactionId, BaseLayout>;
  staging: Record<FactionId, Array<{ x: number; z: number }>>;
}

const DUEL_LAYOUT: ChallengeLayout = {
  outposts: [
    { x: -210, z: -84, owner: 'azure' },
    { x: -224, z: 0, owner: 'azure' },
    { x: -210, z: 84, owner: 'azure' },
    { x: -42, z: -72, owner: null },
    { x: 0, z: 0, owner: null },
    { x: 42, z: 72, owner: null },
    { x: 210, z: -84, owner: 'crimson' },
    { x: 224, z: 0, owner: 'crimson' },
    { x: 210, z: 84, owner: 'crimson' },
  ],
  bases: {
    azure: { x: -282, z: 0, yaw: Math.PI / 2 },
    crimson: { x: 282, z: 0, yaw: -Math.PI / 2 },
    amber: { x: 0, z: 330, yaw: Math.PI },
  },
  staging: {
    azure: [
      { x: -252, z: -126 },
      { x: -252, z: 126 },
    ],
    crimson: [
      { x: 252, z: -126 },
      { x: 252, z: 126 },
    ],
    amber: [],
  },
};

const TRIPLE_LAYOUT: ChallengeLayout = {
  outposts: [
    { x: -205, z: -158, owner: 'azure' },
    { x: -190, z: -102, owner: 'azure' },
    { x: -145, z: -145, owner: 'azure' },
    { x: 205, z: -158, owner: 'crimson' },
    { x: 190, z: -102, owner: 'crimson' },
    { x: 145, z: -145, owner: 'crimson' },
    { x: -60, z: 210, owner: 'amber' },
    { x: 0, z: 224, owner: 'amber' },
    { x: 60, z: 210, owner: 'amber' },
    { x: 0, z: -48, owner: null },
    { x: -76, z: 65, owner: null },
    { x: 76, z: 65, owner: null },
  ],
  bases: {
    azure: { x: -268, z: -184, yaw: Math.PI * 0.36 },
    crimson: { x: 268, z: -184, yaw: -Math.PI * 0.36 },
    amber: { x: 0, z: 292, yaw: Math.PI },
  },
  staging: {
    azure: [
      { x: -246, z: -236 },
      { x: -216, z: -194 },
    ],
    crimson: [
      { x: 246, z: -236 },
      { x: 216, z: -194 },
    ],
    amber: [
      { x: -86, z: 264 },
      { x: 86, z: 264 },
    ],
  },
};

export function getChallengeLayout(format: ChallengeFormat): ChallengeLayout {
  return format === 'triple' ? TRIPLE_LAYOUT : DUEL_LAYOUT;
}

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
  cityBuilding('west-outskirts', -164, 28, 13, 44, 11, 0.04, 0x6a7478),
  cityBuilding('east-outskirts', 164, -28, 13, 44, 11, -0.04, 0x796e66),
  cityBuilding('southwest-block', -92, -142, 16, 34, 12, 0.12, 0x6d746d),
  cityBuilding('southeast-block', 92, -142, 16, 34, 12, -0.12, 0x75706b),
  cityBuilding('northwest-block', -122, 142, 14, 40, 11, Math.PI / 2, 0x667176),
  cityBuilding('northeast-block', 122, 142, 14, 40, 11, Math.PI / 2, 0x7a6f66),
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
