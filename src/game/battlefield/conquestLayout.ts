import type { TerrainProfile } from '../math';
import type { BattlefieldTheme } from './themes';
import type { ChallengeLayout } from './challengeLayout';
import type { StructurePlan } from './structurePlans';

export interface ConquestBattlefield {
  layout: ChallengeLayout;
  theme: BattlefieldTheme;
  structures: StructurePlan[];
}

const CONQUEST_LAYOUT: ChallengeLayout = {
  outposts: [
    { x: -122, z: -126, owner: null, label: 'A' },
    { x: 0, z: -142, owner: null, label: 'B' },
    { x: 122, z: -126, owner: null, label: 'C' },
    { x: 0, z: 0, owner: null, label: 'D' },
    { x: -122, z: 126, owner: null, label: 'E' },
    { x: 0, z: 142, owner: null, label: 'F' },
    { x: 122, z: 126, owner: null, label: 'G' },
  ],
  bases: {
    azure: { x: -286, z: 0, yaw: Math.PI / 2 },
    crimson: { x: 286, z: 0, yaw: -Math.PI / 2 },
    amber: { x: 0, z: 350, yaw: Math.PI },
  },
  staging: {
    azure: [
      { x: -236, z: -84 },
      { x: -236, z: 84 },
      { x: -196, z: 0 },
    ],
    crimson: [
      { x: 236, z: -84 },
      { x: 236, z: 84 },
      { x: 196, z: 0 },
    ],
    amber: [],
  },
};

const CONQUEST_TERRAIN: TerrainProfile = {
  phaseX: 311,
  phaseZ: -157,
  heightScale: 0.46,
  riverAmplitude: 510,
  riverFrequency: 0.001,
  riverPhase: Math.PI / 2,
};

const CONQUEST_THEME: BattlefieldTheme = {
  id: 'urban',
  label: '세븐 프론트 전역',
  description: '도시, 참호, 고지대가 연결된 7개 거점 전장에서 생산망과 지휘 능력을 운용하십시오.',
  palette: {
    low: 0x35433d,
    high: 0x697268,
    riverBank: 0x504941,
  },
  terrainProfile: CONQUEST_TERRAIN,
  treeDensity: 0.32,
  terrainStamps: [
    { kind: 'mountain', x: -88, z: -205 },
    { kind: 'mountain', x: 92, z: 208 },
    { kind: 'mountain', x: -166, z: 64 },
    { kind: 'mountain', x: 166, z: -64 },
    { kind: 'trench', x: -166, z: -126 },
    { kind: 'trench', x: -122, z: -126 },
    { kind: 'trench', x: -78, z: -126 },
    { kind: 'trench', x: 78, z: 126 },
    { kind: 'trench', x: 122, z: 126 },
    { kind: 'trench', x: 166, z: 126 },
    { kind: 'trench', x: -46, z: 0 },
    { kind: 'trench', x: 46, z: 0 },
    { kind: 'trench', x: 0, z: -70 },
    { kind: 'trench', x: 0, z: 70 },
  ],
  buildings: [],
  walls: [],
};

function building(
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
  yaw: number,
): StructurePlan {
  return {
    id,
    kind: 'wall',
    x,
    z,
    width,
    height: 7,
    depth: 1,
    yaw,
    color: 0x626a68,
    openCenter: false,
  };
}

const CONQUEST_STRUCTURES: StructurePlan[] = [
  building('central-tower-west', -34, -32, 18, 48, 16, 0.05, 0x647078),
  building('central-tower-east', 38, 34, 20, 56, 17, -0.05, 0x716a64),
  building('central-office-north', -36, 43, 28, 34, 17, Math.PI / 2, 0x657069),
  building('central-office-south', 38, -45, 28, 38, 17, Math.PI / 2, 0x746b64),
  building('northwest-block-a', -166, -178, 22, 38, 18, 0.08, 0x6d7476),
  building('northwest-block-b', -86, -178, 18, 44, 20, -0.08, 0x766b63),
  building('north-center-block', 0, -202, 34, 32, 18, 0, 0x65716f),
  building('northeast-block-a', 166, -178, 22, 42, 18, -0.08, 0x74706b),
  building('northeast-block-b', 86, -178, 18, 36, 20, 0.08, 0x687278),
  building('southwest-block-a', -166, 178, 22, 42, 18, -0.08, 0x6b7472),
  building('southwest-block-b', -86, 178, 18, 36, 20, 0.08, 0x746962),
  building('south-center-block', 0, 202, 34, 34, 18, 0, 0x68716c),
  building('southeast-block-a', 166, 178, 22, 38, 18, 0.08, 0x707477),
  building('southeast-block-b', 86, 178, 18, 44, 20, -0.08, 0x766b64),
  building('west-station', -206, -32, 32, 26, 18, Math.PI / 2, 0x626f76),
  building('west-housing', -206, 54, 24, 40, 19, Math.PI / 2, 0x756d65),
  building('east-station', 206, 32, 32, 26, 18, Math.PI / 2, 0x68747a),
  building('east-housing', 206, -54, 24, 40, 19, Math.PI / 2, 0x766c65),
  wall('trench-wall-a1', -122, -151, 48, 0),
  wall('trench-wall-a2', -151, -126, 44, Math.PI / 2),
  wall('trench-wall-c1', 122, -151, 48, 0),
  wall('trench-wall-c2', 151, -126, 44, Math.PI / 2),
  wall('trench-wall-e1', -122, 151, 48, 0),
  wall('trench-wall-e2', -151, 126, 44, Math.PI / 2),
  wall('trench-wall-g1', 122, 151, 48, 0),
  wall('trench-wall-g2', 151, 126, 44, Math.PI / 2),
];

export function getConquestBattlefield(): ConquestBattlefield {
  return {
    layout: CONQUEST_LAYOUT,
    theme: CONQUEST_THEME,
    structures: CONQUEST_STRUCTURES,
  };
}
