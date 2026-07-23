import { MathUtils, Vector2, Vector3 } from 'three';

export const clamp = MathUtils.clamp;
export const lerp = MathUtils.lerp;

export type TerrainStampKind = 'mountain' | 'trench';

interface TerrainStamp {
  kind: TerrainStampKind;
  x: number;
  z: number;
  radius: number;
  strength: number;
}

export interface TerrainProfile {
  phaseX: number;
  phaseZ: number;
  heightScale: number;
  riverAmplitude: number;
  riverFrequency: number;
  riverPhase: number;
}

const terrainStamps: TerrainStamp[] = [];
let terrainProfile: TerrainProfile = {
  phaseX: 0,
  phaseZ: 0,
  heightScale: 1,
  riverAmplitude: 34,
  riverFrequency: 0.009,
  riverPhase: 0,
};

export function resetTerrainStamps(): void {
  terrainStamps.length = 0;
}

export function configureTerrainProfile(profile: TerrainProfile): void {
  terrainProfile = { ...profile };
}

export function riverCenterZ(x: number): number {
  return Math.sin(
    (x + terrainProfile.phaseX) * terrainProfile.riverFrequency
      + terrainProfile.riverPhase,
  ) * terrainProfile.riverAmplitude;
}

export function damp(current: number, target: number, lambda: number, delta: number): number {
  return MathUtils.damp(current, target, lambda, delta);
}

export function seededRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function hash2(x: number, y: number, seed = 1917): number {
  return seededRandom(x * 374761393 + y * 668265263 + seed * 69069);
}

export function terrainHeight(x: number, z: number): number {
  const shiftedX = x + terrainProfile.phaseX;
  const shiftedZ = z + terrainProfile.phaseZ;
  const broad = (
    Math.sin(shiftedX * 0.011) * 4.8
      + Math.cos(shiftedZ * 0.013) * 3.6
  ) * terrainProfile.heightScale;
  const ridge = Math.sin((shiftedX * 0.006) + (shiftedZ * 0.004))
    * 2.2
    * terrainProfile.heightScale;
  const detail = (
    Math.sin((shiftedX + shiftedZ) * 0.042) * 1.1
      + Math.cos((shiftedX - shiftedZ) * 0.035) * 0.85
  ) * Math.min(1.2, terrainProfile.heightScale + 0.15);
  const river = Math.abs(z - riverCenterZ(x));
  const riverCut = Math.max(0, 1 - river / 18) * 6.5;
  let height = broad + ridge + detail - riverCut;
  for (const stamp of terrainStamps) {
    const distance = Math.hypot(x - stamp.x, z - stamp.z);
    if (distance >= stamp.radius) {
      continue;
    }
    const normalized = 1 - distance / stamp.radius;
    const smooth = normalized * normalized * (3 - 2 * normalized);
    height += stamp.strength * smooth;
  }
  return height;
}

export function sculptTerrain(kind: TerrainStampKind, x: number, z: number): number {
  const stamp: TerrainStamp = kind === 'mountain'
    ? { kind, x, z, radius: 34, strength: 18 }
    : { kind, x, z, radius: 17, strength: -6.5 };
  terrainStamps.push(stamp);
  if (terrainStamps.length > 120) {
    terrainStamps.shift();
  }
  return stamp.radius;
}

export function flatForward(yaw: number): Vector3 {
  return new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

export function signedAngle(from: Vector3, to: Vector3): number {
  const a = new Vector2(from.x, from.z).normalize();
  const b = new Vector2(to.x, to.z).normalize();
  return Math.atan2(a.x * b.y - a.y * b.x, a.dot(b));
}

export function shortestAngle(current: number, target: number): number {
  let difference = (target - current + Math.PI) % (Math.PI * 2) - Math.PI;
  if (difference < -Math.PI) {
    difference += Math.PI * 2;
  }
  return difference;
}

export function factionPairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export function formatDistance(distance: number): string {
  return distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
}

export function randomPointInCircle(radius: number, seed: number): Vector3 {
  const angle = seededRandom(seed) * Math.PI * 2;
  const distance = Math.sqrt(seededRandom(seed + 31)) * radius;
  return new Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
}
