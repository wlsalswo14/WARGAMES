import type { TerrainProfile, TerrainStampKind } from '../math';
import {
  BASE_LAYOUTS,
  OUTPOST_LAYOUTS,
  STAGING_SPAWN_LAYOUTS,
  type TownBuildingLayout,
} from './layout';

export type BattlefieldThemeId =
  | 'mountains'
  | 'trenches'
  | 'urban'
  | 'forest'
  | 'canyon'
  | 'riverlands';

export interface TerrainPalette {
  low: number;
  high: number;
  riverBank: number;
}

export interface TerrainStampPlan {
  kind: TerrainStampKind;
  x: number;
  z: number;
}

export interface WallLayout {
  x: number;
  z: number;
  length: number;
  height: number;
  yaw: number;
  color: number;
}

export interface BattlefieldTheme {
  id: BattlefieldThemeId;
  label: string;
  description: string;
  palette: TerrainPalette;
  terrainProfile: TerrainProfile;
  treeDensity: number;
  terrainStamps: TerrainStampPlan[];
  buildings: TownBuildingLayout[];
  walls: WallLayout[];
}

export function createRandomBattlefieldTheme(): BattlefieldTheme {
  const seed = Math.floor(Math.random() * 0x7fffffff);
  const random = mulberry32(seed);
  const ids: BattlefieldThemeId[] = [
    'mountains',
    'trenches',
    'urban',
    'forest',
    'canyon',
    'riverlands',
  ];
  const id = ids[Math.floor(random() * ids.length)];
  const terrainProfile = createTerrainProfile(id, random);
  const terrainStamps = createTerrainStamps(id, random);
  const buildings = createBuildings(id, random, terrainProfile);
  const walls = createWalls(id, random, terrainProfile, buildings);

  if (id === 'mountains') {
    return {
      id,
      label: '산악 교전지',
      description: '높은 능선과 계곡 사이에서 거점과 고지를 두고 전투합니다.',
      palette: { low: 0x34463a, high: 0x727665, riverBank: 0x51493d },
      terrainProfile,
      treeDensity: 0.7,
      terrainStamps,
      buildings,
      walls,
    };
  }
  if (id === 'trenches') {
    return {
      id,
      label: '참호 전선',
      description: '여러 겹의 참호선과 완만한 구릉이 전장을 가로지릅니다.',
      palette: { low: 0x4c4934, high: 0x777158, riverBank: 0x4a4032 },
      terrainProfile,
      treeDensity: 0.55,
      terrainStamps,
      buildings,
      walls,
    };
  }
  if (id === 'urban') {
    return {
      id,
      label: '시가 전장',
      description: '건물 밀집 구역과 도로 사이에서 근거리 교전이 벌어집니다.',
      palette: { low: 0x3d4541, high: 0x69716b, riverBank: 0x4d4942 },
      terrainProfile,
      treeDensity: 0.35,
      terrainStamps,
      buildings,
      walls,
    };
  }
  if (id === 'forest') {
    return {
      id,
      label: '삼림 고지',
      description: '울창한 숲과 낮은 능선이 시야와 기갑 이동을 제한합니다.',
      palette: { low: 0x233f2d, high: 0x58705a, riverBank: 0x4c4635 },
      terrainProfile,
      treeDensity: 2.1,
      terrainStamps,
      buildings,
      walls,
    };
  }
  if (id === 'canyon') {
    return {
      id,
      label: '협곡 전선',
      description: '건조한 협곡과 좁은 통로가 병력을 여러 전선으로 분리합니다.',
      palette: { low: 0x5b4532, high: 0x8a7258, riverBank: 0x44392f },
      terrainProfile,
      treeDensity: 0.2,
      terrainStamps,
      buildings,
      walls,
    };
  }
  return {
    id,
    label: '강변 교두보',
    description: '굽이치는 넓은 강과 완만한 평야에서 교두보를 확보합니다.',
    palette: { low: 0x344d3d, high: 0x67775d, riverBank: 0x625743 },
    terrainProfile,
    treeDensity: 1.25,
    terrainStamps,
    buildings,
    walls,
  };
}

function createTerrainStamps(
  id: BattlefieldThemeId,
  random: () => number,
): TerrainStampPlan[] {
  const stamps: TerrainStampPlan[] = [];
  if (id === 'mountains') {
    for (let index = 0; index < 13; index += 1) {
      stamps.push({
        kind: 'mountain',
        x: randomRange(random, -210, 210),
        z: randomRange(random, -175, 175),
      });
    }
    return stamps;
  }
  if (id === 'trenches') {
    for (let line = -1; line <= 1; line += 1) {
      for (let index = 0; index < 9; index += 1) {
        stamps.push({
          kind: 'trench',
          x: -180 + index * 45 + randomRange(random, -7, 7),
          z: line * 58 + Math.sin(index * 0.9 + line) * 16,
        });
      }
    }
    for (let index = 0; index < 3; index += 1) {
      stamps.push({
        kind: 'mountain',
        x: randomRange(random, -190, 190),
        z: randomRange(random, -150, 150),
      });
    }
    return stamps;
  }
  if (id === 'urban') {
    for (let index = 0; index < 5; index += 1) {
      stamps.push({
        kind: index < 2 ? 'mountain' : 'trench',
        x: randomRange(random, -180, 180),
        z: randomRange(random, -145, 145),
      });
    }
    return stamps;
  }
  if (id === 'forest') {
    for (let index = 0; index < 8; index += 1) {
      stamps.push({
        kind: 'mountain',
        x: randomRange(random, -220, 220),
        z: randomRange(random, -175, 175),
      });
    }
    return stamps;
  }
  if (id === 'canyon') {
    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < 7; index += 1) {
        stamps.push({
          kind: 'mountain',
          x: -210 + index * 70 + randomRange(random, -12, 12),
          z: side * (55 + Math.sin(index) * 24),
        });
      }
    }
    for (let index = 0; index < 8; index += 1) {
      stamps.push({
        kind: 'trench',
        x: -175 + index * 50,
        z: Math.sin(index * 1.2) * 22,
      });
    }
    return stamps;
  }
  for (let index = 0; index < 4; index += 1) {
    stamps.push({
      kind: index === 0 ? 'mountain' : 'trench',
      x: randomRange(random, -210, 210),
      z: randomRange(random, -165, 165),
    });
  }
  return stamps;
}

