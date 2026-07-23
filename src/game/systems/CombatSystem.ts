import {
  AdditiveBlending,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  getDroneSuicideStats,
  getWeaponStats,
  WORLD,
} from '../config';
import { terrainHeight } from '../math';
import type {
  FactionId,
  ProjectileAttackMode,
} from '../types';
import type { BrickStructure } from '../entities/BrickStructure';
import { Projectile } from '../entities/Projectile';
import type { Unit } from '../entities/Unit';

interface ImpactEffect {
  mesh: Mesh;
  life: number;
  duration: number;
}

export interface CombatKillEvent {
  victim: Unit;
  attackerFaction: FactionId;
  attackerUnit: Unit | null;
  playerControlled: boolean;
}

export class CombatSystem {
  readonly projectiles: Projectile[] = [];
  private readonly effects: ImpactEffect[] = [];
  private readonly impactGeometry = new SphereGeometry(1, 10, 7);
  private readonly scene: Scene;
  private readonly onDestroyed: (event: CombatKillEvent) => void;
  private readonly onPossessedDamage: (damage: number) => void;
  private readonly onExplosion: (position: Vector3, radius: number) => void;

  constructor(
    scene: Scene,
    onDestroyed: (event: CombatKillEvent) => void,
    onPossessedDamage: (damage: number) => void,
    onExplosion: (position: Vector3, radius: number) => void,
  ) {
    this.scene = scene;
    this.onDestroyed = onDestroyed;
    this.onPossessedDamage = onPossessedDamage;
    this.onExplosion = onExplosion;
  }

  fire(
    unit: Unit,
    target?: Vector3,
    attackMode: ProjectileAttackMode = 'normal',
  ): boolean {
    const weapon = getWeaponStats(unit.kind, attackMode);
    if (
      !weapon
      || !unit.canFire(attackMode)
      || this.projectiles.length >= WORLD.maxProjectiles
    ) {
      return false;
    }
    unit.faceTarget(target ?? unit.position.clone().add(unit.getFireDirection().multiplyScalar(100)), 0.16);
    const position = unit.getMuzzlePosition(target);
    const direction = unit.getFireDirection(target);
    const projectile = new Projectile(unit, position, direction, attackMode, weapon);
    this.projectiles.push(projectile);
    this.scene.add(projectile.mesh);
    unit.markFired(attackMode, weapon.reload);
    return true;
  }

  detonateDrone(
    unit: Unit,
    units: Unit[],
    structures: BrickStructure[],
  ): boolean {
    if (unit.kind !== 'drone' || !unit.canFire('suicide')) {
      return false;
    }
    const weapon = getDroneSuicideStats();
    const position = unit.position.clone();
    const playerControlled = unit.possessed;
    unit.markFired('suicide', weapon.reload);
    unit.applyRawDamage(unit.health, unit.faction);
    this.onDestroyed({
      victim: unit,
      attackerFaction: unit.faction,
      attackerUnit: unit,
      playerControlled,
    });
    const structureRadius = weapon.blastRadius + 12;
    for (const structure of structures) {
      if (
        structure.destroyed
        || structure.root.position.distanceToSquared(position) > structureRadius * structureRadius
      ) {
        continue;
      }
      structure.destroyAll(new Vector3(0, 8, 0));
    }
    this.explode(
      position,
      weapon.blastRadius,
      weapon.damage,
      units,
      unit.faction,
      unit.id,
      playerControlled,
    );
    return true;
  }

