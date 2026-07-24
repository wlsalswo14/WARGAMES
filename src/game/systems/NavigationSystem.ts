import { Vector3 } from 'three';
import type { BrickStructure } from '../entities/BrickStructure';
import type { Unit } from '../entities/Unit';

interface MovementProgress {
  lastPosition: Vector3;
  lastYaw: number;
  stationaryTime: number;
  escapeTarget: Vector3 | null;
  escapeTime: number;
}

export class NavigationSystem {
  private readonly progress = new Map<string, MovementProgress>();
  private readonly routeDirection = new Vector3();
  private readonly structureOffset = new Vector3();

  steer(
    unit: Unit,
    destination: Vector3,
    delta: number,
    wind: Vector3,
    structures: BrickStructure[],
  ): number {
    const directDistance = unit.position.distanceTo(destination);
    const progress = this.getProgress(unit);
    this.updateProgress(unit, progress, directDistance, delta);

    let steeringTarget = destination;
    if (progress.escapeTarget && progress.escapeTime > 0) {
      progress.escapeTime -= delta;
      if (unit.position.distanceToSquared(progress.escapeTarget) > 3 * 3) {
        steeringTarget = progress.escapeTarget;
      } else {
        progress.escapeTarget = null;
      }
    } else {
      progress.escapeTarget = null;
      const detour = this.findDetour(unit, destination, structures);
      if (detour) {
        steeringTarget = detour;
      }
    }

    if (
      progress.stationaryTime >= 1.35
      && directDistance > Math.max(8, unit.collisionRadius * 3)
    ) {
      progress.stationaryTime = 0;
      progress.escapeTime = 1.6;
      progress.escapeTarget = this.createEscapeTarget(unit, destination);
      steeringTarget = progress.escapeTarget;
    }
    unit.steerToward(steeringTarget, delta, wind);
    return directDistance;
  }

  cleanup(activeUnitIds: Set<string>): void {
    for (const unitId of this.progress.keys()) {
      if (!activeUnitIds.has(unitId)) {
        this.progress.delete(unitId);
      }
    }
  }

  private getProgress(unit: Unit): MovementProgress {
    const existing = this.progress.get(unit.id);
    if (existing) {
      return existing;
    }
    const created: MovementProgress = {
      lastPosition: unit.position.clone(),
      lastYaw: unit.yaw,
      stationaryTime: 0,
      escapeTarget: null,
      escapeTime: 0,
    };
    this.progress.set(unit.id, created);
    return created;
  }

  private updateProgress(
    unit: Unit,
    progress: MovementProgress,
    directDistance: number,
    delta: number,
  ): void {
    const movement = unit.position.distanceTo(progress.lastPosition);
    const rotation = Math.abs(unit.yaw - progress.lastYaw);
    if (
      movement < Math.max(0.025, unit.stats.speed * delta * 0.035)
      && rotation < 0.02
      && directDistance > Math.max(8, unit.collisionRadius * 3)
    ) {
      progress.stationaryTime += delta;
    } else {
      progress.stationaryTime = Math.max(0, progress.stationaryTime - delta * 2);
    }
    progress.lastPosition.copy(unit.position);
    progress.lastYaw = unit.yaw;
  }

  private findDetour(
    unit: Unit,
    destination: Vector3,
    structures: BrickStructure[],
  ): Vector3 | null {
    const padding = unit.collisionRadius * 0.76 + 1.4;
    const unitNumber = Number.parseInt(unit.id.split('-')[1], 10) || 0;
    const sidePreference = unitNumber % 2 === 0 ? 1 : -1;
    let closestDetour: Vector3 | null = null;
    let closestProgress = Number.POSITIVE_INFINITY;
    this.routeDirection.copy(destination).sub(unit.position);
    const routeLengthSquared = Math.max(
      1,
      this.routeDirection.lengthSq(),
    );

    for (const structure of structures) {
      if (structure.destroyed) {
        continue;
      }
      const detour = structure.findNavigationDetour(
        unit.position,
        destination,
        padding,
        sidePreference,
      );
      if (!detour) {
        continue;
      }
      this.structureOffset.copy(structure.root.position).sub(unit.position);
      const routeProgress = this.structureOffset.dot(this.routeDirection)
        / routeLengthSquared;
      if (routeProgress >= -0.05 && routeProgress < closestProgress) {
        closestProgress = routeProgress;
        closestDetour = detour;
      }
    }
    return closestDetour;
  }

  private createEscapeTarget(unit: Unit, destination: Vector3): Vector3 {
    const forward = destination.clone().sub(unit.position);
    forward.y = 0;
    if (forward.lengthSq() < 0.01) {
      forward.set(Math.sin(unit.yaw), 0, Math.cos(unit.yaw));
    } else {
      forward.normalize();
    }
    const unitNumber = Number.parseInt(unit.id.split('-')[1], 10) || 0;
    const side = unitNumber % 2 === 0 ? 1 : -1;
    const lateral = new Vector3(forward.z, 0, -forward.x).multiplyScalar(
      side * Math.max(8, unit.collisionRadius * 3.5),
    );
    return unit.position.clone()
      .addScaledVector(forward, 4)
      .add(lateral);
  }
}
