import { Vector3 } from 'three';
import type { UnitKind } from '../types';
import type { BaseLayout } from './layout';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function initialSpawnPosition(
  base: BaseLayout,
  kind: UnitKind,
  index: number,
): Vector3 {
  const forward = new Vector3(Math.sin(base.yaw), 0, Math.cos(base.yaw));
  const right = new Vector3(forward.z, 0, -forward.x);
  const origin = new Vector3(base.x, 0, base.z);

  if (kind === 'infantry') {
    const row = Math.floor(index / 5);
    const column = index % 5;
    return origin
      .addScaledVector(forward, 30 + row * 10)
      .addScaledVector(right, (column - 2) * 9);
  }
  if (kind === 'tank') {
    return origin
      .addScaledVector(forward, 5 + Math.floor(index / 4) * 14)
      .addScaledVector(right, -42 + (index % 4) * 12);
  }
  if (kind === 'drone') {
    return origin
      .addScaledVector(forward, -22 - Math.floor(index / 2) * 11)
      .addScaledVector(right, 28 + (index % 2) * 14);
  }
  if (kind === 'helicopter') {
    return origin
      .addScaledVector(forward, -38)
      .addScaledVector(right, -22 + index * 22);
  }
  return origin
    .addScaledVector(forward, -78)
    .addScaledVector(right, -24 + index * 48);
}

export function reinforcementSpawnPosition(
  anchor: Vector3,
  sequence: number,
): Vector3 {
  const angle = sequence * GOLDEN_ANGLE;
  const radius = 10 + (sequence % 4) * 2.5;
  return anchor.clone().add(new Vector3(
    Math.cos(angle) * radius,
    0,
    Math.sin(angle) * radius,
  ));
}
