import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
} from 'three';
import { FACTIONS, WORLD } from '../config';
import type { FactionId } from '../types';
import type { Unit } from './Unit';

let nextOutpostId = 1;

export class Outpost {
  readonly id = `outpost-${nextOutpostId++}`;
  readonly root = new Group();
  owner: FactionId | null;
  captureFaction: FactionId | null = null;
  captureProgress = 0;
  contested = false;
  private readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly beacon: Mesh<CylinderGeometry, MeshStandardMaterial>;

  constructor(owner: FactionId | null) {
    this.owner = owner;
    this.ring = new Mesh(
      new RingGeometry(WORLD.outpostCaptureRadius - 0.7, WORLD.outpostCaptureRadius, 48),
      new MeshBasicMaterial({
        color: owner ? FACTIONS[owner].color : 0xd7e1e8,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.12;
    this.root.add(this.ring);

    const platform = new Mesh(
      new CylinderGeometry(4.5, 5.2, 0.9, 12),
      new MeshStandardMaterial({ color: 0x3d474d, roughness: 0.76, metalness: 0.38 }),
    );
    platform.position.y = 0.45;
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.root.add(platform);

    this.beacon = new Mesh(
      new CylinderGeometry(0.6, 0.95, 7.5, 10),
      new MeshStandardMaterial({
        color: owner ? FACTIONS[owner].color : 0xc5d0d6,
        emissive: owner ? FACTIONS[owner].color : 0x44515a,
        emissiveIntensity: 0.45,
      }),
    );
    this.beacon.position.y = 4.6;
    this.beacon.castShadow = true;
    this.root.add(this.beacon);
  }

  update(delta: number, units: Unit[]): FactionId | null {
    const presence = new Map<FactionId, number>();
    for (const unit of units) {
      if (unit.destroyed || unit.stats.capturePower <= 0) {
        continue;
      }
      const distance = unit.position.distanceTo(this.root.position);
      if (distance <= WORLD.outpostCaptureRadius) {
        presence.set(unit.faction, (presence.get(unit.faction) ?? 0) + unit.stats.capturePower);
      }
    }
    const activeFactions = [...presence.entries()].filter(([, power]) => power > 0);
    this.contested = activeFactions.length > 1;
    if (activeFactions.length !== 1) {
      this.captureProgress = Math.max(0, this.captureProgress - delta * 0.35);
      return null;
    }

    const [faction, power] = activeFactions[0];
    if (faction === this.owner) {
      this.captureFaction = null;
      this.captureProgress = Math.max(0, this.captureProgress - delta);
      return null;
    }
    if (this.captureFaction !== faction) {
      this.captureFaction = faction;
      this.captureProgress = 0;
    }
    this.captureProgress += delta * Math.min(2.4, power);
    this.ring.material.color.set(FACTIONS[faction].color);
    this.ring.material.opacity = 0.35 + (this.captureProgress / WORLD.outpostCaptureTime) * 0.6;
    if (this.captureProgress < WORLD.outpostCaptureTime) {
      return null;
    }
    this.owner = faction;
    this.captureProgress = 0;
    this.captureFaction = null;
    this.ring.material.color.set(FACTIONS[faction].color);
    this.beacon.material.color.set(FACTIONS[faction].color);
    this.beacon.material.emissive.set(FACTIONS[faction].color);
    return faction;
  }
}
