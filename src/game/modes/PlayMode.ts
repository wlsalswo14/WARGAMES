import type { DeployKind, FactionId, UnitKind } from '../types';

export type PlayMode = 'challenge' | 'sandbox';
export type ChallengeFormat = 'duel' | 'triple';

export interface PlayModeConfig {
  id: PlayMode;
  activeFactions: readonly FactionId[];
  initialForce: readonly UnitKind[];
  targetUnitsPerFaction: number;
  chunkRadius: number;
  matchDuration: number | null;
  startingResources: Record<FactionId, number>;
  deploymentCosts: Partial<Record<DeployKind, number>>;
  allowedDeployments: readonly DeployKind[];
  possessionDuration: number | null;
  possessionRecharge: number;
  unlimitedDeployment: boolean;
  enableDiplomacy: boolean;
  enableFactionCycle: boolean;
  enableKillCamera: boolean;
}

const CHALLENGE_FORCE: UnitKind[] = [
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'tank',
  'tank',
  'tank',
  'drone',
  'drone',
];

const SANDBOX_FORCE: UnitKind[] = [
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'infantry',
  'tank',
  'tank',
  'tank',
  'tank',
  'drone',
  'drone',
  'helicopter',
  'fighter',
];

export const PLAY_MODE_CONFIGS: Record<PlayMode, PlayModeConfig> = {
  challenge: {
    id: 'challenge',
    activeFactions: ['azure', 'crimson'],
    initialForce: CHALLENGE_FORCE,
    targetUnitsPerFaction: CHALLENGE_FORCE.length,
    chunkRadius: 3,
    matchDuration: 7 * 60,
    startingResources: {
      azure: 320,
      crimson: 260,
      amber: 260,
    },
    deploymentCosts: {
      infantry: 45,
      tank: 110,
      drone: 65,
      fighter: 190,
      helicopter: 155,
      wall: 35,
      building: 95,
    },
    allowedDeployments: [
      'infantry',
      'tank',
      'drone',
      'fighter',
      'helicopter',
      'wall',
      'building',
    ],
    possessionDuration: 15,
    possessionRecharge: 45,
    unlimitedDeployment: false,
    enableDiplomacy: false,
    enableFactionCycle: false,
    enableKillCamera: false,
  },
  sandbox: {
    id: 'sandbox',
    activeFactions: ['azure', 'crimson', 'amber'],
    initialForce: SANDBOX_FORCE,
    targetUnitsPerFaction: SANDBOX_FORCE.length,
    chunkRadius: 3,
    matchDuration: null,
    startingResources: {
      azure: 900,
      crimson: 900,
      amber: 900,
    },
    deploymentCosts: {},
    allowedDeployments: [
      'infantry',
      'tank',
      'fighter',
      'helicopter',
      'drone',
      'wall',
      'mountain',
      'trench',
      'building',
      'tree',
    ],
    possessionDuration: null,
    possessionRecharge: 0,
    unlimitedDeployment: true,
    enableDiplomacy: true,
    enableFactionCycle: true,
    enableKillCamera: true,
  },
};

export function getRequestedPlayMode(search = window.location.search): PlayMode {
  const requested = new URLSearchParams(search).get('mode');
  return requested === 'sandbox' ? 'sandbox' : 'challenge';
}

export function getRequestedChallengeFormat(
  search = window.location.search,
): ChallengeFormat {
  const requested = new URLSearchParams(search).get('factions');
  return requested === '3' ? 'triple' : 'duel';
}

export function getChallengeFactions(
  format: ChallengeFormat,
): readonly FactionId[] {
  return format === 'triple'
    ? ['azure', 'crimson', 'amber']
    : ['azure', 'crimson'];
}
