import {
  Box3,
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { WORLD } from '../config';
import { seededRandom, terrainHeight } from '../math';
import type { FactionId } from '../types';

interface BrickPiece {
  batch: InstancedMesh;
  instanceIndex: number;
  position: Vector3;
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
  private aliveBrickCount = 0;
  private supportTotal = 0;
  private supportRemaining = 0;
  private collapseTriggered = false;
  private readonly localBounds = new Box3();
  private readonly hiddenMatrix = new Matrix4();

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
    const descriptors: Array<{
      position: Vector3;
      materialIndex: number;
      support: boolean;
    }> = [];

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
          const offset = level % 2 === 0 ? 0 : 0.45;
          const support = level === 0;
          descriptors.push({
            position: new Vector3(
              (x - (dimensions.width - 1) / 2) * 1.86 + offset,
              level * 0.73 + 0.36,
              (z - (dimensions.depth - 1) / 2) * 0.9,
            ),
            materialIndex: Math.floor(seededRandom(seed) * materialPalette.length),
            support,
          });
          if (support) {
            this.supportTotal += 1;
            this.supportRemaining += 1;
          }
        }
      }
    }
    this.aliveBrickCount = descriptors.length;
    for (const descriptor of descriptors) {
      this.localBounds.expandByPoint(descriptor.position);
    }
    this.localBounds.expandByScalar(1);
    const matrix = new Matrix4();
    for (let materialIndex = 0; materialIndex < materialPalette.length; materialIndex += 1) {
      const batchDescriptors = descriptors.filter(
        (descriptor) => descriptor.materialIndex === materialIndex,
      );
      if (batchDescriptors.length === 0) {
        continue;
      }
      const batch = new InstancedMesh(
        brickGeometry,
        materialPalette[materialIndex],
        batchDescriptors.length,
      );
      batch.instanceMatrix.setUsage(DynamicDrawUsage);
      batch.castShadow = true;
      batch.receiveShadow = true;
      batch.userData.structure = this;
      for (let instanceIndex = 0; instanceIndex < batchDescriptors.length; instanceIndex += 1) {
        const descriptor = batchDescriptors[instanceIndex];
        matrix.makeTranslation(
          descriptor.position.x,
          descriptor.position.y,
          descriptor.position.z,
        );
        batch.setMatrixAt(instanceIndex, matrix);
        this.bricks.push({
          batch,
          instanceIndex,
          position: descriptor.position,
          health: descriptor.support ? 95 : 65,
          support: descriptor.support,
          alive: true,
        });
      }
      batch.instanceMatrix.needsUpdate = true;
      this.root.add(batch);
    }
  }

  get integrity(): number {
    if (this.bricks.length === 0) {
      return 0;
    }
    return this.aliveBrickCount / this.bricks.length;
  }

  containsWorldPoint(worldPoint: Vector3, padding = 0): boolean {
    const localPoint = this.root.worldToLocal(worldPoint.clone());
    return localPoint.x >= this.localBounds.min.x - padding
      && localPoint.x <= this.localBounds.max.x + padding
      && localPoint.y >= this.localBounds.min.y - padding
      && localPoint.y <= this.localBounds.max.y + padding
      && localPoint.z >= this.localBounds.min.z - padding
      && localPoint.z <= this.localBounds.max.z + padding;
  }

  damageAt(worldPoint: Vector3, radius: number, damage: number, impulse: Vector3): number {
    let destroyedCount = 0;
    const localPoint = this.root.worldToLocal(worldPoint.clone());
    for (const brick of this.bricks) {
      if (!brick.alive) {
        continue;
      }
      const distance = brick.position.distanceTo(localPoint);
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
    this.destroyed = this.aliveBrickCount === 0;
    return destroyedCount;
  }

  destroyAll(impulse: Vector3): number {
    let destroyedCount = 0;
    for (const brick of this.bricks) {
      if (!brick.alive) {
        continue;
      }
      const outward = brick.position.clone().normalize();
      this.breakBrick(
        brick,
        outward.multiplyScalar(4).add(impulse),
      );
      destroyedCount += 1;
    }
    this.collapseTriggered = true;
    this.destroyed = true;
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
        this.rubble.splice(index, 1);
      }
    }
  }

  private breakBrick(brick: BrickPiece, impulse: Vector3): void {
    brick.alive = false;
    if (brick.support) {
      this.supportRemaining -= 1;
    }
    this.aliveBrickCount -= 1;
    this.hiddenMatrix.makeScale(0, 0, 0);
    this.hiddenMatrix.setPosition(brick.position);
    brick.batch.setMatrixAt(brick.instanceIndex, this.hiddenMatrix);
    brick.batch.instanceMatrix.needsUpdate = true;
    if (this.rubble.length >= WORLD.maxRubble) {
      return;
    }
    const rubbleMesh = new Mesh(brick.batch.geometry, brick.batch.material);
    rubbleMesh.position.copy(brick.position);
    rubbleMesh.scale.multiplyScalar(0.9);
    rubbleMesh.castShadow = false;
    rubbleMesh.receiveShadow = false;
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
        const outward = brick.position.clone().sub(localOrigin).normalize();
        this.breakBrick(brick, outward.multiplyScalar(2 + Math.random() * 4));
      }
    }
  }
}