function createBuildings(
  id: BattlefieldThemeId,
  random: () => number,
  terrainProfile: TerrainProfile,
): TownBuildingLayout[] {
  const targetCount = id === 'urban'
    ? 20
    : id === 'trenches'
      ? 12
      : id === 'riverlands'
        ? 14
        : id === 'forest'
          ? 8
          : id === 'canyon'
            ? 7
            : 9;
  const buildings: TownBuildingLayout[] = [];
  let attempts = 0;
  while (buildings.length < targetCount && attempts < targetCount * 32) {
    attempts += 1;
    const x = randomRange(random, -265, 265);
    const z = randomRange(random, -215, 215);
    if (
      buildings.some((building) => Math.hypot(building.x - x, building.z - z) < 25)
      || isReservedArea(x, z, 52, 92)
      || Math.abs(z - themeRiverCenterZ(x, terrainProfile)) < 20
    ) {
      continue;
    }
    buildings.push({
      x,
      z,
      width: 5 + Math.floor(random() * 5),
      height: id === 'urban'
        ? 16 + Math.floor(random() * 16)
        : 11 + Math.floor(random() * 12),
      depth: 5 + Math.floor(random() * 4),
      color: [0x6f7778, 0x827668, 0x6d7367, 0x817069][Math.floor(random() * 4)],
    });
  }
  return buildings;
}

function createWalls(
  id: BattlefieldThemeId,
  random: () => number,
  terrainProfile: TerrainProfile,
  buildings: TownBuildingLayout[],
): WallLayout[] {
  const targetCount = id === 'trenches'
    ? 18
    : id === 'urban'
      ? 14
      : id === 'canyon'
        ? 11
        : id === 'riverlands'
          ? 10
          : id === 'forest'
            ? 8
            : 9;
  const walls: WallLayout[] = [];
  let attempts = 0;
  while (walls.length < targetCount && attempts < targetCount * 28) {
    attempts += 1;
    const x = randomRange(random, -280, 280);
    const z = randomRange(random, -225, 225);
    if (
      isReservedArea(x, z, 50, 88)
      || Math.abs(z - themeRiverCenterZ(x, terrainProfile)) < 15
      || buildings.some((building) => Math.hypot(building.x - x, building.z - z) < 19)
      || walls.some((wall) => Math.hypot(wall.x - x, wall.z - z) < 15)
    ) {
      continue;
    }
    walls.push({
      x,
      z,
      length: 15 + Math.floor(random() * 10),
      height: 4 + Math.floor(random() * 4),
      yaw: randomRange(random, 0, Math.PI),
      color: [0x666c6d, 0x756c5e, 0x555f61, 0x746b62][Math.floor(random() * 4)],
    });
  }
  return walls;
}

function themeRiverCenterZ(x: number, profile: TerrainProfile): number {
  return Math.sin(
    (x + profile.phaseX) * profile.riverFrequency + profile.riverPhase,
  ) * profile.riverAmplitude;
}

function isReservedArea(
  x: number,
  z: number,
  outpostClearance: number,
  baseClearance: number,
): boolean {
  return OUTPOST_LAYOUTS.some(
    (outpost) => Math.hypot(outpost.x - x, outpost.z - z) < outpostClearance,
  ) || Object.values(BASE_LAYOUTS).some(
    (base) => Math.hypot(base.x - x, base.z - z) < baseClearance,
  ) || Object.values(STAGING_SPAWN_LAYOUTS).flat().some(
    (staging) => Math.hypot(staging.x - x, staging.z - z) < baseClearance * 0.68,
  );
}

function createTerrainProfile(
  id: BattlefieldThemeId,
  random: () => number,
): TerrainProfile {
  const heightScale = id === 'canyon'
    ? 1.35
    : id === 'mountains'
      ? 1.18
      : id === 'riverlands'
        ? 0.58
        : id === 'urban'
          ? 0.68
          : id === 'forest'
            ? 0.9
            : 0.78;
  const riverAmplitude = id === 'riverlands'
    ? randomRange(random, 58, 82)
    : id === 'canyon'
      ? randomRange(random, 16, 28)
      : randomRange(random, 28, 48);
  return {
    phaseX: randomRange(random, -900, 900),
    phaseZ: randomRange(random, -900, 900),
    heightScale,
    riverAmplitude,
    riverFrequency: randomRange(random, 0.0065, 0.0125),
    riverPhase: randomRange(random, 0, Math.PI * 2),
  };
}

function randomRange(random: () => number, minimum: number, maximum: number): number {
  return minimum + random() * (maximum - minimum);
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
