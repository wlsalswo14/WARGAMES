import { Vector3 } from 'three';
import { FACTIONS } from '../config';
import type { FactionId } from '../types';
import type { Unit } from '../entities/Unit';
import type { Outpost } from '../entities/Outpost';
import type { DiplomacySystem } from './DiplomacySystem';

export type Strategy = 'assault' | 'capture' | 'defend' | 'air-superiority' | 'entrench';

interface CommanderState {
  strategy: Strategy;
  timer: number;
}

export class BattlefieldAI {
  private readonly commanders = new Map<FactionId, CommanderState>();
  private readonly targetSearchCooldowns = new Map<string, number>();
  private readonly objectiveAssignments = new Map<string, string>();
  private readonly scratch = new Vector3();
  private readonly onStrategy: (faction: FactionId, strategy: Strategy, reason: string) => void;
  private cacheCleanupTimer = 5;

  constructor(onStrategy: (faction: FactionId, strategy: Strategy, reason: string) => void) {
    this.onStrategy = onStrategy;
    this.commanders.set('azure', { strategy: 'capture', timer: 7 });
    this.commanders.set('crimson', { strategy: 'assault', timer: 5 });
    this.commanders.set('amber', { strategy: 'defend', timer: 8 });
  }

  update(
    delta: number,
    units: Unit[],
    outposts: Outpost[],
    diplomacy: DiplomacySystem,
    wind: Vector3,
    fire: (unit: Unit, target: Vector3) => void,
  ): void {
    this.updateCommanders(delta, units, outposts);
    const unitsById = new Map(units.map((unit) => [unit.id, unit]));
    this.cacheCleanupTimer -= delta;
    if (this.cacheCleanupTimer <= 0) {
      this.cacheCleanupTimer = 5;
      const activeIds = new Set(unitsById.keys());
      for (const unitId of this.targetSearchCooldowns.keys()) {
        if (!activeIds.has(unitId)) {
          this.targetSearchCooldowns.delete(unitId);
        }
      }
      for (const unitId of this.objectiveAssignments.keys()) {
        if (!activeIds.has(unitId)) {
          this.objectiveAssignments.delete(unitId);
        }
      }
    }
    for (const unit of units) {
      if (unit.destroyed || unit.possessed) {
        continue;
      }
      if (unit.order?.type === 'move') {
        const destination = unit.order.destination.clone();
        if (unit.isAircraft) {
          destination.y = Math.max(
            destination.y + (unit.kind === 'fighter' ? 30 : 15),
            unit.position.y,
          );
        }
        const distance = unit.steerToward(destination, delta, wind);
        if (distance < (unit.isAircraft ? 9 : 2.5)) {
          unit.order = { type: 'hold', destination: unit.order.destination.clone() };
        }
        continue;
      }
      if (unit.order?.type === 'hold') {
        if (!unit.isAircraft) {
          unit.moveGround(0, 0, delta);
          continue;
        }
      }
      let target = unit.targetId ? unitsById.get(unit.targetId) ?? null : null;
      if (target && !this.isValidCombatTarget(unit, target, diplomacy)) {
        target = null;
      }
      const searchCooldown = (this.targetSearchCooldowns.get(unit.id) ?? 0) - delta;
      if (!target && searchCooldown <= 0) {
        target = this.findCombatTarget(unit, units, diplomacy);
        const unitNumber = Number.parseInt(unit.id.split('-')[1], 10) || 0;
        this.targetSearchCooldowns.set(unit.id, 0.28 + (unitNumber % 7) * 0.035);
      } else {
        this.targetSearchCooldowns.set(unit.id, searchCooldown);
      }
      if (target) {
        unit.targetId = target.id;
        const distance = unit.position.distanceTo(target.position);
        unit.faceTarget(target.position, delta);
        if (distance <= unit.stats.range && unit.canFire()) {
          fire(unit, target.position.clone().add(new Vector3(0, target.collisionRadius * 0.45, 0)));
          continue;
        }
        const preferredRange = unit.kind === 'tank' ? unit.stats.range * 0.62 : unit.stats.range * 0.42;
        if (distance > preferredRange) {
          const destination = this.addFormationOffset(target.position.clone(), unit, 24);
          if (unit.isAircraft) {
            destination.y += unit.kind === 'fighter' ? 34 : 18;
          }
          unit.steerToward(destination, delta, wind);
        } else if (!unit.isAircraft) {
          unit.moveGround(0, 0, delta);
        }
        continue;
      }

      unit.targetId = null;
      const objective = this.findObjective(unit, outposts, diplomacy);
      if (objective) {
        this.scratch.copy(objective.root.position);
        this.addFormationOffset(this.scratch, unit, 10);
        if (unit.isAircraft) {
          this.scratch.y += unit.kind === 'fighter' ? 30 : 15;
        }
        const distance = unit.steerToward(this.scratch, delta, wind);
        if (distance < 6 && !unit.isAircraft) {
          unit.moveGround(0, 0, delta);
        }
      } else if (unit.isAircraft) {
        const patrol = new Vector3(
          Math.sin(Number.parseInt(unit.id.split('-')[1], 10) * 2.3) * 90,
          unit.kind === 'fighter' ? 42 : 18,
          Math.cos(Number.parseInt(unit.id.split('-')[1], 10) * 1.7) * 90,
        );
        unit.steerToward(patrol, delta, wind);
      } else {
        unit.moveGround(0, 0, delta);
      }
    }
  }

