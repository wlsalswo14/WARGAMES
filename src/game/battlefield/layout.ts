import type { FactionId } from '../types';

export const FACTION_ORDER: FactionId[] = ['azure', 'crimson', 'amber'];

export interface OutpostLayout {
  x: number;
  z: number;
  owner: FactionId | null;
}

export const OUTPOST_LAYOUTS: OutpostLayout[] = [
  { x: -252, z: -68, owner: 'azure' },
  { x: -225, z: 78, owner: 'azure' },
  { x: -176, z: -148, owner: 'azure' },
  { x: -154, z: 8, owner: null },
  { x: -104, z: 126, owner: null },
  { x: -82, z: -92, owner: null },
  { x: -8, z: -152, owner: null },
  { x: 0, z: 0, owner: null },
  { x: 28, z: 152, owner: null },
  { x: 82, z: -62, owner: null },
  { x: 112, z: 72, owner: null },
  { x: 148, z: -184, owner: 'crimson' },
  { x: 212, z: -82, owner: 'crimson' },
  { x: 252, z: -166, owner: 'crimson' },
  { x: 164, z: 146, owner: 'amber' },
  { x: 238, z: 72, owner: 'amber' },
  { x: 252, z: 184, owner: 'amber' },
];

export interface BaseLayout {
  x: number;
  z: number;
  yaw: number;
}

export const BASE_LAYOUTS: Record<FactionId, BaseLayout> = {
  azure: { x: -260, z: -25, yaw: Math.PI / 2 },
  crimson: { x: 235, z: -180, yaw: -0.7 },
  amber: { x: 245, z: 175, yaw: 3.7 },
};

export const STAGING_SPAWN_LAYOUTS: Record<FactionId, Array<{ x: number; z: number }>> = {
  azure: [
    { x: -292, z: -138 },
    { x: -205, z: 152 },
    { x: -118, z: -188 },
  ],
  crimson: [
    { x: 302, z: -104 },
    { x: 172, z: -246 },
    { x: 104, z: -118 },
  ],
  amber: [
    { x: 304, z: 112 },
    { x: 182, z: 242 },
    { x: 102, z: 108 },
  ],
};

export interface TownBuildingLayout {
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: number;
}

export const TOWN_BUILDINGS: TownBuildingLayout[] = [
  { x: 26, z: -44, width: 6, height: 7, depth: 5, color: 0x8b7761 },
  { x: 52, z: -33, width: 5, height: 9, depth: 6, color: 0x6f7778 },
  { x: 73, z: -10, width: 7, height: 6, depth: 5, color: 0x86715e },
  { x: 39, z: 3, width: 5, height: 5, depth: 5, color: 0x747d72 },
  { x: 82, z: 25, width: 6, height: 8, depth: 6, color: 0x7d6c62 },
  { x: 10, z: 30, width: 7, height: 5, depth: 5, color: 0x797f85 },
  { x: -18, z: -58, width: 5, height: 6, depth: 5, color: 0x756c62 },
  { x: -34, z: -22, width: 6, height: 5, depth: 4, color: 0x69747a },
  { x: -17, z: 18, width: 4, height: 7, depth: 5, color: 0x837566 },
  { x: 105, z: -43, width: 5, height: 6, depth: 4, color: 0x747c7e },
  { x: 118, z: -4, width: 6, height: 5, depth: 5, color: 0x88745e },
  { x: 106, z: 38, width: 5, height: 7, depth: 4, color: 0x6e7470 },
];
