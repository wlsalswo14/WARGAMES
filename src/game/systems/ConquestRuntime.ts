import {
  Vector3,
} from 'three';
import { FACTIONS } from '../config';
import { terrainHeight } from '../math';
import type {
  CommanderAbilityKind,
  FactionId,
  UnitKind,
} from '../types';
import type { BrickStructure } from '../entities/BrickStructure';
import type { Outpost } from '../entities/Outpost';
import type { Unit } from '../entities/Unit';
import type { CombatSystem } from './CombatSystem';
import {
  COMMANDER_ABILITIES,
  CommanderAbilitySystem,
  type CommanderAbilityState,
} from './CommanderAbilitySystem';
import {
  ConquestSession,
  type ConquestSessionSnapshot,
} from './ConquestSession';
import {
  PlayerProgression,
  type ProgressionReward,
} from './PlayerProgression';

interface ScheduledStrike {
  faction: FactionId;
  position: Vector3;
  radius: number;
  damage: number;
  structureDamage: number;
  delay: number;
}

interface ConquestRuntimeOptions {
  duration: number;
  dominationDuration: number;
  activeFactions: readonly FactionId[];
  outpostTotal: number;
  activeFaction: FactionId;
}

interface ConquestRuntimeDependencies {
  units: Unit[];
  structures: BrickStructure[];
  outposts: Outpost[];
  resources: Map<FactionId, number>;
  combat: CombatSystem;
  progression: PlayerProgression;
  getHeading: () => number;
  spawnUnit: (
    kind: UnitKind,
    faction: FactionId,
    position: Vector3,
  ) => Unit;
  selectUnits: (units: Unit[]) => void;
  notify: (title: string, body: string, color?: string) => void;
  playCommand: () => void;
  createRepairEffect: (
    point: Vector3,
    colors: number[],
  ) => void;
}

export interface ConquestResult {
  snapshot: ConquestSessionSnapshot;
  reward: ProgressionReward;
}

export class ConquestRuntime {
  readonly session: ConquestSession;
  private readonly abilities: CommanderAbilitySystem;
  private readonly scheduledStrikes: ScheduledStrike[] = [];
  private pendingAbility: CommanderAbilityKind | null = null;
  private resultEmitted = false;

  constructor(
    private readonly options: ConquestRuntimeOptions,
    private readonly dependencies: ConquestRuntimeDependencies,
  ) {
    this.session = new ConquestSession({
      duration: options.duration,
      activeFactions: options.activeFactions,
      outpostTotal: options.outpostTotal,
      dominationDuration: options.dominationDuration,
    });
    this.abilities = new CommanderAbilitySystem(options.activeFaction);
  }

  get pending(): CommanderAbilityKind | null {
    return this.pendingAbility;
  }

  get progressionSummary(): string {
    return this.dependencies.progression.summary;
  }

  start(): void {
    this.session.start();
  }

  cancelTargeting(): void {
    this.pendingAbility = null;
  }

  abilityState(): CommanderAbilityState[] {
    return this.abilities.state(
      this.dependencies.resources.get(this.options.activeFaction) ?? 0,
    );
  }

  update(
    delta: number,
    outpostCounts: Record<FactionId, number>,
  ): ConquestResult | null {
    this.abilities.update(delta);
    this.updateScheduledStrikes(delta);
    const snapshot = this.session.update(delta, outpostCounts);
    if (!snapshot.finished || this.resultEmitted) {
      return null;
    }
    this.resultEmitted = true;
    return {
      snapshot,
      reward: this.dependencies.progression.completeConquest(snapshot),
    };
  }

  selectAbility(kind: CommanderAbilityKind): void {
    if (this.pendingAbility === kind) {
      this.pendingAbility = null;
      return;
    }
    const state = this.abilityState().find(
      (ability) => ability.kind === kind,
    );
    if (!state?.ready) {
      this.dependencies.notify(
        '지휘 능력 사용 불가',
        state && state.remaining > 0
          ? `${state.label} 재사용까지 ${state.remaining.toFixed(1)}초`
          : `${COMMANDER_ABILITIES[kind].cost} SUP가 필요합니다.`,
        '#ff746b',
      );
      return;
    }
    this.pendingAbility = kind;
    this.dependencies.notify(
      `${COMMANDER_ABILITIES[kind].label} 표적 지정`,
      COMMANDER_ABILITIES[kind].description,
      '#ffcf5d',
    );
  }

