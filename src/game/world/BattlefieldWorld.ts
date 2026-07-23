import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import { WORLD } from '../config';
import { hash2, seededRandom, terrainHeight } from '../math';

interface TerrainChunk {
  key: string;
  x: number;
  z: number;
  group: Group;
  terrain: Mesh;
}

export class BattlefieldWorld {
  readonly root = new Group();
  readonly terrainMeshes: Mesh[] = [];
  readonly wind = new Vector3(1.2, 0, -0.55);
  private readonly chunks = new Map<string, TerrainChunk>();
  private readonly terrainMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
  });
  private readonly trunkMaterial = new MeshStandardMaterial({ color: 0x4b3523, roughness: 1 });
  private readonly foliageMaterial = new MeshStandardMaterial({ color: 0x243f2d, roughness: 0.96 });
  private lastCenterX = Number.NaN;
  private lastCenterZ = Number.NaN;

  constructor() {
    this.root.name = 'Procedural Battlefield';
    this.createRiver();
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  update(center: Vector3): void {
    const centerX = Math.floor(center.x / WORLD.chunkSize);
    const centerZ = Math.floor(center.z / WORLD.chunkSize);
    if (centerX === this.lastCenterX && centerZ === this.lastCenterZ) {
      return;
    }
    this.lastCenterX = centerX;
    this.lastCenterZ = centerZ;

    const required = new Set<string>();
    for (let offsetX = -WORLD.chunkRadius; offsetX <= WORLD.chunkRadius; offsetX += 1) {
      for (let offsetZ = -WORLD.chunkRadius; offsetZ <= WORLD.chunkRadius; offsetZ += 1) {
        const x = centerX + offsetX;
        const z = centerZ + offsetZ;
        const key = `${x}:${z}`;
        required.add(key);
        if (!this.chunks.has(key)) {
          const chunk = this.createChunk(x, z);
          this.chunks.set(key, chunk);
          this.root.add(chunk.group);
          this.terrainMeshes.push(chunk.terrain);
        }
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (required.has(key)) {
        continue;
      }
      this.root.remove(chunk.group);
      const terrainIndex = this.terrainMeshes.indexOf(chunk.terrain);
      if (terrainIndex >= 0) {
        this.terrainMeshes.splice(terrainIndex, 1);
      }
      chunk.group.traverse((object) => {
        if (object instanceof Mesh || object instanceof InstancedMesh) {
          object.geometry.dispose();
        }
      });
      this.chunks.delete(key);
    }
  }

  private createChunk(chunkX: number, chunkZ: number): TerrainChunk {
    const size = WORLD.chunkSize;
    const segments = 12;
    const centerX = chunkX * size;
    const centerZ = chunkZ * size;
    const group = new Group();
    group.position.set(centerX, 0, centerZ);

    const geometry = new PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute('position');
    const colors: number[] = [];
    const lowColor = new Color(0x354833);
    const highColor = new Color(0x69705a);
    const riverBank = new Color(0x554b37);
    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index);
      const localZ = positions.getZ(index);
      const worldX = centerX + localX;
      const worldZ = centerZ + localZ;
      const height = terrainHeight(worldX, worldZ);
      positions.setY(index, height);
      const riverDistance = Math.abs(worldZ - Math.sin(worldX * 0.009) * 34);
      const color = riverDistance < 16
        ? riverBank.clone()
        : lowColor.clone().lerp(highColor, Math.min(1, Math.max(0, (height + 3) / 10)));
      const variation = 0.88 + hash2(Math.round(worldX), Math.round(worldZ), 23) * 0.18;
      color.multiplyScalar(variation);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    geometry.computeVertexNormals();

    const terrain = new Mesh(geometry, this.terrainMaterial);
    terrain.receiveShadow = true;
    terrain.userData.isTerrain = true;
    group.add(terrain);

    this.addTrees(group, chunkX, chunkZ, centerX, centerZ);
    return { key: `${chunkX}:${chunkZ}`, x: chunkX, z: chunkZ, group, terrain };
  }

  private addTrees(group: Group, chunkX: number, chunkZ: number, centerX: number, centerZ: number): void {
    const count = 5 + Math.floor(hash2(chunkX, chunkZ, 81) * 10);
    const trunkGeometry = new CylinderGeometry(0.35, 0.52, 3.3, 6);
    const crownGeometry = new ConeGeometry(1.9, 4.8, 7);
    const trunks = new InstancedMesh(trunkGeometry, this.trunkMaterial, count);
    const crowns = new InstancedMesh(crownGeometry, this.foliageMaterial, count);
    const matrix = new Matrix4();
    let visible = 0;

    for (let index = 0; index < count; index += 1) {
      const seed = chunkX * 92821 + chunkZ * 68917 + index * 127;
      const localX = (seededRandom(seed) - 0.5) * (WORLD.chunkSize - 8);
      const localZ = (seededRandom(seed + 4) - 0.5) * (WORLD.chunkSize - 8);
      const worldX = centerX + localX;
      const worldZ = centerZ + localZ;
      const riverDistance = Math.abs(worldZ - Math.sin(worldX * 0.009) * 34);
      const townDistance = Math.hypot(worldX - 45, worldZ + 28);
      if (riverDistance < 23 || townDistance < 82) {
        continue;
      }
      const height = terrainHeight(worldX, worldZ);
      const scale = 0.7 + seededRandom(seed + 9) * 0.65;
      matrix.makeScale(scale, scale, scale);
      matrix.setPosition(localX, height + 1.65 * scale, localZ);
      trunks.setMatrixAt(visible, matrix);
      matrix.makeScale(scale, scale, scale);
      matrix.setPosition(localX, height + 4.15 * scale, localZ);
      crowns.setMatrixAt(visible, matrix);
      visible += 1;
    }
    trunks.count = visible;
    crowns.count = visible;
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    crowns.castShadow = true;
    group.add(trunks, crowns);
  }

  private createRiver(): void {
    const halfWidth = 9;
    const start = -720;
    const end = 720;
    const segments = 96;
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let index = 0; index <= segments; index += 1) {
      const x = start + ((end - start) * index) / segments;
      const centerZ = Math.sin(x * 0.009) * 34;
      vertices.push(x, WORLD.waterLevel, centerZ - halfWidth);
      vertices.push(x, WORLD.waterLevel, centerZ + halfWidth);
      if (index < segments) {
        const base = index * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const geometry = new PlaneGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const water = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: 0x2d6f86,
        roughness: 0.18,
        metalness: 0.08,
        transparent: true,
        opacity: 0.78,
        side: DoubleSide,
      }),
    );
    water.receiveShadow = true;
    this.root.add(water);
  }
}
