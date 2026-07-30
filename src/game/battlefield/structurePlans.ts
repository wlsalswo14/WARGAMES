import { Vector3 } from 'three';
import { FACTIONS } from '../config';
import { BrickStructure } from '../entities/BrickStructure';
import { terrainHeight } from '../math';
import type { FactionId } from '../types';

export interface StructurePlan {
  id: string;
  kind: 'building' | 'wall' | 'headquarters' | 'factory';
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
): StructurePlan {
  return {
    id: `production-base-${faction}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind: 'factory',
    x: point.x,
    z: point.z,
    width: 10,
    height: 11,
    depth: 9,
    yaw,
    color: FACTIONS[faction].color,
    openCenter: true,
    faction,
  };
}
