import { Vector3 } from 'three';
import { FACTIONS } from '../config';
import { BrickStructure } from '../entities/BrickStructure';
import { terrainHeight } from '../math';
import type { FactionId, ProductionKind } from '../types';

export interface StructurePlan {
  id: string;
  kind: 'building' | 'wall' | 'headquarters' | ProductionKind;
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  yaw: number;
  color: number;
  openCenter: boolean;
  faction?: FactionId | null;
}

const BUILDING_COLORS = [0x667278, 0x756b62, 0x6b736b, 0x7b7068];

export function createStructureFromPlan(plan: StructurePlan): BrickStructure {
  const position = new Vector3(plan.x, terrainHeight(plan.x, plan.z), plan.z);
  const structure = new BrickStructure(
    position,
    {
      width: plan.width,
      height: plan.height,
      depth: plan.depth,
    },
    plan.color,
    plan.openCenter,
    plan.faction ?? null,
  );
  structure.root.name = plan.id;
  structure.root.rotation.y = plan.yaw;
  return structure;
}

export function createHeadquartersPlan(
  faction: FactionId,
  x: number,
  z: number,
  yaw: number,
  challengeScale: boolean,
): StructurePlan {
  return {
    id: `headquarters-${faction}`,
    kind: 'headquarters',
    x,
    z,
    width: challengeScale ? 16 : 10,
    height: challengeScale ? 28 : 14,
    depth: challengeScale ? 12 : 8,
    yaw,
    color: FACTIONS[faction].color,
    openCenter: true,
    faction,
  };
}

export function createPlayerBuildingPlan(
  point: Vector3,
  yaw: number,
  faction: FactionId,
): StructurePlan {
  return {
    id: `field-building-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind: 'building',
    x: point.x,
    z: point.z,
    width: 11 + Math.floor(Math.random() * 6),
    height: 40 + Math.floor(Math.random() * 21),
    depth: 9 + Math.floor(Math.random() * 6),
    yaw: yaw + (Math.random() - 0.5) * 0.24,
    color: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)],
    openCenter: true,
    faction,
  };
}

export function createProductionBasePlan(
  point: Vector3,
  yaw: number,
  faction: FactionId,
  kind: ProductionKind = 'factory',
): StructurePlan {
  const dimensions: Record<
    ProductionKind,
    Pick<StructurePlan, 'width' | 'height' | 'depth'>
  > = {
    factory: { width: 12, height: 12, depth: 10 },
    barracks: { width: 18, height: 11, depth: 11 },
    armorFactory: { width: 22, height: 14, depth: 15 },
    airfield: { width: 28, height: 8, depth: 17 },
  };
  return {
    id: `${kind}-${faction}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind,
    x: point.x,
    z: point.z,
    ...dimensions[kind],
    yaw,
    color: FACTIONS[faction].color,
    openCenter: true,
    faction,
  };
}
