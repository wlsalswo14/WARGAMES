import { PerspectiveCamera, Vector3 } from 'three';
import { Unit } from '../entities/Unit';
import { clamp, flatForward, terrainHeight } from '../math';
import type { CameraView, GameMode } from '../types';

const MOUSE_YAW_SENSITIVITY = 0.0023;
const MOUSE_PITCH_SENSITIVITY = 0.0019;

interface GodMovement {
  forward: number;
  side: number;
  vertical: number;
  rotate: number;
}

interface KillCamera {
  focus: Vector3;
  timer: number;
  angle: number;
  distance: number;
}

export class BattleCamera {
  readonly godPosition = new Vector3(0, 92, 180);

  private godAzimuth = Math.PI;
  private godPitch = -0.46;
  private godMoveSpeed = 58;
  private aimYaw = 0;
  private aimPitch = -0.08;
  private cameraView: CameraView = 'thirdPerson';
  private killCamera: KillCamera | null = null;

  constructor(private readonly camera: PerspectiveCamera) {}

  get isKillCameraActive(): boolean {
    return this.killCamera !== null;
  }

  get possessionYaw(): number {
    return this.aimYaw;
  }

  get heading(): number {
    return this.godAzimuth;
  }

  updateGodMovement(movement: GodMovement, delta: number): void {
    this.godAzimuth += movement.rotate * delta * 1.25;
    const cameraForward = new Vector3(
      Math.sin(this.godAzimuth) * Math.cos(this.godPitch),
      Math.sin(this.godPitch),
      Math.cos(this.godAzimuth) * Math.cos(this.godPitch),
    ).normalize();
    const cameraRight = flatForward(this.godAzimuth + Math.PI / 2);
    const speed = this.godMoveSpeed;
    this.godPosition.addScaledVector(
      cameraForward,
      movement.forward * speed * delta,
    );
    this.godPosition.addScaledVector(
      cameraRight,
      movement.side * speed * delta,
    );
    this.godPosition.y += movement.vertical * speed * delta;
    this.godPosition.x = clamp(this.godPosition.x, -680, 680);
    this.godPosition.z = clamp(this.godPosition.z, -680, 680);
    const minimumHeight = terrainHeight(
      this.godPosition.x,
      this.godPosition.z,
    ) + 3;
    this.godPosition.y = clamp(this.godPosition.y, minimumHeight, 340);
  }

  handleMouseLook(
    mode: GameMode,
    movementX: number,
    movementY: number,
  ): void {
    if (mode === 'possession') {
      this.aimYaw += movementX * MOUSE_YAW_SENSITIVITY;
      this.aimPitch = clamp(
        this.aimPitch + movementY * MOUSE_PITCH_SENSITIVITY,
        -1.1,
        0.78,
      );
      return;
    }
    this.godAzimuth += movementX * MOUSE_YAW_SENSITIVITY;
    this.godPitch = clamp(
      this.godPitch + movementY * MOUSE_PITCH_SENSITIVITY,
      -1.3,
      1.1,
    );
  }

  adjustGodMoveSpeed(deltaY: number): void {
    this.godMoveSpeed = clamp(
      this.godMoveSpeed - deltaY * 0.055,
      24,
      140,
    );
  }

  beginPossession(unit: Unit): void {
    this.cameraView = 'thirdPerson';
    this.aimYaw = unit.yaw;
    this.aimPitch = -0.07;
  }

  returnToGod(unit: Unit): void {
    this.godPosition.copy(unit.position);
    this.godPosition.y += 18;
    this.godAzimuth = unit.yaw + Math.PI;
    this.godPitch = -0.32;
  }

  toggleView(): CameraView {
    this.cameraView = this.cameraView === 'thirdPerson'
      ? 'firstPerson'
      : 'thirdPerson';
    return this.cameraView;
  }

  startKillCamera(focus: Vector3, collisionRadius: number): void {
    this.killCamera = {
      focus: focus.clone(),
      timer: 3.35,
      angle: this.godAzimuth + Math.PI * 0.65,
      distance: clamp(8 + collisionRadius * 3.8, 10, 26),
    };
  }

  updateKillCamera(delta: number): void {
    if (!this.killCamera) {
      return;
    }
    this.killCamera.timer -= delta;
    if (this.killCamera.timer <= 0) {
      this.killCamera = null;
    }
  }

  update(delta: number, mode: GameMode, possessedUnit: Unit | null): void {
    if (this.killCamera) {
      this.updateKillCameraView(delta);
      return;
    }
    if (mode === 'god') {
      this.updateGodView(delta);
      return;
    }
    if (possessedUnit) {
      this.updatePossessionView(delta, possessedUnit);
    }
  }

  private updateKillCameraView(delta: number): void {
    const killCamera = this.killCamera;
    if (!killCamera) {
      return;
    }
    killCamera.angle += delta * 0.52;
    const desired = killCamera.focus.clone().add(new Vector3(
      Math.sin(killCamera.angle) * killCamera.distance,
      killCamera.distance * 0.42,
      Math.cos(killCamera.angle) * killCamera.distance,
    ));
    this.camera.position.lerp(desired, 1 - Math.exp(-delta * 7));
    this.camera.lookAt(killCamera.focus.clone().add(new Vector3(0, 1.1, 0)));
  }

  private updateGodView(delta: number): void {
    const lookDirection = new Vector3(
      Math.sin(this.godAzimuth) * Math.cos(this.godPitch),
      Math.sin(this.godPitch),
      Math.cos(this.godAzimuth) * Math.cos(this.godPitch),
    ).normalize();
    this.camera.position.lerp(
      this.godPosition,
      1 - Math.exp(-delta * 14),
    );
    this.camera.lookAt(
      this.camera.position.clone().addScaledVector(lookDirection, 120),
    );
  }

  private updatePossessionView(delta: number, unit: Unit): void {
    const anchor = unit.position.clone().add(new Vector3(
      0,
      unit.kind === 'infantry' ? 2 : unit.isAircraft ? 1.8 : 2.9,
      0,
    ));
    const aimDirection = new Vector3(
      Math.sin(this.aimYaw) * Math.cos(this.aimPitch),
      Math.sin(this.aimPitch),
      Math.cos(this.aimYaw) * Math.cos(this.aimPitch),
    ).normalize();
    if (this.cameraView === 'firstPerson') {
      const desired = anchor.clone().addScaledVector(aimDirection, 0.85);
      this.camera.position.lerp(desired, 1 - Math.exp(-delta * 18));
      this.camera.lookAt(
        anchor.clone().addScaledVector(aimDirection, 120),
      );
      return;
    }

    const distance = unit.kind === 'fighter'
      ? 18
      : unit.kind === 'helicopter'
        ? 14
        : unit.kind === 'tank'
          ? 10
          : 7;
    const height = unit.kind === 'fighter'
      ? 5.5
      : unit.kind === 'tank'
        ? 3.8
        : 2.8;
    const shoulderOffset = unit.kind === 'fighter'
      ? 4.2
      : unit.kind === 'helicopter'
        ? 3.2
        : unit.kind === 'tank'
          ? 2.4
          : unit.kind === 'drone'
            ? 1.8
            : 1.15;
    const desired = anchor.clone().addScaledVector(aimDirection, -distance);
    desired.y += height;
    desired.addScaledVector(
      flatForward(this.aimYaw + Math.PI / 2),
      shoulderOffset,
    );
    this.camera.position.lerp(desired, 1 - Math.exp(-delta * 10));
    this.camera.lookAt(anchor.clone().addScaledVector(aimDirection, 35));
  }
}
