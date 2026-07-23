import { Vector3 } from 'three';
import { FACTIONS } from '../config';
import type { FactionId } from '../types';
import type { Unit } from '../entities/Unit';
import type { Outpost } from '../entities/Outpost';
import type { DiplomacySystem } from './DiplomacySystem';

type Strategy = 'assault' | 'capture' | 'defend' | 'air-superiority' | 'entrench';

interface CommanderState {
  strategy: Strategy;
  timer: number;
}

export class BattlefieldAI {
  private readonly commanders = new Map<FactionId, CommanderState>();
  private readonly scratch = new Vector3();
  private readonly onStrategy: (faction: FactionId, strategy: Strategy, reason: string) => void;

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
      const target = this.findCombatTarget(unit, units, diplomacy);
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
          const destination = target.position.clone();
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
      const objective = this.findObjective(unit, outposts);
      if (objective) {
        this.scratch.copy(objective.root.position);
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

  private findObjective(unit: Unit, outposts: Outpost[]): Outpost | null {
    const strategy = this.getStrategy(unit.faction);
    let best: Outpost | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const outpost of outposts) {
      const distance = unit.position.distanceToSquared(outpost.root.position);
      const ownershipMultiplier = outpost.owner === unit.faction
        ? strategy === 'defend' || strategy === 'entrench' ? 0.6 : 4
        : 1;
      const score = distance * ownershipMultiplier;
      if (score < bestScore) {
        bestScore = score;
        best = outpost;
      }
    }
    return best;
  }
}
