import {
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type {
  FactionId,
  ProjectileAttackMode,
  WeaponStats,
} from '../types';
import type { Unit } from './Unit';

let nextProjectileId = 1;

const normalProjectileGeometry = new SphereGeometry(0.13, 7, 5);
const specialProjectileGeometry = new SphereGeometry(0.48, 9, 6);
const bulletMaterial = new MeshBasicMaterial({ color: 0xfff2b8 });
const specialMaterial = new MeshBasicMaterial({ color: 0xff7a32 });

export class Projectile {
  readonly id = `projectile-${nextProjectileId++}`;
  readonly mesh: Mesh;
  readonly sourceId: string;
  readonly faction: FactionId;
  readonly attackMode: ProjectileAttackMode;
  readonly playerControlled: boolean;
  readonly velocity: Vector3;
  readonly damage: number;
  readonly penetration: number;
  readonly blastRadius: number;
  readonly destroysStructures: boolean;
  life: number;
  alive = true;
  private readonly lookTarget = new Vector3();

  constructor(
    source: Unit,
    position: Vector3,
    direction: Vector3,
    attackMode: ProjectileAttackMode,
    weapon: WeaponStats,
  ) {
    this.sourceId = source.id;
    this.faction = source.faction;
    this.attackMode = attackMode;
    this.playerControlled = source.possessed;
    this.damage = weapon.damage;
    this.penetration = weapon.penetration;
    this.blastRadius = weapon.blastRadius;
    this.destroysStructures = weapon.destroysStructures;
    this.life = attackMode === 'special' ? 6 : source.kind === 'fighter' ? 3 : 4.5;
    this.mesh = new Mesh(
      attackMode === 'special' ? specialProjectileGeometry : normalProjectileGeometry,
      attackMode === 'special' ? specialMaterial : bulletMaterial,
    );
    this.mesh.scale.z = attackMode === 'special' ? 2.8 : 4.2;
    this.mesh.position.copy(position);
    this.velocity = direction.normalize().multiplyScalar(weapon.projectileSpeed);
    this.velocity.addScaledVector(source.velocity, 0.45);
  }

  update(delta: number): void {
    if (!this.alive) {
      return;
    }
    this.life -= delta;
    this.mesh.position.addScaledVector(this.velocity, delta);
    this.mesh.lookAt(this.lookTarget.copy(this.mesh.position).add(this.velocity));
    if (this.life <= 0) {
      this.alive = false;
    }
  }
}
