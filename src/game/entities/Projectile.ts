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
const tankShellMaterial = new MeshBasicMaterial({ color: 0xff7a32 });
const fighterMissileMaterial = new MeshBasicMaterial({ color: 0x8fe9ff });
const helicopterRocketMaterial = new MeshBasicMaterial({ color: 0xffc04f });

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
    const specialMaterial = source.kind === 'fighter'
      ? fighterMissileMaterial
      : source.kind === 'helicopter'
        ? helicopterRocketMaterial
        : tankShellMaterial;
    this.mesh = new Mesh(
      attackMode === 'special' ? specialProjectileGeometry : normalProjectileGeometry,
      attackMode === 'special' ? specialMaterial : bulletMaterial,
    );
    if (attackMode === 'special') {
      const length = source.kind === 'fighter'
        ? 4.4
        : source.kind === 'helicopter'
          ? 3.6
          : 2.8;
      this.mesh.scale.set(0.82, 0.82, length);
    } else {
      this.mesh.scale.z = 4.2;
    }
    this.mesh.position.copy(position);
    this.velocity = direction.normalize().multiplyScalar(weapon.projectileSpeed);
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