  update(
    delta: number,
    units: Unit[],
    structures: BrickStructure[],
  ): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      projectile.update(delta);
      if (projectile.alive) {
        this.checkUnitHit(projectile, units);
      }
      if (projectile.alive) {
        this.checkStructureHit(projectile, structures, units);
      }
      if (
        projectile.alive
        && projectile.mesh.position.y <= terrainHeight(projectile.mesh.position.x, projectile.mesh.position.z) + 0.08
      ) {
        projectile.alive = false;
        this.createImpact(
          projectile.mesh.position,
          projectile.damage > 80 ? 0xff7c31 : 0xffd585,
          projectile.damage > 80 ? 3.2 : 0.65,
        );
        if (projectile.damage > 25) {
          this.onExplosion(
            projectile.mesh.position.clone(),
            Math.max(3.5, projectile.blastRadius),
          );
        }
      }
      if (!projectile.alive) {
        this.scene.remove(projectile.mesh);
        this.projectiles.splice(index, 1);
      }
    }

    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.life -= delta;
      const progress = 1 - effect.life / effect.duration;
      effect.mesh.scale.setScalar(1 + progress * 3.5);
      const material = effect.mesh.material as MeshBasicMaterial;
      material.opacity = Math.max(0, 1 - progress);
      if (effect.life <= 0) {
        this.scene.remove(effect.mesh);
        material.dispose();
        this.effects.splice(index, 1);
      }
    }
  }

  private checkUnitHit(projectile: Projectile, units: Unit[]): void {
    for (const unit of units) {
      if (unit.destroyed || unit.id === projectile.sourceId) {
        continue;
      }
      if (unit.position.distanceToSquared(projectile.mesh.position) > Math.pow(unit.collisionRadius + 0.45, 2)) {
        continue;
      }
      const wasDestroyed = unit.destroyed;
      const result = unit.takeHit(
        projectile.damage,
        projectile.penetration,
        projectile.velocity.clone().multiplyScalar(-1),
        projectile.faction,
      );
      projectile.alive = false;
      const color = result.ricochet ? 0xd6edff : result.penetrated ? 0xff632f : 0xffd276;
      this.createImpact(projectile.mesh.position, color, result.ricochet ? 0.7 : 1.4);
      if (unit.possessed && result.damage > 0) {
        this.onPossessedDamage(result.damage / unit.stats.maxHealth);
      }
      if (!wasDestroyed && result.destroyed) {
        this.onDestroyed({
          victim: unit,
          attackerFaction: projectile.faction,
          attackerUnit: units.find((candidate) => candidate.id === projectile.sourceId) ?? null,
          playerControlled: projectile.playerControlled,
        });
        this.explode(
          projectile.mesh.position,
          projectile.blastRadius + 2,
          projectile.damage * 0.3,
          units,
          projectile.faction,
          projectile.sourceId,
          projectile.playerControlled,
        );
      } else if (projectile.blastRadius > 1) {
        this.explode(
          projectile.mesh.position,
          projectile.blastRadius,
          projectile.damage * 0.25,
          units,
          projectile.faction,
          projectile.sourceId,
          projectile.playerControlled,
        );
      }
      return;
    }
  }

  private checkStructureHit(
    projectile: Projectile,
    structures: BrickStructure[],
    units: Unit[],
  ): void {
    for (const structure of structures) {
      if (structure.destroyed || structure.root.position.distanceToSquared(projectile.mesh.position) > 28 * 28) {
        continue;
      }
      if (!structure.containsWorldPoint(
        projectile.mesh.position,
        projectile.destroysStructures ? 2.5 : 1.2,
      )) {
        continue;
      }
      const impulse = projectile.velocity.clone().normalize().multiplyScalar(projectile.damage * 0.055);
      const destroyedBricks = projectile.destroysStructures
        ? structure.destroyAll(impulse)
        : structure.damageAt(
            projectile.mesh.position,
            Math.max(1.2, projectile.blastRadius),
            projectile.damage,
            impulse,
          );
      if (destroyedBricks <= 0) {
        continue;
      }
      projectile.alive = false;
      this.createImpact(projectile.mesh.position, 0xff9f4b, 1.8 + destroyedBricks * 0.14);
      this.onExplosion(
        projectile.mesh.position.clone(),
        Math.max(3, projectile.blastRadius + destroyedBricks * 0.18),
      );
      if (destroyedBricks >= 5) {
        this.explode(
          projectile.mesh.position,
          Math.min(9, 3 + destroyedBricks * 0.32),
          destroyedBricks * 3,
          units,
          projectile.faction,
          projectile.sourceId,
          projectile.playerControlled,
        );
      }
      return;
    }
  }

  private explode(
    position: Vector3,
    radius: number,
    damage: number,
    units: Unit[],
    attacker: FactionId,
    sourceId: string,
    playerControlled: boolean,
  ): void {
    this.createImpact(position, 0xff712c, Math.max(1, radius * 0.55));
    this.onExplosion(position.clone(), radius);
    for (const unit of units) {
      if (unit.destroyed) {
        continue;
      }
      const distance = unit.position.distanceTo(position);
      if (distance >= radius) {
        continue;
      }
      const scaledDamage = damage * (1 - distance / radius);
      const wasDestroyed = unit.destroyed;
      unit.applyRawDamage(scaledDamage, attacker);
      const push = unit.position.clone().sub(position).normalize().multiplyScalar((radius - distance) * 0.5);
      unit.velocity.add(push);
      if (unit.possessed) {
        this.onPossessedDamage(scaledDamage / unit.stats.maxHealth);
      }
      if (!wasDestroyed && unit.destroyed) {
        this.onDestroyed({
          victim: unit,
          attackerFaction: attacker,
          attackerUnit: units.find((candidate) => candidate.id === sourceId) ?? null,
          playerControlled,
        });
      }
    }
  }

  private createImpact(position: Vector3, color: number, size: number): void {
    const mesh = new Mesh(
      this.impactGeometry,
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    mesh.scale.setScalar(size);
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.effects.push({ mesh, life: 0.35, duration: 0.35 });
  }
}
