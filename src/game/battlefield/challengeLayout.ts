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
    { x: 0, z: -88, owner: null, label: 'A' },
    { x: 0, z: 0, owner: null, label: 'B' },
    { x: 0, z: 88, owner: null, label: 'C' },
  ],
  bases: {
    azure: { x: -168, z: 0, yaw: Math.PI / 2 },
    crimson: { x: 168, z: 0, yaw: -Math.PI / 2 },
    amber: { x: 0, z: 330, yaw: Math.PI },
  },
  staging: {
    azure: [
      { x: -132, z: -54 },
      { x: -132, z: 54 },
    ],
    crimson: [
      { x: 132, z: -54 },
      { x: 132, z: 54 },
    ],
    amber: [],
  },
};

const TRIPLE_LAYOUT: ChallengeLayout = {
  outposts: [
    { x: -58, z: -34, owner: null, label: 'A' },
    { x: 58, z: -34, owner: null, label: 'B' },
    { x: 0, z: 68, owner: null, label: 'C' },
  ],
  bases: {
    azure: { x: -166, z: -112, yaw: Math.PI * 0.34 },
    crimson: { x: 166, z: -112, yaw: -Math.PI * 0.34 },
    amber: { x: 0, z: 184, yaw: Math.PI },
  },
  staging: {
    azure: [
      { x: -126, z: -76 },
      { x: -112, z: -132 },
    ],
    crimson: [
      { x: 126, z: -76 },
      { x: 112, z: -132 },
    ],
    amber: [
      { x: -42, z: 142 },
      { x: 42, z: 142 },
    ],
  },
};

export function getChallengeLayout(format: ChallengeFormat): ChallengeLayout {
  return format === 'triple' ? TRIPLE_LAYOUT : DUEL_LAYOUT;
}

const CHALLENGE_TERRAIN: TerrainProfile = {
  phaseX: 173,
  phaseZ: -291,
  heightScale: 0.34,
  riverAmplitude: 520,
  riverFrequency: 0.001,
  riverPhase: Math.PI / 2,
};

export const CHALLENGE_THEME: BattlefieldTheme = {
  id: 'urban',
  label: '트라이포인트 전선',
  description: '3분 안에 A·B·C 거점을 장악하고 100 지휘 점수를 먼저 확보하십시오.',
  palette: {
    low: 0x35423d,
    high: 0x667068,
    riverBank: 0x4d4942,
  },
  terrainProfile: CHALLENGE_TERRAIN,
  treeDensity: 0.12,
  terrainStamps: [
    { kind: 'mountain', x: 0, z: 104 },
    { kind: 'trench', x: 0, z: -88 },
  ],
  buildings: [],
  walls: [],
};

export const CHALLENGE_STRUCTURES: StructurePlan[] = [
  cityBuilding('city-west-north', -42, 27, 14, 27, 12, 0.03, 0x66747d),
  cityBuilding('city-west-south', -42, -27, 16, 21, 11, -0.04, 0x817069),
  cityBuilding('city-east-north', 42, 27, 16, 21, 11, 0.04, 0x747d72),
  cityBuilding('city-east-south', 42, -27, 14, 27, 12, -0.03, 0x756c66),
  cityBuilding('west-forward-block', -88, 58, 15, 18, 12, Math.PI / 2, 0x69747a),
  cityBuilding('east-forward-block', 88, -58, 15, 18, 12, Math.PI / 2, 0x7c7068),
  cityBuilding('west-warehouse', -92, -58, 20, 13, 14, 0.02, 0x5e6d70),
  cityBuilding('east-warehouse', 92, 58, 20, 13, 14, -0.02, 0x70665f),
  wall('azure-base-cover', -128, -22, 30, 6, 0, 0x315e9b, 'azure'),
  wall('crimson-base-cover', 128, 22, 30, 6, 0, 0x8f343c, 'crimson'),
  wall('trench-west', -24, -88, 28, 5, Math.PI / 2, 0x555f5a),
  wall('trench-east', 24, -88, 28, 5, Math.PI / 2, 0x555f5a),
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