  getStrategy(faction: FactionId): Strategy {
    return this.commanders.get(faction)?.strategy ?? 'capture';
  }

  private updateCommanders(delta: number, units: Unit[], outposts: Outpost[]): void {
    for (const faction of Object.keys(FACTIONS) as FactionId[]) {
      const commander = this.commanders.get(faction);
      if (!commander) {
        continue;
      }
      commander.timer -= delta;
      if (commander.timer > 0) {
        continue;
      }
      commander.timer = 16 + Math.random() * 8;
      const allies = units.filter((unit) => unit.faction === faction && !unit.destroyed);
      const tanks = allies.filter((unit) => unit.kind === 'tank').length;
      const aircraft = allies.filter((unit) => unit.isAircraft).length;
      const owned = outposts.filter((outpost) => outpost.owner === faction).length;
      let next: Strategy;
      let reason: string;

      if (owned <= 1) {
        next = 'capture';
        reason = '보급 거점 열세를 감지';
      } else if (allies.length < 5) {
        next = FACTIONS[faction].doctrine === 'entrenchment' ? 'entrench' : 'defend';
        reason = '가용 전력이 위험 수준으로 감소';
      } else if (aircraft === 0 && Math.random() > 0.55) {
        next = 'air-superiority';
        reason = '상공 정찰 공백을 감지';
      } else if (tanks >= 2) {
        next = 'assault';
        reason = '기갑 전력 우세로 돌파 기회 포착';
      } else {
        next = FACTIONS[faction].doctrine === 'firepower' ? 'assault' : 'capture';
        reason = '교리에 따른 전선 재평가';
      }
      if (commander.strategy !== next) {
        commander.strategy = next;
        this.onStrategy(faction, next, reason);
      }
    }
  }

  private findCombatTarget(unit: Unit, units: Unit[], diplomacy: DiplomacySystem): Unit | null {
    let best: Unit | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of units) {
      if (
        candidate === unit
        || candidate.destroyed
        || !diplomacy.isHostile(unit.faction, candidate.faction)
      ) {
        continue;
      }
      const distanceSq = unit.position.distanceToSquared(candidate.position);
      const airPenalty = !unit.isAircraft && candidate.position.y - unit.position.y > 30 ? 2.2 : 1;
      const score = distanceSq * airPenalty;
      if (score < bestScore && score < Math.pow(unit.stats.range * 2.8, 2)) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  private isValidCombatTarget(
    unit: Unit,
    candidate: Unit,
    diplomacy: DiplomacySystem,
  ): boolean {
    return !candidate.destroyed
      && diplomacy.isHostile(unit.faction, candidate.faction)
      && unit.position.distanceToSquared(candidate.position) < Math.pow(unit.stats.range * 3.1, 2);
  }

  private findObjective(
    unit: Unit,
    outposts: Outpost[],
    diplomacy: DiplomacySystem,
  ): Outpost | null {
    const assignedId = this.objectiveAssignments.get(unit.id);
    const assigned = assignedId
      ? outposts.find((outpost) => outpost.id === assignedId) ?? null
      : null;
    if (assigned && this.isCaptureObjective(unit, assigned, diplomacy)) {
      return assigned;
    }
    this.objectiveAssignments.delete(unit.id);

    const hostileOutposts = outposts.filter((outpost) => (
      outpost.owner !== null
      && outpost.owner !== unit.faction
      && diplomacy.isHostile(unit.faction, outpost.owner)
    ));
    const neutralOutposts = outposts.filter((outpost) => outpost.owner === null);
    const candidates = hostileOutposts.length > 0 ? hostileOutposts : neutralOutposts;
    if (candidates.length === 0) {
      return null;
    }
    const ranked = candidates
      .map((outpost) => ({
        outpost,
        distance: unit.position.distanceToSquared(outpost.root.position),
      }))
      .sort((left, right) => left.distance - right.distance);
    const unitNumber = Number.parseInt(unit.id.split('-')[1], 10) || 0;
    const squadNumber = Math.floor(unitNumber / 4);
    const selectionWindow = Math.min(3, ranked.length);
    const objective = ranked[squadNumber % selectionWindow].outpost;
    this.objectiveAssignments.set(unit.id, objective.id);
    return objective;
  }

  private isCaptureObjective(
    unit: Unit,
    outpost: Outpost,
    diplomacy: DiplomacySystem,
  ): boolean {
    return outpost.owner === null
      || (
        outpost.owner !== unit.faction
        && diplomacy.isHostile(unit.faction, outpost.owner)
      );
  }

  private addFormationOffset(destination: Vector3, unit: Unit, maximumRadius: number): Vector3 {
    const unitNumber = Number.parseInt(unit.id.split('-')[1], 10) || 0;
    const angle = unitNumber * Math.PI * (3 - Math.sqrt(5));
    const radius = 4 + (unitNumber % 4) * ((maximumRadius - 4) / 3);
    destination.x += Math.cos(angle) * radius;
    destination.z += Math.sin(angle) * radius;
    return destination;
  }
}
