import {
  BufferAttribute,
  BoxGeometry,
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
import { FACTIONS, WORLD } from '../config';
import type { TerrainPalette } from '../battlefield/themes';
import {
  configureTerrainProfile,
  hash2,
  riverCenterZ,
  sculptTerrain as addTerrainStamp,
  seededRandom,
  terrainHeight,
  type TerrainProfile,
  type TerrainStampKind,
} from '../math';
import type { FactionId } from '../types';

interface TerrainChunk {
  key: string;
  x: number;
  z: number;
  group: Group;
  terrain: Mesh;
  trunks: InstancedMesh;
  crowns: InstancedMesh;
  trees: TreeRecord[];
}

interface TreeRecord {
  key: string;
  index: number;
  worldPosition: Vector3;
  localX: number;
  localZ: number;
  trunkY: number;
  crownY: number;
  scale: number;
  destroyed: boolean;
}

interface PlantedTree {
  root: Group;
  position: Vector3;
  scale: number;
  destroyed: boolean;
}

interface TerritoryInfluence {
  position: Vector3;
  owner: FactionId;
}

export class BattlefieldWorld {
  readonly root = new Group();
  readonly terrainMeshes: Mesh[] = [];
  readonly wind = new Vector3(1.2, 0, -0.55);
  private readonly chunks = new Map<string, TerrainChunk>();
  private readonly destroyedTreeKeys = new Set<string>();
  private readonly plantedTrees: PlantedTree[] = [];
  private readonly territories: TerritoryInfluence[] = [];
  private readonly lowColor: Color;
  private readonly highColor: Color;
  private readonly rockColor: Color;
  private readonly riverBankColor: Color;
  private readonly factionColors = new Map<FactionId, Color>(
    (Object.keys(FACTIONS) as FactionId[]).map((faction) => [
      faction,
      new Color(FACTIONS[faction].color),
    ]),
  );
  private readonly terrainMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.84,
    metalness: 0,
  });
  private readonly trunkMaterial = new MeshStandardMaterial({ color: 0x4b3523, roughness: 1 });
  private readonly foliageMaterial = new MeshStandardMaterial({ color: 0x243f2d, roughness: 0.96 });
  private lastCenterX = Number.NaN;
  private lastCenterZ = Number.NaN;

  constructor(
    palette: TerrainPalette,
    private readonly treeDensity: number,
    terrainProfile: TerrainProfile,
    private readonly chunkRadius: number = WORLD.chunkRadius,
  ) {
    configureTerrainProfile(terrainProfile);
    this.lowColor = new Color(palette.low);
    this.highColor = new Color(palette.high);
    this.rockColor = new Color(palette.high).lerp(new Color(0x8b867b), 0.52);
    this.riverBankColor = new Color(palette.riverBank);
    this.root.name = 'Procedural Battlefield';
    this.createRiver();
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  setTerritories(sources: Array<{ root: Group; owner: FactionId | null }>): void {
    this.territories.length = 0;
    for (const source of sources) {
      if (source.owner) {
        this.territories.push({
          position: source.root.position.clone(),
          owner: source.owner,
        });
      }
    }
    for (const chunk of this.chunks.values()) {
      this.applyTerrainColors(
        chunk.terrain.geometry as PlaneGeometry,
        chunk.x * WORLD.chunkSize,
        chunk.z * WORLD.chunkSize,
      );
    }
  }

  sculptTerrain(position: Vector3, kind: TerrainStampKind): void {
    const radius = addTerrainStamp(kind, position.x, position.z);
    const affected: Array<{ x: number; z: number }> = [];
    for (const chunk of this.chunks.values()) {
      const centerX = chunk.x * WORLD.chunkSize;
      const centerZ = chunk.z * WORLD.chunkSize;
      const distanceX = Math.max(0, Math.abs(position.x - centerX) - WORLD.chunkSize / 2);
      const distanceZ = Math.max(0, Math.abs(position.z - centerZ) - WORLD.chunkSize / 2);
      if (Math.hypot(distanceX, distanceZ) <= radius + 4) {
        affected.push({ x: chunk.x, z: chunk.z });
      }
    }
    for (const descriptor of affected) {
      const key = `${descriptor.x}:${descriptor.z}`;
      const existing = this.chunks.get(key);
      if (existing) {
        this.removeChunk(existing);
      }
      const replacement = this.createChunk(descriptor.x, descriptor.z);
      this.chunks.set(key, replacement);
      this.root.add(replacement.group);
      this.terrainMeshes.push(replacement.terrain);
    }
  }

  plantTree(position: Vector3): void {
    const scale = 0.85 + Math.random() * 0.55;
    const root = new Group();
    root.position.set(position.x, terrainHeight(position.x, position.z), position.z);
    const trunkMaterial = new MeshStandardMaterial({ color: 0x68452a, roughness: 0.92 });
    const leafMaterial = new MeshStandardMaterial({ color: 0x1f7638, roughness: 0.88 });
    for (let level = 0; level < 4; level += 1) {
      const trunk = new Mesh(new BoxGeometry(0.85, 0.75, 0.85), trunkMaterial);
      trunk.position.y = 0.38 + level * 0.72;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      root.add(trunk);
    }
    const leafOffsets = [
      new Vector3(0, 3.5, 0),
      new Vector3(-0.9, 3.25, 0),
      new Vector3(0.9, 3.25, 0),
      new Vector3(0, 3.25, -0.9),
      new Vector3(0, 3.25, 0.9),
      new Vector3(0, 4.25, 0),
    ];
    for (const offset of leafOffsets) {
      const leaves = new Mesh(new BoxGeometry(1.7, 1.25, 1.7), leafMaterial);
      leaves.position.copy(offset);
      leaves.castShadow = true;
      leaves.receiveShadow = true;
      root.add(leaves);
    }
    root.scale.setScalar(scale);
    this.root.add(root);
    this.plantedTrees.push({
      root,
      position: root.position.clone(),
      scale,
      destroyed: false,
    });
  }

  destroyTrees(position: Vector3, radius: number): Array<{ position: Vector3; scale: number }> {
    const destroyed: Array<{ position: Vector3; scale: number }> = [];
    const matrix = new Matrix4();
    for (const chunk of this.chunks.values()) {
      let changed = false;
      for (const tree of chunk.trees) {
        if (tree.destroyed || tree.worldPosition.distanceToSquared(position) > radius * radius) {
          continue;
        }
        tree.destroyed = true;
        this.destroyedTreeKeys.add(tree.key);
        matrix.makeScale(0, 0, 0);
        matrix.setPosition(tree.localX, tree.trunkY, tree.localZ);
        chunk.trunks.setMatrixAt(tree.index, matrix);
        matrix.makeScale(0, 0, 0);
        matrix.setPosition(tree.localX, tree.crownY, tree.localZ);
        chunk.crowns.setMatrixAt(tree.index, matrix);
        destroyed.push({ position: tree.worldPosition.clone(), scale: tree.scale });
        changed = true;
      }
      if (changed) {
        chunk.trunks.instanceMatrix.needsUpdate = true;
        chunk.crowns.instanceMatrix.needsUpdate = true;
      }
    }
    for (const tree of this.plantedTrees) {
      if (tree.destroyed || tree.position.distanceToSquared(position) > radius * radius) {
        continue;
      }
      tree.destroyed = true;
      tree.root.visible = false;
      destroyed.push({ position: tree.position.clone(), scale: tree.scale });
    }
    return destroyed;
  }

  collidesWithTree(position: Vector3, radius: number): boolean {
    const collides = (treePosition: Vector3, scale: number): boolean => {
      const horizontalRadius = radius + 1.6 * scale;
      const distanceX = position.x - treePosition.x;
      const distanceZ = position.z - treePosition.z;
      if (distanceX * distanceX + distanceZ * distanceZ > horizontalRadius * horizontalRadius) {
        return false;
      }
      const treeTop = treePosition.y + 6.7 * scale;
      return position.y + radius >= treePosition.y
        && position.y - radius <= treeTop;
    };
    for (const chunk of this.chunks.values()) {
      const centerX = chunk.x * WORLD.chunkSize;
      const centerZ = chunk.z * WORLD.chunkSize;
      const chunkRadius = WORLD.chunkSize / 2 + radius + 3;
      if (
        Math.abs(position.x - centerX) > chunkRadius
        || Math.abs(position.z - centerZ) > chunkRadius
      ) {
        continue;
      }
      for (const tree of chunk.trees) {
        if (!tree.destroyed && collides(tree.worldPosition, tree.scale)) {
          return true;
        }
      }
    }
    return this.plantedTrees.some(
      (tree) => !tree.destroyed && collides(tree.position, tree.scale),
    );
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
    for (let offsetX = -this.chunkRadius; offsetX <= this.chunkRadius; offsetX += 1) {
      for (let offsetZ = -this.chunkRadius; offsetZ <= this.chunkRadius; offsetZ += 1) {
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
      this.removeChunk(chunk);
    }
  }

  private removeChunk(chunk: TerrainChunk): void {
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
    this.chunks.delete(chunk.key);
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
    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index);
      const localZ = positions.getZ(index);
      const worldX = centerX + localX;
      const worldZ = centerZ + localZ;
      const height = terrainHeight(worldX, worldZ);
      positions.setY(index, height);
    }
    geometry.computeVertexNormals();
    this.applyTerrainColors(geometry, centerX, centerZ);

    const terrain = new Mesh(geometry, this.terrainMaterial);
    terrain.receiveShadow = true;
    terrain.userData.isTerrain = true;
    group.add(terrain);

    const treeData = this.addTrees(group, chunkX, chunkZ, centerX, centerZ);
    return {
      key: `${chunkX}:${chunkZ}`,
      x: chunkX,
      z: chunkZ,
      group,
      terrain,
      ...treeData,
    };
  }

  private applyTerrainColors(
    geometry: PlaneGeometry,
    centerX: number,
    centerZ: number,
  ): void {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const colors: number[] = [];
    for (let index = 0; index < positions.count; index += 1) {
      const worldX = centerX + positions.getX(index);
      const worldZ = centerZ + positions.getZ(index);
      const height = positions.getY(index);
      const riverDistance = Math.abs(worldZ - riverCenterZ(worldX));
      const color = riverDistance < 16
        ? this.riverBankColor.clone()
        : this.lowColor.clone().lerp(
            this.highColor,
            Math.min(1, Math.max(0, (height + 3) / 10)),
          );
      let strongestInfluence = 0;
      let territoryOwner: FactionId | null = null;
      for (const territory of this.territories) {
        const distance = Math.hypot(
          worldX - territory.position.x,
          worldZ - territory.position.z,
        );
        const influence = Math.max(0, 1 - distance / WORLD.territoryRadius);
        if (influence > strongestInfluence) {
          strongestInfluence = influence;
          territoryOwner = territory.owner;
        }
      }
      if (territoryOwner) {
        color.lerp(
          this.factionColors.get(territoryOwner) ?? color,
          strongestInfluence * 0.72,
        );
      }
      const slope = normals
        ? Math.min(1, Math.max(0, (1 - normals.getY(index)) * 2.8))
        : 0;
      color.lerp(this.rockColor, slope * 0.42);
      const variation = 0.88 + hash2(Math.round(worldX), Math.round(worldZ), 23) * 0.18;
      color.multiplyScalar(variation);
      colors.push(color.r, color.g, color.b);
    }
    const existing = geometry.getAttribute('color') as BufferAttribute | undefined;
    if (existing && existing.count === positions.count) {
      existing.copyArray(colors);
      existing.needsUpdate = true;
    } else {
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
    }
  }

  private addTrees(
    group: Group,
    chunkX: number,
    chunkZ: number,
    centerX: number,
    centerZ: number,
  ): { trunks: InstancedMesh; crowns: InstancedMesh; trees: TreeRecord[] } {
    const count = Math.max(
      1,
      Math.round((5 + Math.floor(hash2(chunkX, chunkZ, 81) * 10)) * this.treeDensity),
    );
    const trunkGeometry = new CylinderGeometry(0.35, 0.52, 3.3, 6);
    const crownGeometry = new ConeGeometry(1.9, 4.8, 7);
    const trunks = new InstancedMesh(trunkGeometry, this.trunkMaterial, count);
    const crowns = new InstancedMesh(crownGeometry, this.foliageMaterial, count);
    const matrix = new Matrix4();
    const trees: TreeRecord[] = [];
    let visible = 0;

    for (let index = 0; index < count; index += 1) {
      const seed = chunkX * 92821 + chunkZ * 68917 + index * 127;
      const localX = (seededRandom(seed) - 0.5) * (WORLD.chunkSize - 8);
      const localZ = (seededRandom(seed + 4) - 0.5) * (WORLD.chunkSize - 8);
      const worldX = centerX + localX;
      const worldZ = centerZ + localZ;
      const riverDistance = Math.abs(worldZ - riverCenterZ(worldX));
      const townDistance = Math.hypot(worldX - 45, worldZ + 28);
      if (riverDistance < 23 || townDistance < 82) {
        continue;
      }
      const height = terrainHeight(worldX, worldZ);
      const scale = 0.7 + seededRandom(seed + 9) * 0.65;
      const trunkY = height + 1.65 * scale;
      const crownY = height + 4.15 * scale;
      const treeKey = `${chunkX}:${chunkZ}:${index}`;
      const destroyed = this.destroyedTreeKeys.has(treeKey);
      matrix.makeScale(destroyed ? 0 : scale, destroyed ? 0 : scale, destroyed ? 0 : scale);
      matrix.setPosition(localX, trunkY, localZ);
      trunks.setMatrixAt(visible, matrix);
      matrix.makeScale(destroyed ? 0 : scale, destroyed ? 0 : scale, destroyed ? 0 : scale);
      matrix.setPosition(localX, crownY, localZ);
      crowns.setMatrixAt(visible, matrix);
      trees.push({
        key: treeKey,
        index: visible,
        worldPosition: new Vector3(worldX, height, worldZ),
        localX,
        localZ,
        trunkY,
        crownY,
        scale,
        destroyed,
      });
      visible += 1;
    }
    trunks.count = visible;
    crowns.count = visible;
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    crowns.castShadow = true;
    group.add(trunks, crowns);
    return { trunks, crowns, trees };
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
      const centerZ = riverCenterZ(x);
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
        emissive: 0x123843,
        emissiveIntensity: 0.16,
        roughness: 0.1,
        metalness: 0.18,
        transparent: true,
        opacity: 0.78,
        side: DoubleSide,
      }),
    );
    water.receiveShadow = true;
    this.root.add(water);
  }
}
