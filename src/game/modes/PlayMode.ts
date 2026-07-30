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
  'general',
  'tank',
  'tank',
  'drone',
  'drone',
  'helicopter',
  'fighter',
];

const SANDBOX_FORCE: UnitKind[] = [
  'infantry',
  'general',
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
    chunkRadius: 2,
    matchDuration: 3 * 60,
    startingResources: {
      azure: 180,
      crimson: 180,
      amber: 180,
    },
    deploymentCosts: {
      infantry: 35,
      tank: 90,
      drone: 55,
      helicopter: 110,
      fighter: 120,
      factory: 100,
    },
    allowedDeployments: ['factory'],
    possessionDuration: null,
    possessionRecharge: 0,
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
      'factory',
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
