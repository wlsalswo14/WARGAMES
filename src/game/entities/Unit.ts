import {
  AdditiveBlending,
  ConeGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { FACTIONS, UNIT_STATS } from '../config';
import { clamp, flatForward, shortestAngle, terrainHeight } from '../math';
import type {
  AttackMode,
  CommandOrder,
  DamageResult,
  FactionId,
  UnitKind,
} from '../types';
import { createUnitModel } from './BrickFactory';

let nextUnitId = 1;

export class Unit {
  readonly id = `unit-${nextUnitId++}`;
  readonly root = new Group();
  readonly model: Group;
  readonly stats;
  readonly velocity = new Vector3();
  readonly desiredVelocity = new Vector3();
  readonly faction: FactionId;
  readonly kind: UnitKind;
  health: number;
  yaw = 0;
  pitch = 0;
  roll = 0;
  throttle = 0;
  altitudeVelocity = 0;
  reloadTimer = 0;
  specialReloadTimer = 0;
  order: CommandOrder | null = null;
  targetId: string | null = null;
  destroyed = false;
  selected = false;
  possessed = false;
  grounded = false;
  immobilizedTimer = 0;
  detectedTimer = 0;
  terrainCollision = false;
  lastDamageFaction: FactionId | null = null;
  private readonly selectionRing: Mesh;
  private readonly factionMarker: Mesh;
  private readonly aimNode: Object3D;
  private readonly muzzleNode: Object3D;

  constructor(kind: UnitKind, faction: FactionId, position: Vector3) {
    this.kind = kind;
    this.faction = faction;
    this.stats = UNIT_STATS[kind];
    this.health = this.stats.maxHealth;
    this.model = createUnitModel(kind, faction);
    this.root.add(this.model);
    this.root.position.copy(position);
    this.root.userData.entity = this;

    this.aimNode = this.model.userData.aimNode as Object3D;
    this.muzzleNode = this.model.userData.muzzleNode as Object3D;

    const radius = this.collisionRadius * 1.2;
    this.selectionRing = new Mesh(
      new RingGeometry(radius * 0.78, radius, 32),
      new MeshBasicMaterial({
        color: FACTIONS[faction].color,
        transparent: true,
        opacity: 0.8,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.12;
    this.selectionRing.visible = true;
    this.root.add(this.selectionRing);

    this.factionMarker = new Mesh(
      new ConeGeometry(this.kind === 'infantry' ? 0.42 : 0.65, this.kind === 'infantry' ? 0.8 : 1.15, 8),
      new MeshBasicMaterial({
        color: FACTIONS[faction].color,
        transparent: true,
        opacity: 0.96,
        depthTest: false,
      }),
    );
    this.factionMarker.rotation.x = Math.PI;
    this.factionMarker.position.y = this.kind === 'infantry'
      ? 3.8
      : this.kind === 'tank'
        ? 4.8
        : 3.4;
    this.factionMarker.renderOrder = 20;
    this.root.add(this.factionMarker);
  }

  get position(): Vector3 {
    return this.root.position;
  }

  get collisionRadius(): number {
    switch (this.kind) {
      case 'infantry':
        return 1.1;
      case 'tank':
        return 2.8;
      case 'fighter':
        return 4.6;
      case 'helicopter':
        return 4.2;
      case 'drone':
        return 1.8;
    }
  }

  get isAircraft(): boolean {
    return this.kind === 'fighter' || this.kind === 'helicopter' || this.kind === 'drone';
  }

  get displayName(): string {
    const names: Record<UnitKind, string> = {
      infantry: '보병 분대',
      tank: '주력 전차',
      fighter: '전술 전투기',
      helicopter: '공격 헬기',
      drone: '정찰 드론',
    };
    return names[this.kind];
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.selectionRing.scale.setScalar(selected ? 1.32 : 1);
    (this.selectionRing.material as MeshBasicMaterial).opacity = selected ? 1 : 0.42;
  }

  setPossessed(possessed: boolean): void {
    this.possessed = possessed;
    this.selectionRing.scale.setScalar(possessed ? 1.48 : this.selected ? 1.32 : 1);
    (this.selectionRing.material as MeshBasicMaterial).opacity = possessed ? 1 : this.selected ? 1 : 0.42;
  }

  hideDestroyedModel(): void {
    this.model.visible = false;
    this.factionMarker.visible = false;
    this.selectionRing.visible = false;
  }

  update(delta: number, elapsed: number): void {
    this.reloadTimer = Math.max(0, this.reloadTimer - delta);
    this.specialReloadTimer = Math.max(0, this.specialReloadTimer - delta);
    this.immobilizedTimer = Math.max(0, this.immobilizedTimer - delta);
    this.detectedTimer = Math.max(0, this.detectedTimer - delta);

    if (this.destroyed) {
      return;
    }

    this.root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.updateAnimatedParts(delta, elapsed);

    if (!this.isAircraft) {
      const ground = terrainHeight(this.position.x, this.position.z);
      this.position.y = MathUtils.damp(this.position.y, ground, 18, delta);
      const trenchDepth = ground < -1.8;
      if (this.kind === 'tank' && !this.possessed && trenchDepth && this.velocity.length() < 5) {
        this.immobilizedTimer = Math.max(this.immobilizedTimer, 0.8);
      }
    }
  }

  moveGround(forwardInput: number, turnInput: number, delta: number): void {
    if (this.destroyed || this.immobilizedTimer > 0) {
      this.velocity.multiplyScalar(Math.pow(0.08, delta));
      return;
    }
    const maxSpeed = this.stats.speed * (forwardInput < 0 ? 0.52 : 1);
    this.throttle = MathUtils.damp(this.throttle, forwardInput, 4.2, delta);
    this.yaw += turnInput * this.stats.turnRate * delta * (0.35 + Math.abs(this.throttle) * 0.65);
    const forward = flatForward(this.yaw);
    this.desiredVelocity.copy(forward).multiplyScalar(maxSpeed * this.throttle);
    this.velocity.lerp(this.desiredVelocity, 1 - Math.exp(-delta * (this.kind === 'tank' ? 2.2 : 7)));
    this.position.addScaledVector(this.velocity, delta);
  }

  moveAircraft(
    forwardInput: number,
    turnInput: number,
    verticalInput: number,
    delta: number,
    wind: Vector3,
  ): void {
    if (this.destroyed) {
      return;
    }
    this.terrainCollision = false;
    const ground = terrainHeight(this.position.x, this.position.z);
    const altitude = this.position.y - ground;

    if (this.kind === 'fighter') {
      this.throttle = clamp(this.throttle + forwardInput * delta * 0.36, 0.28, 1);
      this.yaw += turnInput * this.stats.turnRate * delta;
      this.pitch = clamp(this.pitch + verticalInput * delta * 0.72, -0.52, 0.52);
      const speed = this.stats.speed * this.throttle;
      const lift = Math.max(0, speed - 22) * 0.045;
      const stall = speed < 29 || Math.abs(this.pitch) > 0.45;
      this.altitudeVelocity += ((stall ? -9 : lift + Math.sin(-this.pitch) * speed * 0.08) - 1.8) * delta;
      this.altitudeVelocity *= Math.pow(0.35, delta);
      this.roll = MathUtils.damp(this.roll, -turnInput * 0.75, 2.6, delta);
      const direction = flatForward(this.yaw);
      direction.y = -Math.sin(this.pitch);
      direction.normalize();
      this.velocity.copy(direction).multiplyScalar(speed).addScaledVector(wind, 0.1);
      this.velocity.y += this.altitudeVelocity;
    } else {
      this.throttle = MathUtils.damp(this.throttle, forwardInput, 3.2, delta);
      this.yaw += turnInput * this.stats.turnRate * delta;
      const desiredLift = verticalInput * (this.kind === 'helicopter' ? 10 : 8);
      const groundEffect = altitude < 7 && verticalInput >= 0 ? (7 - altitude) * 0.5 : 0;
      const vortexRing = this.kind === 'helicopter' && verticalInput < -0.7 && altitude > 10 ? -4.5 : 0;
      this.altitudeVelocity = MathUtils.damp(
        this.altitudeVelocity,
        desiredLift + groundEffect + vortexRing,
        3,
        delta,
      );
      const forward = flatForward(this.yaw);
      this.velocity.lerp(forward.multiplyScalar(this.stats.speed * this.throttle), 1 - Math.exp(-delta * 2.7));
      this.velocity.addScaledVector(wind, this.kind === 'drone' ? 0.16 : 0.07);
      this.velocity.y = this.altitudeVelocity;
      this.pitch = MathUtils.damp(this.pitch, -this.throttle * 0.16, 3, delta);
      this.roll = MathUtils.damp(this.roll, -turnInput * 0.28, 3, delta);
    }

    this.position.addScaledVector(this.velocity, delta);
    const collisionGround = terrainHeight(this.position.x, this.position.z);
    const minimumAltitude = collisionGround + (this.kind === 'fighter' ? 2.3 : 1.7);
    if (this.position.y < minimumAltitude) {
      this.terrainCollision = this.kind === 'fighter' || this.kind === 'helicopter';
      this.position.y = minimumAltitude;
      this.altitudeVelocity = Math.max(0, this.altitudeVelocity);
    }
  }

  movePossessed(
    forwardInput: number,
    sideInput: number,
    verticalInput: number,
    aimYaw: number,
    delta: number,
    wind: Vector3,
  ): void {
    this.yaw = aimYaw;
    const lateral = flatForward(aimYaw + Math.PI / 2);
    if (this.kind === 'fighter') {
      const targetThrottle = forwardInput > 0 ? 1 : forwardInput < 0 ? 0.32 : 0.68;
      this.throttle = MathUtils.damp(this.throttle, targetThrottle, 3.4, delta);
      this.moveAircraft(0, 0, -verticalInput, delta, wind);
      this.position.addScaledVector(lateral, sideInput * this.stats.speed * 0.35 * delta);
      this.roll = MathUtils.damp(this.roll, -sideInput * 0.26, 4, delta);
      return;
    }
    if (this.isAircraft) {
      this.moveAircraft(forwardInput, 0, verticalInput, delta, wind);
      this.position.addScaledVector(lateral, sideInput * this.stats.speed * 0.72 * delta);
      this.roll = MathUtils.damp(this.roll, -sideInput * 0.26, 4, delta);
      return;
    }
    if (forwardInput !== 0 || sideInput !== 0) {
      this.immobilizedTimer = 0;
    }
    this.moveGround(forwardInput, 0, delta);
    this.position.addScaledVector(lateral, sideInput * this.stats.speed * 0.82 * delta);
  }

  steerToward(destination: Vector3, delta: number, wind: Vector3): number {
    const difference = destination.clone().sub(this.position);
    const distance = difference.length();
    const desiredYaw = Math.atan2(difference.x, difference.z);
    const angle = shortestAngle(this.yaw, desiredYaw);
    const turn = clamp(angle * 1.4, -1, 1);

    if (this.isAircraft) {
      const vertical = clamp(difference.y * 0.08, -0.8, 0.8);
      this.moveAircraft(this.kind === 'fighter' ? 0.08 : 0.75, turn, vertical, delta, wind);
    } else {
      const forward = distance > 2
        ? clamp(1 - Math.abs(angle) / (Math.PI * 0.42), 0, 1)
        : 0;
      this.moveGround(forward, turn, delta);
    }
    return distance;
  }

  faceTarget(target: Vector3, delta: number): void {
    const difference = target.clone().sub(this.position);
    const desiredYaw = Math.atan2(difference.x, difference.z);
    if (this.kind === 'tank') {
      const turret = this.model.userData.turret as Group | undefined;
      if (turret) {
        const localTarget = shortestAngle(this.yaw + turret.rotation.y, desiredYaw);
        turret.rotation.y += clamp(localTarget, -delta * 1.2, delta * 1.2);
      }
    } else if (!this.possessed) {
      const differenceYaw = shortestAngle(this.yaw, desiredYaw);
      this.yaw += clamp(differenceYaw, -delta * this.stats.turnRate, delta * this.stats.turnRate);
    }
  }

  getMuzzlePosition(target?: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    const position = new Vector3();
    this.muzzleNode.getWorldPosition(position);
    if (target && this.kind === 'tank') {
      const aim = target.clone().sub(position).normalize();
      const turret = this.model.userData.turret as Group | undefined;
      if (turret) {
        const horizontalDistance = Math.hypot(target.x - position.x, target.z - position.z);
        const elevation = Math.atan2(target.y - position.y, horizontalDistance);
        turret.rotation.x = clamp(-elevation, -0.18, 0.28);
      }
      return position.addScaledVector(aim, 0.3);
    }
    return position;
  }

  getFireDirection(target?: Vector3): Vector3 {
    const muzzle = this.getMuzzlePosition();
    if (target) {
      return target.clone().sub(muzzle).normalize();
    }
    const direction = new Vector3(0, 0, 1);
    this.aimNode.getWorldQuaternion(Unit.tempQuaternion);
    return direction.applyQuaternion(Unit.tempQuaternion).normalize();
  }

  canFire(mode: AttackMode = 'normal'): boolean {
    const timer = mode === 'normal' ? this.reloadTimer : this.specialReloadTimer;
    return !this.destroyed && timer <= 0;
  }

  markFired(mode: AttackMode, reload: number): void {
    if (mode === 'normal') {
      this.reloadTimer = reload;
    } else {
      this.specialReloadTimer = reload;
    }
  }

  takeHit(
    rawDamage: number,
    penetration: number,
    direction: Vector3,
    attackerFaction: FactionId,
  ): DamageResult {
    const forward = flatForward(this.yaw);
    const incoming = direction.clone().normalize();
    const frontalFactor = Math.abs(forward.dot(incoming));
    const armorFacing = frontalFactor > 0.72 ? 1 : frontalFactor > 0.35 ? 0.68 : 0.42;
    const effectiveArmor = this.stats.armor * armorFacing;
    const impactAngle = Math.abs(forward.dot(incoming));
    const ricochet = this.stats.armor > 20 && impactAngle < 0.28 && penetration < effectiveArmor * 1.5;
    const penetrated = !ricochet && penetration >= effectiveArmor;
    const damage = ricochet ? 0 : rawDamage * (penetrated ? 1 : 0.22);
    this.applyRawDamage(damage, attackerFaction);
    return {
      destroyed: this.destroyed,
      ricochet,
      penetrated,
      damage,
    };
  }

  applyRawDamage(damage: number, attackerFaction: FactionId | null): void {
    if (this.destroyed) {
      return;
    }
    this.health = Math.max(0, this.health - damage);
    this.lastDamageFaction = attackerFaction;
    if (this.health <= 0) {
      this.destroyed = true;
      this.velocity.set(0, 0, 0);
      this.selectionRing.visible = false;
    }
  }

  private updateAnimatedParts(delta: number, elapsed: number): void {
    const rotor = this.model.userData.rotor as Group | undefined;
    const tailRotor = this.model.userData.tailRotor as Group | undefined;
    const rotors = this.model.userData.rotors as Group[] | undefined;
    if (rotor) {
      rotor.rotation.y += delta * 24;
    }
    if (tailRotor) {
      tailRotor.rotation.x += delta * 31;
    }
    if (rotors) {
      for (let index = 0; index < rotors.length; index += 1) {
        rotors[index].rotation.y += delta * (30 + index * 1.4);
      }
    }
    if (this.kind === 'infantry' && this.velocity.lengthSq() > 0.5) {
      this.model.position.y = Math.sin(elapsed * 12 + nextUnitId) * 0.06;
    } else {
      this.model.position.y = MathUtils.damp(this.model.position.y, 0, 12, delta);
    }
  }

  private static readonly tempQuaternion = new Quaternion();
}
