import type { Scene } from 'three';
import { Vector3 } from 'three';
import { FACTIONS, WORLD } from '../config';
import type { BrickStructure } from '../entities/BrickStructure';
import type { Outpost } from '../entities/Outpost';
import { terrainHeight } from '../math';
import type { PlayMode } from '../modes/PlayMode';
import type {
  FactionId,
  ProductionKind,
  UnitKind,
} from '../types';
import {
  createProductionBasePlan,
  createStructureFromPlan,
} from '../battlefield/structurePlans';
import {
  canProduceUnit,
  PRODUCTION_CATALOG,
  requiredProductionKind,
} from './ProductionCatalog';

export interface ProductionBase {
  outpost: Outpost | null;
  faction: FactionId;
  kind: ProductionKind;
  structure: BrickStructure;
  spawnAnchor: Vector3;
}

export interface ProductionPlacement {
  outpost: Outpost | null;
  position: Vector3;
  yaw: number;
  spawnAnchor: Vector3;
}

interface ProductionNetworkDependencies {
  scene: Scene;
  structures: BrickStructure[];
  outposts: Outpost[];
  headquarters: Map<FactionId, BrickStructure>;
  getHeading: () => number;
  notify: (title: string, body: string, color?: string) => void;
  onBuilt: (faction: FactionId) => void;
}

export class ProductionNetwork {
  readonly bases: ProductionBase[] = [];

  constructor(
    private readonly dependencies: ProductionNetworkDependencies,
  ) {}

  createStartingBase(
    faction: FactionId,
    headquartersPosition: Vector3,
    yaw: number,
  ): void {
    const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new Vector3(forward.z, 0, -forward.x);
    const position = headquartersPosition.clone()
      .addScaledVector(forward, 36)
      .addScaledVector(side, faction === 'azure' ? 25 : -25);
    position.y = terrainHeight(position.x, position.z);
    const structure = createStructureFromPlan(
      createProductionBasePlan(position, yaw, faction, 'factory'),
    );
    this.dependencies.structures.push(structure);
    this.bases.push({
      outpost: null,
      faction,
      kind: 'factory',
      structure,
      spawnAnchor: position.clone().addScaledVector(forward, 21),
    });
    this.dependencies.scene.add(structure.root);
  }

  create(
    faction: FactionId,
    kind: ProductionKind,
    placement: ProductionPlacement,
    announce: boolean,
  ): ProductionBase {
    const structure = createStructureFromPlan(
      createProductionBasePlan(
        placement.position,
        placement.yaw,
        faction,
        kind,
      ),
    );
    const productionBase = {
      outpost: placement.outpost,
      faction,
      kind,
      structure,
      spawnAnchor: placement.spawnAnchor,
    };
    this.dependencies.structures.push(structure);
    this.bases.push(productionBase);
    this.dependencies.scene.add(structure.root);
    this.dependencies.onBuilt(faction);
    if (announce) {
      this.dependencies.notify(
        `${PRODUCTION_CATALOG[kind].label} 완공`,
        placement.outpost
          ? `${placement.outpost.label} 거점 생산망에 연결됐습니다.`
          : '새 생산시설이 전선 보급망에 연결됐습니다.',
        FACTIONS[faction].accent,
      );
    }
    return productionBase;
  }

  isOperational(productionBase: ProductionBase): boolean {
    return !productionBase.structure.destroyed
      && productionBase.structure.integrity > 0.35
      && (
        productionBase.outpost === null
        || productionBase.outpost.owner === productionBase.faction
      );
  }

  operationalFor(faction: FactionId): ProductionBase[] {
    return this.bases.filter(
      (productionBase) => (
        productionBase.faction === faction
        && this.isOperational(productionBase)
      ),
    );
  }

  unitCapacity(
    faction: FactionId,
    baseCapacity: number,
    mode: PlayMode,
  ): number {
    const capacityBonus = this.operationalFor(faction).reduce(
      (total, productionBase) => (
        total + PRODUCTION_CATALOG[productionBase.kind].capacityBonus
      ),
      0,
    );
    return baseCapacity
      + Math.min(mode === 'conquest' ? 10 : 2, capacityBonus);
  }

  incomeBonus(faction: FactionId): number {
    return this.operationalFor(faction).reduce(
      (total, productionBase) => (
        total + PRODUCTION_CATALOG[productionBase.kind].incomeBonus
      ),
      0,
    );
  }

