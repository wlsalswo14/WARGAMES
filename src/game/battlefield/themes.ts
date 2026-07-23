import type { TerrainStampKind } from '../math';
import type { TownBuildingLayout } from './layout';

export type BattlefieldThemeId = 'mountains' | 'trenches' | 'urban';

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

export interface BattlefieldTheme {
  id: BattlefieldThemeId;
  label: string;
  description: string;
  palette: TerrainPalette;
  terrainStamps: TerrainStampPlan[];
  buildings: TownBuildingLayout[];
}

export function createRandomBattlefieldTheme(): BattlefieldTheme {
  const seed = Math.floor(Math.random() * 0x7fffffff);
  const random = mulberry32(seed);
  const ids: BattlefieldThemeId[] = ['mountains', 'trenches', 'urban'];
  const id = ids[Math.floor(random() * ids.length)];
  const terrainStamps = createTerrainStamps(id, random);
  const buildings = createBuildings(id, random);

  if (id === 'mountains') {
    return {
      id,
      label: '산악 교전지',
      description: '높은 능선과 계곡 사이에서 거점과 고지를 두고 전투합니다.',
      palette: { low: 0x34463a, high: 0x727665, riverBank: 0x51493d },
      terrainStamps,
      buildings,
    };
  }
  if (id === 'trenches') {
    return {
      id,
      label: '참호 전선',
      description: '여러 겹의 참호선과 완만한 구릉이 전장을 가로지릅니다.',
      palette: { low: 0x4c4934, high: 0x777158, riverBank: 0x4a4032 },
      terrainStamps,
      buildings,
    };
  }
  return {
    id,
    label: '시가 전장',
    description: '건물 밀집 구역과 도로 사이에서 근거리 교전이 벌어집니다.',
    palette: { low: 0x3d4541, high: 0x69716b, riverBank: 0x4d4942 },
    terrainStamps,
    buildings,
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
  for (let index = 0; index < 5; index += 1) {
    stamps.push({
      kind: index < 2 ? 'mountain' : 'trench',
      x: randomRange(random, -180, 180),
      z: randomRange(random, -145, 145),
    });
  }
  return stamps;
}

function createBuildings(
  id: BattlefieldThemeId,
  random: () => number,
): TownBuildingLayout[] {
  const targetCount = id === 'urban' ? 18 : id === 'trenches' ? 10 : 7;
  const buildings: TownBuildingLayout[] = [];
  let attempts = 0;
  while (buildings.length < targetCount && attempts < targetCount * 16) {
    attempts += 1;
    const x = randomRange(random, -145, 145);
    const z = randomRange(random, -125, 125);
    if (
      buildings.some((building) => Math.hypot(building.x - x, building.z - z) < 16)
      || Math.hypot(x, z) < 24
    ) {
      continue;
    }
    buildings.push({
      x,
      z,
      width: 4 + Math.floor(random() * 4),
      height: id === 'urban' ? 5 + Math.floor(random() * 8) : 4 + Math.floor(random() * 5),
      depth: 4 + Math.floor(random() * 3),
      color: [0x6f7778, 0x827668, 0x6d7367, 0x817069][Math.floor(random() * 4)],
    });
  }
  return buildings;
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
