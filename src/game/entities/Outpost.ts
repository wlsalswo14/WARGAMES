import {
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import { FACTIONS, WORLD } from '../config';
import type { FactionId } from '../types';
import type { Unit } from './Unit';

let nextOutpostId = 1;

export class Outpost {
  readonly id = `outpost-${nextOutpostId++}`;
  readonly root = new Group();
  readonly label: string;
  owner: FactionId | null;
  captureFaction: FactionId | null = null;
  captureProgress = 0;
  contested = false;
  private readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly territory: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly beacon: Mesh<CylinderGeometry, MeshStandardMaterial>;

  constructor(owner: FactionId | null, label = '?') {
    this.owner = owner;
    this.label = label;
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

    const marker = createObjectiveMarker(label);
    marker.position.y = 13;
    marker.renderOrder = 4;
    this.root.add(marker);
  }

  update(delta: number, units: Unit[]): FactionId | null {
    const presence = new Map<FactionId, number>();
    for (const unit of units) {
      if (unit.destroyed || unit.stats.capturePower <= 0) {
        continue;
      }
      const distance = Math.hypot(
        unit.position.x - this.root.position.x,
        unit.position.z - this.root.position.z,
      );
      const captureRadius = unit.kind === 'fighter'
        ? WORLD.outpostCaptureRadius * 2.2
        : unit.isAircraft
          ? WORLD.outpostCaptureRadius * 1.35
          : WORLD.outpostCaptureRadius;
      if (distance <= captureRadius) {
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

function createObjectiveMarker(label: string): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Objective marker canvas is unavailable');
  }
  context.fillStyle = 'rgba(4, 12, 22, 0.88)';
  context.strokeStyle = '#d9f2ff';
  context.lineWidth = 6;
  context.beginPath();
  context.roundRect(46, 18, 164, 92, 18);
  context.fill();
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = '900 66px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 128, 66);
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const marker = new Sprite(material);
  marker.scale.set(8, 4, 1);
  return marker;
}
