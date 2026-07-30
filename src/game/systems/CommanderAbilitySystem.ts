import type {
  CommanderAbilityKind,
  FactionId,
} from '../types';

export interface CommanderAbilityDefinition {
  kind: CommanderAbilityKind;
  label: string;
  cost: number;
  cooldown: number;
  description: string;
}

export interface CommanderAbilityState extends CommanderAbilityDefinition {
  remaining: number;
  ready: boolean;
}

export const COMMANDER_ABILITIES: Record<
  CommanderAbilityKind,
  CommanderAbilityDefinition
> = {
  artillery: {
    kind: 'artillery',
    label: '정밀 포격',
    cost: 90,
    cooldown: 34,
    description: '지정 지역에 5발의 포격을 순차 투하합니다.',
  },
  airstrike: {
    kind: 'airstrike',
    label: '대전차 공습',
    cost: 145,
    cooldown: 52,
    description: '진행 방향을 따라 강력한 폭격선을 만듭니다.',
  },
  reinforce: {
    kind: 'reinforce',
    label: '긴급 증원',
    cost: 110,
    cooldown: 42,
    description: '아군 거점에 보병 분대를 즉시 투입합니다.',
  },
  repair: {
    kind: 'repair',
    label: '야전 수리',
    cost: 75,
    cooldown: 38,
    description: '범위 안 아군의 체력과 손상 부품을 복구합니다.',
  },
};

export class CommanderAbilitySystem {
  private readonly cooldowns = new Map<CommanderAbilityKind, number>();

  constructor(readonly faction: FactionId) {
    for (const kind of Object.keys(COMMANDER_ABILITIES) as CommanderAbilityKind[]) {
      this.cooldowns.set(kind, 0);
    }
  }

  update(delta: number): void {
    for (const [kind, remaining] of this.cooldowns) {
      this.cooldowns.set(kind, Math.max(0, remaining - delta));
    }
  }

  canUse(kind: CommanderAbilityKind, resources: number): boolean {
    return resources >= COMMANDER_ABILITIES[kind].cost
      && (this.cooldowns.get(kind) ?? 0) <= 0;
  }

  use(kind: CommanderAbilityKind, resources: number): number | null {
    const definition = COMMANDER_ABILITIES[kind];
    if (!this.canUse(kind, resources)) {
      return null;
    }
    this.cooldowns.set(kind, definition.cooldown);
    return resources - definition.cost;
  }

  state(resources: number): CommanderAbilityState[] {
    return (Object.keys(COMMANDER_ABILITIES) as CommanderAbilityKind[]).map(
      (kind) => {
        const definition = COMMANDER_ABILITIES[kind];
        const remaining = this.cooldowns.get(kind) ?? 0;
        return {
          ...definition,
          remaining,
          ready: remaining <= 0 && resources >= definition.cost,
        };
      },
    );
  }
}