  activateAbility(
    kind: CommanderAbilityKind,
    point: Vector3,
  ): boolean {
    const {
      units,
      outposts,
      resources,
      notify,
    } = this.dependencies;
    const ownedOutpost = outposts
      .filter((outpost) => outpost.owner === this.options.activeFaction)
      .sort(
        (left, right) => (
          left.root.position.distanceToSquared(point)
          - right.root.position.distanceToSquared(point)
        ),
      )[0] ?? null;
    if (
      kind === 'reinforce'
      && (
        !ownedOutpost
        || ownedOutpost.root.position.distanceTo(point) > 72
      )
    ) {
      notify(
        '증원 지점 오류',
        '아군 거점 반경 안을 지정해야 긴급 증원을 투입할 수 있습니다.',
        '#ff746b',
      );
      return false;
    }
    const repairTargets = kind === 'repair'
      ? units.filter(
          (unit) => (
            !unit.destroyed
            && unit.faction === this.options.activeFaction
            && unit.position.distanceToSquared(point) <= 30 * 30
          ),
        )
      : [];
    if (kind === 'repair' && repairTargets.length === 0) {
      notify(
        '수리 대상 없음',
        '반경 안에 손상된 아군 유닛이 없습니다.',
        '#ffcf5d',
      );
      return false;
    }

    const balance = resources.get(this.options.activeFaction) ?? 0;
    const remaining = this.abilities.use(kind, balance);
    if (remaining === null) {
      return false;
    }
    resources.set(this.options.activeFaction, remaining);
    this.session.recordAbility(this.options.activeFaction);
    this.pendingAbility = null;

    if (kind === 'artillery') {
      this.scheduleArtillery(point);
    } else if (kind === 'airstrike') {
      this.scheduleAirstrike(point);
    } else if (kind === 'reinforce' && ownedOutpost) {
      this.deployReinforcements(ownedOutpost);
    } else if (kind === 'repair') {
      this.repairUnits(point, repairTargets);
    }
    notify(
      `${COMMANDER_ABILITIES[kind].label} 실행`,
      '지휘 자산이 작전 구역에 투입됐습니다.',
      '#ffcf5d',
    );
    this.dependencies.playCommand();
    return true;
  }

  private scheduleArtillery(point: Vector3): void {
    for (let index = 0; index < 5; index += 1) {
      const angle = index * 2.399;
      const radius = index === 0 ? 0 : 5 + index * 1.8;
      this.scheduledStrikes.push({
        faction: this.options.activeFaction,
        position: point.clone().add(
          new Vector3(
            Math.cos(angle) * radius,
            0,
            Math.sin(angle) * radius,
          ),
        ),
        radius: 9,
        damage: 210,
        structureDamage: 260,
        delay: 0.2 + index * 0.34,
      });
    }
  }

  private scheduleAirstrike(point: Vector3): void {
    const heading = this.dependencies.getHeading();
    const forward = new Vector3(
      Math.sin(heading),
      0,
      Math.cos(heading),
    );
    for (let index = 0; index < 5; index += 1) {
      this.scheduledStrikes.push({
        faction: this.options.activeFaction,
        position: point.clone().addScaledVector(
          forward,
          (index - 2) * 13,
        ),
        radius: 12,
        damage: 340,
        structureDamage: 560,
        delay: 0.15 + index * 0.18,
      });
    }
  }

  private deployReinforcements(outpost: Outpost): void {
    const spawned: Unit[] = [];
    for (let index = 0; index < 5; index += 1) {
      const angle = index / 5 * Math.PI * 2;
      const spawn = outpost.root.position.clone().add(
        new Vector3(Math.cos(angle) * 11, 0, Math.sin(angle) * 11),
      );
      spawned.push(
        this.dependencies.spawnUnit(
          index === 0 ? 'general' : 'infantry',
          this.options.activeFaction,
          spawn,
        ),
      );
    }
    this.dependencies.selectUnits(spawned);
  }

  private repairUnits(point: Vector3, targets: Unit[]): void {
    let repaired = 0;
    for (const unit of targets) {
      repaired += unit.repair(unit.stats.maxHealth * 0.58);
    }
    this.dependencies.createRepairEffect(
      point.clone().add(new Vector3(0, 3, 0)),
      [FACTIONS[this.options.activeFaction].color, 0x8effd2, 0xffffff],
    );
    this.dependencies.notify(
      '야전 수리 완료',
      `${targets.length}개 유닛 · 체력 ${Math.round(repaired)} 복구`,
      '#70e1a1',
    );
  }

  private updateScheduledStrikes(delta: number): void {
    for (
      let index = this.scheduledStrikes.length - 1;
      index >= 0;
      index -= 1
    ) {
      const strike = this.scheduledStrikes[index];
      strike.delay -= delta;
      if (strike.delay > 0) {
        continue;
      }
      strike.position.y = terrainHeight(
        strike.position.x,
        strike.position.z,
      ) + 0.2;
      this.dependencies.combat.strikeArea(
        strike.position,
        strike.radius,
        strike.damage,
        strike.structureDamage,
        this.dependencies.units,
        this.dependencies.structures,
        strike.faction,
      );
      this.scheduledStrikes.splice(index, 1);
    }
  }
}
