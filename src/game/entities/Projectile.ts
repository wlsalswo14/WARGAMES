import {
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { WORLD } from '../config';
import type { FactionId } from '../types';
import type { Unit } from './Unit';

let nextProjectileId = 1;

export class Projectile {
  readonly id = `projectile-${nextProjectileId++}`;
  readonly mesh: Mesh;
  readonly sourceId: string;
  readonly faction: FactionId;
  readonly playerControlled: boolean;
  readonly velocity: Vector3;
  readonly damage: number;
  readonly penetration: number;
  readonly blastRadius: number;
  life: number;
  alive = true;

  constructor(source: Unit, position: Vector3, direction: Vector3) {
    this.sourceId = source.id;
    this.faction = source.faction;
    this.playerControlled = source.possessed;
    this.damage = source.stats.damage;
    this.penetration = source.kind === 'tank' ? 105 : source.kind === 'fighter' ? 28 : 12;
    this.blastRadius = source.kind === 'tank' ? 5.8 : source.kind === 'drone' ? 3.4 : 0.8;
    this.life = source.kind === 'fighter' ? 3 : 4.5;
    const radius = source.kind === 'tank'
      ? 0.36
      : source.kind === 'drone'
        ? 0.24
        : source.kind === 'fighter' || source.kind === 'helicopter'
          ? 0.17
          : 0.13;
    this.mesh = new Mesh(
      new SphereGeometry(radius, 7, 5),
      new MeshBasicMaterial({
        color: source.kind === 'tank' ? 0xffd887 : 0xfff2b8,
      }),
    );
    this.mesh.scale.z = source.kind === 'tank' ? 2.8 : 4.2;
    this.mesh.position.copy(position);
    this.velocity = direction.normalize().multiplyScalar(source.stats.projectileSpeed);
    this.velocity.addScaledVector(source.velocity, 0.45);
  }

  update(delta: number, wind: Vector3): void {
    if (!this.alive) {
      return;
    }
    this.life -= delta;
    const ballisticScale = this.damage >= 100 ? 0.62 : 0.11;
    this.velocity.y -= WORLD.gravity * ballisticScale * delta;
    this.velocity.addScaledVector(wind, delta * 0.018);
    this.mesh.position.addScaledVector(this.velocity, delta);
    this.mesh.lookAt(this.mesh.position.clone().add(this.velocity));
    if (this.life <= 0) {
      this.alive = false;
    }
  }
}
