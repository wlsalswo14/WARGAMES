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

export type ChallengeBattlefieldId = 'urban' | 'ridge' | 'trenches';

export interface ChallengeBattlefield {
  id: ChallengeBattlefieldId;
  layout: ChallengeLayout;
  theme: BattlefieldTheme;
  structures: StructurePlan[];
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

const RIDGE_DUEL_LAYOUT: ChallengeLayout = {
  ...DUEL_LAYOUT,
  outposts: [
    { x: -20, z: -94, owner: null, label: 'A' },
    { x: 24, z: 0, owner: null, label: 'B' },
    { x: -20, z: 94, owner: null, label: 'C' },
  ],
};

const RIDGE_TRIPLE_LAYOUT: ChallengeLayout = {
  ...TRIPLE_LAYOUT,
  outposts: [
    { x: -70, z: -24, owner: null, label: 'A' },
    { x: 70, z: -24, owner: null, label: 'B' },
    { x: 0, z: 78, owner: null, label: 'C' },
  ],
};

const TRENCH_DUEL_LAYOUT: ChallengeLayout = {
  ...DUEL_LAYOUT,
  outposts: [
    { x: -22, z: -82, owner: null, label: 'A' },
    { x: 0, z: 0, owner: null, label: 'B' },
    { x: 22, z: 82, owner: null, label: 'C' },
  ],
};

const TRENCH_TRIPLE_LAYOUT: ChallengeLayout = {
  ...TRIPLE_LAYOUT,
  outposts: [
    { x: -54, z: -46, owner: null, label: 'A' },
    { x: 54, z: -46, owner: null, label: 'B' },
    { x: 0, z: 72, owner: null, label: 'C' },
  ],
};

const CHALLENGE_TERRAIN: TerrainProfile = {
  phaseX: 173,
  phaseZ: -291,
  heightScale: 0.34,
  riverAmplitude: 520,
  riverFrequency: 0.001,
  riverPhase: Math.PI / 2,
};

const CHALLENGE_THEME: BattlefieldTheme = {
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

const RIDGE_THEME: BattlefieldTheme = {
  id: 'mountains',
  label: '쌍능선 교전지',
  description: '엇갈린 능선과 고지대 사이에서 세 거점의 시야 우세를 확보하십시오.',
  palette: {
    low: 0x34463a,
    high: 0x777965,
    riverBank: 0x51493d,
  },
  terrainProfile: {
    phaseX: -241,
    phaseZ: 137,
    heightScale: 0.58,
    riverAmplitude: 520,
    riverFrequency: 0.001,
    riverPhase: Math.PI / 2,
  },
  treeDensity: 0.38,
  terrainStamps: [
    { kind: 'mountain', x: -34, z: -118 },
    { kind: 'mountain', x: 34, z: 118 },
    { kind: 'trench', x: 18, z: 0 },
  ],
  buildings: [],
  walls: [],
};

const TRENCH_THEME: BattlefieldTheme = {
  id: 'trenches',
  label: '종심 참호선',
  description: '여러 겹의 참호와 방벽을 돌파하며 A·B·C 전선을 연결하십시오.',
  palette: {
    low: 0x4c4934,
    high: 0x777158,
    riverBank: 0x4a4032,
  },
  terrainProfile: {
    phaseX: 91,
    phaseZ: -183,
    heightScale: 0.26,
    riverAmplitude: 520,
    riverFrequency: 0.001,
    riverPhase: Math.PI / 2,
  },
  treeDensity: 0.08,
  terrainStamps: [
    { kind: 'trench', x: -20, z: -82 },
    { kind: 'trench', x: 0, z: 0 },
    { kind: 'trench', x: 20, z: 82 },
  ],
  buildings: [],
  walls: [],
};

const CHALLENGE_STRUCTURES: StructurePlan[] = [
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

const RIDGE_STRUCTURES: StructurePlan[] = [
  cityBuilding('ridge-west-bunker', -58, -38, 14, 14, 12, 0.08, 0x66716a),
  cityBuilding('ridge-east-bunker', 58, 38, 14, 14, 12, -0.08, 0x706d63),
  cityBuilding('ridge-north-watch', -24, 70, 11, 22, 10, 0.12, 0x6f766f),
  cityBuilding('ridge-south-watch', 24, -70, 11, 22, 10, -0.12, 0x676f72),
  wall('ridge-west-cover', -96, 26, 26, 6, 0.16, 0x315e9b, 'azure'),
  wall('ridge-east-cover', 96, -26, 26, 6, -0.16, 0x8f343c, 'crimson'),
  wall('ridge-center-north', -18, 32, 24, 5, Math.PI / 2, 0x5a635b),
  wall('ridge-center-south', 18, -32, 24, 5, Math.PI / 2, 0x5a635b),
];

const TRENCH_STRUCTURES: StructurePlan[] = [
  cityBuilding('trench-west-command', -82, 52, 16, 18, 13, 0, 0x666d65),
  cityBuilding('trench-east-command', 82, -52, 16, 18, 13, 0, 0x706860),
  wall('trench-line-a-west', -34, -82, 42, 5, Math.PI / 2, 0x555348),
  wall('trench-line-a-east', 20, -82, 30, 5, Math.PI / 2, 0x555348),
  wall('trench-line-b-west', -36, 0, 34, 5, Math.PI / 2, 0x5d5a4d),
  wall('trench-line-b-east', 36, 0, 34, 5, Math.PI / 2, 0x5d5a4d),
  wall('trench-line-c-west', -20, 82, 30, 5, Math.PI / 2, 0x555348),
  wall('trench-line-c-east', 34, 82, 42, 5, Math.PI / 2, 0x555348),
  wall('trench-azure-cover', -128, 18, 30, 6, 0, 0x315e9b, 'azure'),
  wall('trench-crimson-cover', 128, -18, 30, 6, 0, 0x8f343c, 'crimson'),
];

interface ChallengeVariant {
  id: ChallengeBattlefieldId;
  duelLayout: ChallengeLayout;
  tripleLayout: ChallengeLayout;
  theme: BattlefieldTheme;
  structures: StructurePlan[];
}

const CHALLENGE_VARIANTS: ChallengeVariant[] = [
  {
    id: 'urban',
    duelLayout: DUEL_LAYOUT,
    tripleLayout: TRIPLE_LAYOUT,
    theme: CHALLENGE_THEME,
    structures: CHALLENGE_STRUCTURES,
  },
  {
    id: 'ridge',
    duelLayout: RIDGE_DUEL_LAYOUT,
    tripleLayout: RIDGE_TRIPLE_LAYOUT,
    theme: RIDGE_THEME,
    structures: RIDGE_STRUCTURES,
  },
  {
    id: 'trenches',
    duelLayout: TRENCH_DUEL_LAYOUT,
    tripleLayout: TRENCH_TRIPLE_LAYOUT,
    theme: TRENCH_THEME,
    structures: TRENCH_STRUCTURES,
  },
];

export function getChallengeBattlefield(
  format: ChallengeFormat,
  requestedId: string | null = null,
  roll = Math.random(),
): ChallengeBattlefield {
  const requested = CHALLENGE_VARIANTS.find(
    (variant) => variant.id === requestedId,
  );
  const selected = requested
    ?? CHALLENGE_VARIANTS[
      Math.min(
        CHALLENGE_VARIANTS.length - 1,
        Math.floor(roll * CHALLENGE_VARIANTS.length),
      )
    ];
  return {
    id: selected.id,
    layout: format === 'triple'
      ? selected.tripleLayout
      : selected.duelLayout,
    theme: selected.theme,
    structures: selected.structures,
  };
}

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
