import { MathUtils, Vector2, Vector3 } from 'three';

export const clamp = MathUtils.clamp;
export const lerp = MathUtils.lerp;

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
  const broad = Math.sin(x * 0.012) * 2.2 + Math.cos(z * 0.014) * 1.7;
  const detail = Math.sin((x + z) * 0.042) * 0.55 + Math.cos((x - z) * 0.035) * 0.4;
  const river = Math.abs(z - Math.sin(x * 0.009) * 34);
  const riverCut = Math.max(0, 1 - river / 18) * 4.2;
  return broad + detail - riverCut;
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