  findPlayerPlacement(
    point: Vector3,
    kind: ProductionKind,
    faction: FactionId,
    mode: PlayMode,
  ): ProductionPlacement | null {
    const heading = this.dependencies.getHeading();
    if (mode === 'sandbox') {
      const position = new Vector3(
        point.x,
        terrainHeight(point.x, point.z),
        point.z,
      );
      const outward = new Vector3(
        Math.sin(heading),
        0,
        Math.cos(heading),
      );
      return {
        outpost: null,
        position,
        yaw: heading,
        spawnAnchor: position.clone().addScaledVector(outward, 18),
      };
    }

    const outpost = this.findClosestOutpost(
      point,
      WORLD.outpostCaptureRadius * 1.8,
    );
    if (!outpost || outpost.owner !== faction) {
      this.dependencies.notify(
        '건설 구역 밖',
        '점령한 거점 가까이에서만 생산기지를 건설할 수 있습니다.',
        '#ffcf5d',
      );
      return null;
    }
    if (
      this.bases.some(
        (productionBase) => (
          productionBase.outpost === outpost
          && (
            mode !== 'conquest'
            || productionBase.kind === kind
          )
          && !productionBase.structure.destroyed
          && productionBase.structure.integrity > 0.35
        ),
      )
    ) {
      this.dependencies.notify(
        '생산기지 한도',
        mode === 'conquest'
          ? `${outpost.label} 거점에는 이미 같은 종류의 생산시설이 있습니다.`
          : `${outpost.label} 거점에는 이미 생산기지가 있습니다.`,
        '#ffcf5d',
      );
      return null;
    }

    const radial = point.clone().sub(outpost.root.position).setY(0);
    if (radial.lengthSq() < 0.1) {
      radial.set(Math.sin(heading), 0, Math.cos(heading));
    }
    radial.normalize();
    const baseAngle = Math.atan2(radial.x, radial.z);
    const placementRadius = WORLD.outpostCaptureRadius
      + (mode === 'conquest' ? 15 : 10);
    for (const offset of [0, 0.62, -0.62, 1.24, -1.24, Math.PI]) {
      const angle = baseAngle + offset;
      const outward = new Vector3(Math.sin(angle), 0, Math.cos(angle));
      const position = outpost.root.position.clone()
        .addScaledVector(outward, placementRadius);
      position.y = terrainHeight(position.x, position.z);
      const obstructed = this.dependencies.structures.some(
        (structure) => (
          !structure.destroyed
          && structure.containsWorldPoint(position, 6)
        ),
      );
      if (!obstructed) {
        return {
          outpost,
          position,
          yaw: angle + Math.PI,
          spawnAnchor: position.clone().addScaledVector(outward, 18),
        };
      }
    }
    this.dependencies.notify(
      '건설 공간 부족',
      `${outpost.label} 거점 주변의 다른 방향을 클릭해 주세요.`,
      '#ffcf5d',
    );
    return null;
  }

  findPlayerSource(
    unitKind: UnitKind,
    point: Vector3,
    faction: FactionId,
  ): ProductionBase | null {
    const candidates = this.operationalFor(faction)
      .filter(
        (productionBase) => (
          canProduceUnit(productionBase.kind, unitKind)
        ),
      )
      .sort(
        (left, right) => (
          left.spawnAnchor.distanceToSquared(point)
          - right.spawnAnchor.distanceToSquared(point)
        ),
      );
    const closest = candidates[0] ?? null;
    if (!closest) {
      this.dependencies.notify(
        '생산시설 필요',
        `${PRODUCTION_CATALOG[requiredProductionKind(unitKind)].label}를 점령 거점에 먼저 건설하십시오.`,
        '#ffcf5d',
      );
      return null;
    }
    if (closest.spawnAnchor.distanceTo(point) > 82) {
      this.dependencies.notify(
        '생산 범위 밖',
        `${PRODUCTION_CATALOG[closest.kind].label} 가까이를 클릭해 출격 지점을 지정하십시오.`,
        '#ffcf5d',
      );
      return null;
    }
    return closest;
  }

  findAiPlacement(
    faction: FactionId,
    outpost: Outpost,
    sequence: number,
  ): ProductionPlacement | null {
    const headquarters = this.dependencies.headquarters.get(faction);
    const towardBase = headquarters
      ? headquarters.root.position.clone().sub(outpost.root.position)
      : new Vector3(faction === 'azure' ? -1 : 1, 0, 0);
    towardBase.y = 0;
    towardBase.normalize();
    const baseAngle = Math.atan2(towardBase.x, towardBase.z);
    for (const offset of [
      sequence * 0.72,
      -sequence * 0.72,
      1.25,
      -1.25,
      Math.PI,
    ]) {
      const angle = baseAngle + offset;
      const outward = new Vector3(Math.sin(angle), 0, Math.cos(angle));
      const position = outpost.root.position.clone()
        .addScaledVector(outward, WORLD.outpostCaptureRadius + 14);
      position.y = terrainHeight(position.x, position.z);
      const obstructed = this.dependencies.structures.some(
        (structure) => (
          !structure.destroyed
          && structure.containsWorldPoint(position, 8)
        ),
      );
      if (!obstructed) {
        return {
          outpost,
          position,
          yaw: angle + Math.PI,
          spawnAnchor: position.clone().addScaledVector(outward, 20),
        };
      }
    }
    return null;
  }

  private findClosestOutpost(
    point: Vector3,
    maximumDistance: number,
  ): Outpost | null {
    let closest: Outpost | null = null;
    let closestDistance = maximumDistance * maximumDistance;
    for (const outpost of this.dependencies.outposts) {
      const distance = outpost.root.position.distanceToSquared(point);
      if (distance < closestDistance) {
        closest = outpost;
        closestDistance = distance;
      }
    }
    return closest;
  }
}
