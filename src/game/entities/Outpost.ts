import {
  CircleGeometry,
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
  private readonly territory: Mesh<CircleGeometry, MeshBasicMaterial>;
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

    this.territory = new Mesh(
      new CircleGeometry(WORLD.outpostCaptureRadius - 1, 48),
      new MeshBasicMaterial({
        color: owner ? FACTIONS[owner].color : 0xb9c2c8,
        transparent: true,
        opacity: owner ? 0.2 : 0.08,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.territory.rotation.x = -Math.PI / 2;
    this.territory.position.y = 0.08;
    this.territory.renderOrder = 1;
    this.root.add(this.territory);

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
        presence.set(unit.faction, (presence.get(unit.faction) ?? 0) + 1);
      }
    }
    const rankedPresence = [...presence.entries()]
      .filter(([, count]) => count > 0)
      .sort((left, right) => right[1] - left[1]);
    this.contested = rankedPresence.length > 1;
    const leader = rankedPresence[0];
    const runnerUp = rankedPresence[1];
    if (!leader || (runnerUp && leader[1] === runnerUp[1])) {
      this.resetCapture();
      return null;
    }

    const [faction] = leader;
    if (faction === this.owner) {
      this.resetCapture();
      return null;
    }
    if (this.captureFaction !== faction) {
      this.captureFaction = faction;
      this.captureProgress = 0;
    }
    this.captureProgress += delta;
    this.ring.material.color.set(FACTIONS[faction].color);
    this.ring.material.opacity = 0.35 + (this.captureProgress / WORLD.outpostCaptureTime) * 0.6;
    this.territory.material.color.set(FACTIONS[faction].color);
    this.territory.material.opacity = 0.12 + (this.captureProgress / WORLD.outpostCaptureTime) * 0.16;
    if (this.captureProgress < WORLD.outpostCaptureTime) {
      return null;
    }
    this.setOwner(faction);
    return faction;
  }

  setOwner(owner: FactionId | null): void {
    this.owner = owner;
    this.resetCapture();
    this.beacon.material.color.set(owner ? FACTIONS[owner].color : 0xc5d0d6);
    this.beacon.material.emissive.set(owner ? FACTIONS[owner].color : 0x44515a);
  }

  private resetCapture(): void {
    this.captureFaction = null;
    this.captureProgress = 0;
    this.ring.material.color.set(this.owner ? FACTIONS[this.owner].color : 0xd7e1e8);
    this.ring.material.opacity = 0.58;
    this.territory.material.color.set(this.owner ? FACTIONS[this.owner].color : 0xb9c2c8);
    this.territory.material.opacity = this.owner ? 0.2 : 0.08;
  }
}
