import { Vector3 } from 'three';
import { BrickStructure } from '../entities/BrickStructure';
import { Outpost } from '../entities/Outpost';
import { Unit } from '../entities/Unit';
import { clamp } from '../math';
import { BattlefieldWorld } from '../world/BattlefieldWorld';
import { DiplomacySystem } from './DiplomacySystem';

interface UnitCollisionDependencies {
  units: readonly Unit[];
  structures: readonly BrickStructure[];
  outposts: readonly Outpost[];
  world: BattlefieldWorld;
  diplomacy: DiplomacySystem;
  detonateDrone: (drone: Unit) => void;
}

export class UnitCollisionSystem {
  private readonly crashedAircraft = new Set<Unit>();

  constructor(private readonly dependencies: UnitCollisionDependencies) {}

  update(): void {
    this.checkDroneImpactCollisions();
    this.resolveStructureCollisions();
    this.checkAircraftCollisions();
  }

  private checkDroneImpactCollisions(): void {
    const {
      units,
      structures,
      diplomacy,
      detonateDrone,
    } = this.dependencies;
    for (const drone of units) {
      if (drone.destroyed || drone.kind !== 'drone') {
        continue;
      }
      const hitHostileUnit = units.some((candidate) => (
        candidate !== drone
        && !candidate.destroyed
        && diplomacy.isHostile(drone.faction, candidate.faction)
        && this.segmentHitsUnit(
          drone.previousPosition,
          drone.position,
          candidate,
          drone.collisionRadius * 0.72,
        )
      ));
      const hitStructure = structures.some((structure) => (
        !structure.destroyed
        && structure.intersectsWorldSegment(
          drone.previousPosition,
          drone.position,
          drone.collisionRadius * 0.62,
        )
      ));
      if (hitHostileUnit || hitStructure) {
        detonateDrone(drone);
      }
    }
  }

  private segmentHitsUnit(
    from: Vector3,
    to: Vector3,
    target: Unit,
    padding: number,
  ): boolean {
    const segment = to.clone().sub(from);
    const lengthSquared = segment.lengthSq();
    const progress = lengthSquared <= 0.0001
      ? 0
      : clamp(
          target.position.clone().sub(from).dot(segment) / lengthSquared,
          0,
          1,
        );
    const closest = from.clone().addScaledVector(segment, progress);
    const radius = target.collisionRadius + padding;
    return closest.distanceToSquared(target.position) <= radius * radius;
  }

  private checkAircraftCollisions(): void {
    const { units, outposts, world } = this.dependencies;
    this.crashedAircraft.clear();
    for (const unit of units) {
      if (
        unit.destroyed
        || (unit.kind !== 'fighter' && unit.kind !== 'helicopter')
      ) {
        continue;
      }
      if (
        unit.terrainCollision
        || world.collidesWithTree(unit.position, unit.collisionRadius)
      ) {
        this.crashedAircraft.add(unit);
        continue;
      }
      if (
        outposts.some((outpost) => {
          const distanceX = unit.position.x - outpost.root.position.x;
          const distanceZ = unit.position.z - outpost.root.position.z;
          const collisionRadius = unit.collisionRadius + 1.2;
          return (
            distanceX * distanceX + distanceZ * distanceZ
              <= collisionRadius * collisionRadius
            && unit.position.y - unit.collisionRadius
              <= outpost.root.position.y + 8.4
          );
        })
      ) {
        this.crashedAircraft.add(unit);
        continue;
      }
    }
    for (const unit of this.crashedAircraft) {
      unit.applyRawDamage(unit.health, unit.faction);
    }
  }

  private resolveStructureCollisions(): void {
    for (const unit of this.dependencies.units) {
      if (unit.destroyed) {
        continue;
      }
      const padding = unit.collisionRadius
        * (unit.isAircraft ? 0.62 : 0.72);
      if (
        !this.collidesWithStructure(
          unit.previousPosition,
          unit.position,
          padding,
        )
      ) {
        continue;
      }
      if (unit.kind === 'fighter' || unit.kind === 'helicopter') {
        unit.applyRawDamage(unit.health, unit.faction);
        continue;
      }
      const attemptedPosition = unit.position.clone();
      const xMovement = unit.previousPosition.clone().setX(attemptedPosition.x);
      xMovement.y = attemptedPosition.y;
      const zMovement = unit.previousPosition.clone().setZ(attemptedPosition.z);
      zMovement.y = attemptedPosition.y;
      const verticalMovement = unit.previousPosition
        .clone()
        .setY(attemptedPosition.y);
      if (
        !this.collidesWithStructure(
          unit.previousPosition,
          xMovement,
          padding,
        )
      ) {
        unit.position.copy(xMovement);
      } else if (
        !this.collidesWithStructure(
          unit.previousPosition,
          zMovement,
          padding,
        )
      ) {
        unit.position.copy(zMovement);
      } else if (
        unit.isAircraft
        && !this.collidesWithStructure(
          unit.previousPosition,
          verticalMovement,
          padding,
        )
      ) {
        unit.position.copy(verticalMovement);
      } else {
        unit.position.copy(unit.previousPosition);
      }
      unit.stopMovement();
    }
  }

  private collidesWithStructure(
    from: Vector3,
    to: Vector3,
    padding: number,
  ): boolean {
    const travelDistance = from.distanceTo(to);
    for (const structure of this.dependencies.structures) {
      if (structure.destroyed) {
        continue;
      }
      const broadRadius = structure.collisionRadius
        + padding
        + travelDistance;
      if (
        from.distanceToSquared(structure.root.position)
          > broadRadius * broadRadius
      ) {
        continue;
      }
      if (structure.intersectsWorldSegment(from, to, padding)) {
        return true;
      }
    }
    return false;
  }
}
