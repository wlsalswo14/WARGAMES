import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { WORLD } from '../config';
import { seededRandom, terrainHeight } from '../math';
import type { FactionId } from '../types';

interface BrickPiece {
  mesh: Mesh;
  health: number;
  support: boolean;
  alive: boolean;
}

interface RubblePiece {
  mesh: Mesh;
  velocity: Vector3;
  angularVelocity: Vector3;
  life: number;
}

let nextStructureId = 1;

export class BrickStructure {
  readonly id = `structure-${nextStructureId++}`;
  readonly root = new Group();
  readonly bricks: BrickPiece[] = [];
  readonly rubble: RubblePiece[] = [];
  readonly faction: FactionId | null;
  destroyed = false;
  private supportTotal = 0;
  private supportRemaining = 0;
  private collapseTriggered = false;

  constructor(
    position: Vector3,
    dimensions: { width: number; height: number; depth: number },
    color = 0x7f7767,
    openCenter = true,
    faction: FactionId | null = null,
  ) {
    this.faction = faction;
    this.root.position.copy(position);
    this.root.userData.entity = this;
    const materialPalette = [
      new MeshStandardMaterial({ color, roughness: 0.88 }),
      new MeshStandardMaterial({ color: color + 0x090704, roughness: 0.9 }),
      new MeshStandardMaterial({ color: Math.max(0, color - 0x0c0a07), roughness: 0.92 }),
    ];
    const brickGeometry = new BoxGeometry(1.9, 0.72, 0.92);

    for (let level = 0; level < dimensions.height; level += 1) {
      for (let x = 0; x < dimensions.width; x += 1) {
        for (let z = 0; z < dimensions.depth; z += 1) {
          const perimeter = x === 0 || x === dimensions.width - 1 || z === 0 || z === dimensions.depth - 1;
          if (openCenter && !perimeter) {
            continue;
          }
          const isDoor = z === dimensions.depth - 1
            && x >= Math.floor(dimensions.width / 2) - 1
            && x <= Math.floor(dimensions.width / 2)
            && level < 3;
          const isWindow = perimeter && level >= 3 && level <= 4 && (x + z) % 3 === 1;
          if (isDoor || isWindow) {
            continue;
          }
          const seed = level * 1000 + x * 37 + z * 73 + nextStructureId;
          const mesh = new Mesh(brickGeometry, materialPalette[Math.floor(seededRandom(seed) * materialPalette.length)]);
          const offset = level % 2 === 0 ? 0 : 0.45;
          mesh.position.set(
            (x - (dimensions.width - 1) / 2) * 1.86 + offset,
            level * 0.73 + 0.36,
            (z - (dimensions.depth - 1) / 2) * 0.9,
          );
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.structure = this;
          const support = level === 0;
          this.bricks.push({ mesh, health: support ? 95 : 65, support, alive: true });
          this.root.add(mesh);
          if (support) {
            this.supportTotal += 1;
            this.supportRemaining += 1;
          }
        }
      }
    }
  }

  get integrity(): number {
    if (this.bricks.length === 0) {
      return 0;
    }
    return this.bricks.filter((brick) => brick.alive).length / this.bricks.length;
  }

  damageAt(worldPoint: Vector3, radius: number, damage: number, impulse: Vector3): number {
    let destroyedCount = 0;
    const localPoint = this.root.worldToLocal(worldPoint.clone());
    for (const brick of this.bricks) {
      if (!brick.alive) {
        continue;
      }
      const distance = brick.mesh.position.distanceTo(localPoint);
      if (distance > radius) {
        continue;
      }
      brick.health -= damage * (1 - distance / Math.max(radius, 0.01));
      if (brick.health <= 0) {
        this.breakBrick(brick, impulse.clone().multiplyScalar(0.6 + (radius - distance) / radius));
        destroyedCount += 1;
      }
    }
    if (
      !this.collapseTriggered
      && this.supportTotal > 0
      && this.supportRemaining / this.supportTotal < 0.48
    ) {
      this.collapseTriggered = true;
      this.triggerCollapse(worldPoint);
    }
    this.destroyed = this.bricks.every((brick) => !brick.alive);
    return destroyedCount;
  }

  update(delta: number): void {
    for (let index = this.rubble.length - 1; index >= 0; index -= 1) {
      const rubble = this.rubble[index];
      rubble.life -= delta;
      rubble.velocity.y -= WORLD.gravity * delta;
      rubble.mesh.position.addScaledVector(rubble.velocity, delta);
      rubble.mesh.rotation.x += rubble.angularVelocity.x * delta;
      rubble.mesh.rotation.y += rubble.angularVelocity.y * delta;
      rubble.mesh.rotation.z += rubble.angularVelocity.z * delta;
      const worldX = this.root.position.x + rubble.mesh.position.x;
      const worldZ = this.root.position.z + rubble.mesh.position.z;
      const ground = terrainHeight(worldX, worldZ) - this.root.position.y + 0.2;
      if (rubble.mesh.position.y < ground) {
        rubble.mesh.position.y = ground;
        rubble.velocity.y *= -0.18;
        rubble.velocity.x *= 0.72;
        rubble.velocity.z *= 0.72;
      }
      if (rubble.life <= 0 || this.rubble.length > WORLD.maxRubble) {
        this.root.remove(rubble.mesh);
        rubble.mesh.geometry.dispose();
        this.rubble.splice(index, 1);
      }
    }
  }

  private breakBrick(brick: BrickPiece, impulse: Vector3): void {
    brick.alive = false;
    if (brick.support) {
      this.supportRemaining -= 1;
    }
    this.root.remove(brick.mesh);
    const rubbleMesh = brick.mesh.clone();
    rubbleMesh.scale.multiplyScalar(0.9);
    this.root.add(rubbleMesh);
    this.rubble.push({
      mesh: rubbleMesh,
      velocity: impulse.clone().add(new Vector3(
        (Math.random() - 0.5) * 3,
        2 + Math.random() * 4,
        (Math.random() - 0.5) * 3,
      )),
      angularVelocity: new Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
      ),
      life: 6 + Math.random() * 5,
    });
  }

  private triggerCollapse(origin: Vector3): void {
    const localOrigin = this.root.worldToLocal(origin.clone());
    for (const brick of this.bricks) {
      if (!brick.alive || brick.support) {
        continue;
      }
      if (Math.random() < 0.72) {
        const outward = brick.mesh.position.clone().sub(localOrigin).normalize();
        this.breakBrick(brick, outward.multiplyScalar(2 + Math.random() * 4));
      }
    }
  }
}
