import {
  ACESFilmicToneMapping,
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  PCFShadowMap,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  chooseReinforcementKind,
  INITIAL_FORCE,
  TARGET_UNITS_PER_FACTION,
} from './battlefield/forces';
import {
  BASE_LAYOUTS,
  FACTION_ORDER,
  OUTPOST_LAYOUTS,
  STAGING_SPAWN_LAYOUTS,
} from './battlefield/layout';
import {
  initialSpawnPosition,
  reinforcementSpawnPosition,
} from './battlefield/spawnZones';
import { createRandomBattlefieldTheme } from './battlefield/themes';
import { FACTIONS, WORLD } from './config';
import { BrickStructure } from './entities/BrickStructure';
import { Outpost } from './entities/Outpost';
import { Unit } from './entities/Unit';
import { GameInput } from './input/GameInput';
import {
  clamp,
  flatForward,
  resetTerrainStamps,
  sculptTerrain as addTerrainStamp,
  terrainHeight,
} from './math';
import { BattlefieldAI } from './systems/BattlefieldAI';
import { BrickBurstSystem } from './systems/BrickBurstSystem';
import { CombatSystem, type CombatKillEvent } from './systems/CombatSystem';
import { DiplomacySystem } from './systems/DiplomacySystem';
import { GameLoop } from './systems/GameLoop';
import type {
  CameraView,
  DeployKind,
  DiplomacyEvent,
  FactionId,
  GameMode,
  UnitKind,
} from './types';
import { Hud } from './ui/Hud';
import { BattlefieldWorld } from './world/BattlefieldWorld';

interface KillCamera {
  focus: Vector3;
  timer: number;
  duration: number;
  angle: number;
  distance: number;
}

const FORWARD_KEYS = ['KeyW', 'ArrowUp'] as const;
const BACKWARD_KEYS = ['KeyS', 'ArrowDown'] as const;
const LEFT_KEYS = ['KeyA', 'ArrowLeft'] as const;
const RIGHT_KEYS = ['KeyD', 'ArrowRight'] as const;

export class BrickWarfare {
  private readonly shell: HTMLDivElement;
  private readonly renderer: WebGLRenderer;
  private readonly softwareRendering: boolean;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(55, 1, 0.1, 2200);
  private readonly clock = new Clock();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly battlefieldTheme = createRandomBattlefieldTheme();
  private readonly world = new BattlefieldWorld(
    this.battlefieldTheme.palette,
    this.battlefieldTheme.treeDensity,
    this.battlefieldTheme.terrainProfile,
  );
  private readonly units: Unit[] = [];
  private readonly structures: BrickStructure[] = [];
  private readonly outposts: Outpost[] = [];
  private readonly headquarters = new Map<FactionId, BrickStructure>();
  private readonly destroyedHeadquarters = new Set<FactionId>();
  private readonly eliminatedFactions = new Set<FactionId>();
  private readonly resources = new Map<FactionId, number>([
    ['azure', 900],
    ['crimson', 900],
    ['amber', 900],
  ]);
  private readonly input: GameInput;
  private readonly diplomacy = new DiplomacySystem();
  private readonly brickBursts = new BrickBurstSystem(this.scene);
  private readonly combat: CombatSystem;
  private readonly ai: BattlefieldAI;
  private readonly hud: Hud;
  private readonly crashedAircraft = new Set<Unit>();
  private readonly gameLoop = new GameLoop(() => this.frame());
  private mode: GameMode = 'god';
  private cameraView: CameraView = 'thirdPerson';
  private activeFaction: FactionId = 'azure';
  private selectedUnit: Unit | null = null;
  private possessedUnit: Unit | null = null;
  private deployKind: DeployKind | null = null;
  private simulationRunning = false;
  private godPosition = new Vector3(0, 92, 180);
  private godAzimuth = Math.PI;
  private godPitch = -0.46;
  private godMoveSpeed = 58;
  private aimYaw = 0;
  private aimPitch = -0.08;
  private elapsed = 0;
  private resourceTimer = WORLD.resourceTick;
  private aiSpawnTimer = 7;
  private hudRefreshTimer = 0;
  private aiAccumulator = 0;
  private outpostAccumulator = 0;
  private diplomacyAccumulator = 0;
  private headquartersAccumulator = 0;
  private victoryFaction: FactionId | null = null;
  private killCamera: KillCamera | null = null;
  private readonly explodedUnitIds = new Set<string>();
  private readonly destroyedAt = new Map<string, number>();
  private readonly reinforcementSequence = new Map<FactionId, number>([
    ['azure', 0],
    ['crimson', 0],
    ['amber', 0],
  ]);
  private unitCleanupTimer = 2;

  constructor(container: HTMLElement) {
    this.shell = document.createElement('div');
    this.shell.className = 'game-shell';
    container.append(this.shell);

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.softwareRendering = this.detectSoftwareRendering();
    this.shell.append(this.renderer.domElement);

    this.scene.background = new Color(0x91afbd);
    this.scene.fog = new Fog(0x91afbd, 210, 760);
    this.scene.add(this.world.root);
    this.setupLighting();

    this.hud = new Hud(this.shell, {
      onStart: () => {
        this.simulationRunning = true;
        this.clock.getDelta();
        this.input.lockPointer();
        this.hud.notify(
          `랜덤 전장 · ${this.battlefieldTheme.label}`,
          this.battlefieldTheme.description,
          '#8ed8ff',
        );
        this.hud.notify('전장 네트워크 연결', '모든 진영의 지휘권과 빙의 권한이 활성화되었습니다.');
        this.hud.notify('작전 목표', '거점을 확보해 증원하고 적대 국가의 병력을 전멸시키십시오.', '#ffcf5d');
        if (this.softwareRendering) {
          this.hud.notify(
            '소프트웨어 렌더링 감지',
            '브라우저 하드웨어 가속을 켠 뒤 다시 실행하면 CPU 사용량과 프레임이 개선됩니다.',
            '#ff7b63',
          );
        }
      },
      onDeploy: (kind) => this.toggleDeploy(kind),
      onCycleFaction: () => this.cycleFaction(),
      onDiplomacy: (target) => this.interveneDiplomacy(target),
      onPossess: () => {
        if (this.selectedUnit && !this.selectedUnit.destroyed) {
          this.enterPossession(this.selectedUnit);
        }
      },
    });

    this.combat = new CombatSystem(
      this.scene,
      (event) => this.onUnitDestroyed(event),
      (damage) => this.hud.flashDamage(0.25 + damage * 2.4),
      (position, radius) => this.onWorldExplosion(position, radius),
    );
    this.ai = new BattlefieldAI((faction, strategy, reason) => {
      this.hud.notify(
        `${FACTIONS[faction].name} 작전 변경`,
        `${this.strategyLabel(strategy)} · ${reason}`,
        FACTIONS[faction].accent,
      );
    });
    this.input = new GameInput(this.renderer.domElement, {
      onKeyDown: (event) => this.handleKeyDown(event),
      onMouseDown: (event) => this.handleMouseDown(event),
      onMouseLook: (movementX, movementY) => this.handleMouseLook(movementX, movementY),
      onWheel: (deltaY) => this.handleWheel(deltaY),
      onDoubleClick: (event) => this.handleDoubleClick(event),
      onPointerLockChange: (locked) => this.handlePointerLockChange(locked),
      onResize: () => this.handleResize(),
    });

    this.createBattlefield();
    this.handleResize();
    this.world.update(this.godPosition);
    this.updateDiplomacyHud();
  }

  start(): void {
    this.gameLoop.start();
  }

  private setupLighting(): void {
    const hemisphere = new HemisphereLight(0xc9e7f2, 0x30352b, 1.65);
    this.scene.add(hemisphere);
    this.scene.add(new AmbientLight(0x8aa0a8, 0.38));
    const sun = new DirectionalLight(0xfff0d4, 3.1);
    sun.position.set(-170, 240, 95);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -330;
    sun.shadow.camera.right = 330;
    sun.shadow.camera.top = 330;
    sun.shadow.camera.bottom = -330;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 620;
    sun.shadow.bias = -0.0002;
    this.scene.add(sun);
  }

  private createBattlefield(): void {
    resetTerrainStamps();
    for (const stamp of this.battlefieldTheme.terrainStamps) {
      addTerrainStamp(stamp.kind, stamp.x, stamp.z);
    }

    for (const layout of OUTPOST_LAYOUTS) {
      const position = new Vector3(
        layout.x,
        terrainHeight(layout.x, layout.z),
        layout.z,
      );
      const outpost = new Outpost(layout.owner);
      outpost.root.position.copy(position);
      this.outposts.push(outpost);
      this.scene.add(outpost.root);
    }

    for (const faction of FACTION_ORDER) {
      const layout = BASE_LAYOUTS[faction];
      const position = new Vector3(
        layout.x,
        terrainHeight(layout.x, layout.z),
        layout.z,
      );
      const headquarters = new BrickStructure(
        position,
        { width: 10, height: 14, depth: 8 },
        FACTIONS[faction].color,
        true,
        faction,
      );
      headquarters.root.rotation.y = layout.yaw;
      this.structures.push(headquarters);
      this.headquarters.set(faction, headquarters);
      this.scene.add(headquarters.root);

      const spawnAnchors = [
        position,
        ...this.outposts
          .filter((outpost) => outpost.owner === faction)
          .map((outpost) => outpost.root.position),
        ...STAGING_SPAWN_LAYOUTS[faction].map(({ x, z }) => new Vector3(x, 0, z)),
      ];
      const zoneKindCounts = new Map<string, number>();
      INITIAL_FORCE.forEach((kind, index) => {
        const zoneIndex = kind === 'fighter' ? 0 : index % spawnAnchors.length;
        const anchor = spawnAnchors[zoneIndex];
        const countKey = `${zoneIndex}:${kind}`;
        const kindIndex = zoneKindCounts.get(countKey) ?? 0;
        zoneKindCounts.set(countKey, kindIndex + 1);
        const spawn = initialSpawnPosition(
          { x: anchor.x, z: anchor.z, yaw: layout.yaw },
          kind,
          kindIndex,
        );
        this.spawnUnit(kind, faction, spawn);
      });
    }

    for (const building of this.battlefieldTheme.buildings) {
      const position = new Vector3(building.x, terrainHeight(building.x, building.z), building.z);
      const structure = new BrickStructure(position, building, building.color, true);
      structure.root.rotation.y = (building.x * 0.13 + building.z * 0.07) % Math.PI;
      this.structures.push(structure);
      this.scene.add(structure.root);
    }
    for (const wall of this.battlefieldTheme.walls) {
      const position = new Vector3(wall.x, terrainHeight(wall.x, wall.z), wall.z);
      const structure = new BrickStructure(
        position,
        { width: wall.length, height: wall.height, depth: 1 },
        wall.color,
        false,
      );
      structure.root.rotation.y = wall.yaw;
      this.structures.push(structure);
      this.scene.add(structure.root);
    }
    this.world.setTerritories(this.outposts);
  }

  private spawnUnit(kind: UnitKind, faction: FactionId, requestedPosition: Vector3): Unit {
    const position = requestedPosition.clone();
    const ground = terrainHeight(position.x, position.z);
    position.y = kind === 'fighter' ? ground + 42 : kind === 'helicopter' ? ground + 20 : kind === 'drone' ? ground + 13 : ground;
    const unit = new Unit(kind, faction, position);
    unit.yaw = faction === 'azure' ? Math.PI / 2 : faction === 'crimson' ? -Math.PI * 0.7 : Math.PI * 1.2;
    if (kind === 'fighter') {
      unit.throttle = 0.72;
    }
    this.units.push(unit);
    this.scene.add(unit.root);
    return unit;
  }

  private frame(): void {
    const delta = Math.min(0.05, this.clock.getDelta());
    this.elapsed += delta;
    if (this.simulationRunning) {
      const simulationDelta = this.killCamera ? delta * 0.24 : delta;
      this.updateSimulation(simulationDelta);
      this.updateKillCamera(delta);
    }
    this.updateCamera(delta);
    this.world.update(
      this.mode === 'possession' && this.possessedUnit
        ? this.possessedUnit.position
        : this.godPosition,
    );
    this.updateHud(delta);
    this.renderer.render(this.scene, this.camera);
  }

  private updateSimulation(delta: number): void {
    for (const unit of this.units) {
      if (!unit.destroyed) {
        unit.beginSimulationStep();
      }
    }
    if (!this.killCamera && this.mode === 'possession' && this.possessedUnit && !this.possessedUnit.destroyed) {
      this.updatePossessedControls(delta);
    } else if (!this.killCamera && this.mode === 'god') {
      this.updateGodControls(delta);
    }

    this.aiAccumulator += delta;
    if (this.aiAccumulator >= 1 / 30) {
      const aiDelta = Math.min(this.aiAccumulator, 0.1);
      this.aiAccumulator = 0;
      this.ai.update(
        aiDelta,
        this.units,
        this.outposts,
        this.diplomacy,
        this.world.wind,
        (unit, target, mode) => {
          if (mode === 'suicide') {
            this.combat.detonateDrone(unit, this.units, this.structures);
          } else {
            this.combat.fire(unit, target, mode);
          }
        },
      );
    }

    for (const unit of this.units) {
      unit.update(delta, this.elapsed);
    }
    this.resolveStructureCollisions();
    this.checkAircraftCollisions();
    for (const unit of this.units) {
      if (unit.destroyed && !this.explodedUnitIds.has(unit.id)) {
        this.onUnitDestroyed({
          victim: unit,
          attackerFaction: unit.lastDamageFaction ?? unit.faction,
          attackerUnit: null,
          playerControlled: false,
        });
      }
    }
    for (const structure of this.structures) {
      structure.update(delta);
    }
    this.combat.update(delta, this.units, this.structures);
    this.checkFactionEliminations();
    this.brickBursts.update(delta);
    this.outpostAccumulator += delta;
    if (this.outpostAccumulator >= 0.1) {
      this.updateOutposts(this.outpostAccumulator);
      this.outpostAccumulator = 0;
    }
    this.updateEconomy(delta);
    this.diplomacyAccumulator += delta;
    if (this.diplomacyAccumulator >= 0.5) {
      this.updateDiplomacy(this.diplomacyAccumulator);
      this.diplomacyAccumulator = 0;
    }
    this.headquartersAccumulator += delta;
    if (this.headquartersAccumulator >= 0.5) {
      this.checkHeadquarters();
      this.headquartersAccumulator = 0;
    }
    this.unitCleanupTimer -= delta;
    if (this.unitCleanupTimer <= 0) {
      this.unitCleanupTimer = 2;
      this.cleanupDestroyedUnits();
    }

    if (this.possessedUnit?.destroyed && !this.killCamera) {
      this.hud.notify('빙의 연결 종료', `${this.possessedUnit.displayName}이 파괴되었습니다.`, '#ff6b63');
      this.exitPossession();
    }
  }

  private updateGodControls(delta: number): void {
    const forwardInput = this.inputAxis(FORWARD_KEYS, BACKWARD_KEYS);
    const sideInput = this.inputAxis(LEFT_KEYS, RIGHT_KEYS);
    const verticalInput = Number(this.input.isDown('Space'))
      - Number(this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    const rotateInput = Number(this.input.isDown('KeyE')) - Number(this.input.isDown('KeyQ'));
    this.godAzimuth += rotateInput * delta * 1.25;
    const cameraForward = new Vector3(
      Math.sin(this.godAzimuth) * Math.cos(this.godPitch),
      Math.sin(this.godPitch),
      Math.cos(this.godAzimuth) * Math.cos(this.godPitch),
    ).normalize();
    const cameraRight = flatForward(this.godAzimuth + Math.PI / 2);
    const speed = this.godMoveSpeed;
    this.godPosition.addScaledVector(cameraForward, forwardInput * speed * delta);
    this.godPosition.addScaledVector(cameraRight, sideInput * speed * delta);
    this.godPosition.y += verticalInput * speed * delta;
    this.godPosition.x = clamp(this.godPosition.x, -680, 680);
    this.godPosition.z = clamp(this.godPosition.z, -680, 680);
    const minimumHeight = terrainHeight(this.godPosition.x, this.godPosition.z) + 3;
    this.godPosition.y = clamp(this.godPosition.y, minimumHeight, 340);
  }

  private updatePossessedControls(delta: number): void {
    const unit = this.possessedUnit;
    if (!unit) {
      return;
    }
    const forward = this.inputAxis(FORWARD_KEYS, BACKWARD_KEYS);
    const side = this.inputAxis(LEFT_KEYS, RIGHT_KEYS);
    const up = Number(this.input.isDown('Space'))
      - Number(this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    unit.movePossessed(forward, side, up, this.aimYaw, delta, this.world.wind);
  }

  private checkAircraftCollisions(): void {
    this.crashedAircraft.clear();
    for (const unit of this.units) {
      if (unit.destroyed || (unit.kind !== 'fighter' && unit.kind !== 'helicopter')) {
        continue;
      }
      if (unit.terrainCollision || this.world.collidesWithTree(unit.position, unit.collisionRadius)) {
        this.crashedAircraft.add(unit);
        continue;
      }
      if (
        this.outposts.some((outpost) => {
          const distanceX = unit.position.x - outpost.root.position.x;
          const distanceZ = unit.position.z - outpost.root.position.z;
          const collisionRadius = unit.collisionRadius + 1.2;
          return distanceX * distanceX + distanceZ * distanceZ <= collisionRadius * collisionRadius
            && unit.position.y - unit.collisionRadius <= outpost.root.position.y + 8.4;
        })
      ) {
        this.crashedAircraft.add(unit);
        continue;
      }
      for (const other of this.units) {
        if (other === unit || other.destroyed) {
          continue;
        }
        const collisionRadius = (unit.collisionRadius + other.collisionRadius) * 0.78;
        if (unit.position.distanceToSquared(other.position) <= collisionRadius * collisionRadius) {
          this.crashedAircraft.add(unit);
          break;
        }
      }
    }
    for (const unit of this.crashedAircraft) {
      unit.applyRawDamage(unit.health, unit.faction);
    }
  }

  private resolveStructureCollisions(): void {
    for (const unit of this.units) {
      if (unit.destroyed) {
        continue;
      }
      const padding = unit.collisionRadius * (unit.isAircraft ? 0.62 : 0.72);
      if (!this.collidesWithStructure(unit.previousPosition, unit.position, padding)) {
        continue;
      }
      if (unit.kind === 'fighter' || unit.kind === 'helicopter') {
        unit.applyRawDamage(unit.health, unit.faction);
        continue;
      }
      const attemptedPosition = unit.position.clone();
      const xMovement = unit.previousPosition.clone().setX(attemptedPosition.x);
      xMovement.y = attemptedPosition.y;
      const zMovement = unit.previousPosition.clone().setZ(attemptedPosition.z);
      zMovement.y = attemptedPosition.y;
      const verticalMovement = unit.previousPosition.clone().setY(attemptedPosition.y);
      if (!this.collidesWithStructure(unit.previousPosition, xMovement, padding)) {
        unit.position.copy(xMovement);
      } else if (!this.collidesWithStructure(unit.previousPosition, zMovement, padding)) {
        unit.position.copy(zMovement);
      } else if (
        unit.isAircraft
        && !this.collidesWithStructure(unit.previousPosition, verticalMovement, padding)
      ) {
        unit.position.copy(verticalMovement);
      } else {
        unit.position.copy(unit.previousPosition);
      }
      unit.stopMovement();
    }
  }

  private collidesWithStructure(from: Vector3, to: Vector3, padding: number): boolean {
    const travelDistance = from.distanceTo(to);
    for (const structure of this.structures) {
      if (structure.destroyed) {
        continue;
      }
      const broadRadius = structure.collisionRadius + padding + travelDistance;
      if (from.distanceToSquared(structure.root.position) > broadRadius * broadRadius) {
        continue;
      }
      if (structure.intersectsWorldSegment(from, to, padding)) {
        return true;
      }
    }
    return false;
  }

  private inputAxis(
    positiveKeys: readonly string[],
    negativeKeys: readonly string[],
  ): number {
    return Number(positiveKeys.some((key) => this.input.isDown(key)))
      - Number(negativeKeys.some((key) => this.input.isDown(key)));
  }

  private updateCamera(delta: number): void {
    if (this.killCamera) {
      this.killCamera.angle += delta * 0.52;
      const desired = this.killCamera.focus.clone().add(new Vector3(
        Math.sin(this.killCamera.angle) * this.killCamera.distance,
        this.killCamera.distance * 0.42,
        Math.cos(this.killCamera.angle) * this.killCamera.distance,
      ));
      this.camera.position.lerp(desired, 1 - Math.exp(-delta * 7));
      this.camera.lookAt(this.killCamera.focus.clone().add(new Vector3(0, 1.1, 0)));
      return;
    }
    if (this.mode === 'god') {
      const lookDirection = new Vector3(
        Math.sin(this.godAzimuth) * Math.cos(this.godPitch),
        Math.sin(this.godPitch),
        Math.cos(this.godAzimuth) * Math.cos(this.godPitch),
      ).normalize();
      this.camera.position.lerp(this.godPosition, 1 - Math.exp(-delta * 14));
      this.camera.lookAt(this.camera.position.clone().addScaledVector(lookDirection, 120));
      return;
    }
    const unit = this.possessedUnit;
    if (!unit) {
      return;
    }
    const anchor = unit.position.clone().add(new Vector3(0, unit.kind === 'infantry' ? 2 : unit.isAircraft ? 1.8 : 2.9, 0));
    const aimDirection = new Vector3(
      Math.sin(this.aimYaw) * Math.cos(this.aimPitch),
      Math.sin(this.aimPitch),
      Math.cos(this.aimYaw) * Math.cos(this.aimPitch),
    ).normalize();
    if (this.cameraView === 'firstPerson') {
      const desired = anchor.clone().addScaledVector(aimDirection, 0.85);
      this.camera.position.lerp(desired, 1 - Math.exp(-delta * 18));
      this.camera.lookAt(anchor.clone().addScaledVector(aimDirection, 120));
    } else {
      const distance = unit.kind === 'fighter' ? 18 : unit.kind === 'helicopter' ? 14 : unit.kind === 'tank' ? 10 : 7;
      const height = unit.kind === 'fighter' ? 5.5 : unit.kind === 'tank' ? 3.8 : 2.8;
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
      desired.addScaledVector(flatForward(this.aimYaw + Math.PI / 2), shoulderOffset);
      this.camera.position.lerp(desired, 1 - Math.exp(-delta * 10));
      this.camera.lookAt(anchor.clone().addScaledVector(aimDirection, 35));
    }
  }

  private updateOutposts(delta: number): void {
    for (const outpost of this.outposts) {
      const capturedBy = outpost.update(delta, this.units);
      if (capturedBy) {
        this.world.setTerritories(this.outposts);
        this.hud.notify(
          '거점 점령 완료',
          `${FACTIONS[capturedBy].name}이 ${outpost.id.toUpperCase()}의 보급망을 확보했습니다.`,
          FACTIONS[capturedBy].accent,
        );
      }
    }
  }

  private updateEconomy(delta: number): void {
    this.resourceTimer -= delta;
    this.aiSpawnTimer -= delta;
    if (this.resourceTimer <= 0) {
      this.resourceTimer = WORLD.resourceTick;
      for (const faction of FACTION_ORDER) {
        if (this.eliminatedFactions.has(faction)) {
          continue;
        }
        const outpostIncome = this.outposts.filter((outpost) => outpost.owner === faction).length * 14;
        const doctrineBonus = FACTIONS[faction].doctrine === 'entrenchment' ? 4 : 0;
        this.resources.set(faction, (this.resources.get(faction) ?? 0) + 18 + outpostIncome + doctrineBonus);
      }
    }
    if (this.aiSpawnTimer <= 0) {
      this.aiSpawnTimer = 5;
      for (const faction of FACTION_ORDER) {
        this.spawnAiReinforcement(faction);
      }
    }
  }

  private spawnAiReinforcement(faction: FactionId): void {
    const alive = this.units.filter((unit) => unit.faction === faction && !unit.destroyed).length;
    if (
      alive === 0
      || alive >= TARGET_UNITS_PER_FACTION
      || this.eliminatedFactions.has(faction)
    ) {
      return;
    }
    const sequence = this.reinforcementSequence.get(faction) ?? 0;
    const ownedOutposts = this.outposts.filter((outpost) => outpost.owner === faction);
    if (ownedOutposts.length === 0) {
      return;
    }
    const strategy = this.ai.getStrategy(faction);
    const missing = TARGET_UNITS_PER_FACTION - alive;
    const spawnCount = Math.min(missing, ownedOutposts.length);
    for (let index = 0; index < spawnCount; index += 1) {
      const kind = chooseReinforcementKind(strategy);
      const nextSequence = sequence + index;
      const spawnAnchor = ownedOutposts[nextSequence % ownedOutposts.length].root.position;
      const spawn = reinforcementSpawnPosition(spawnAnchor, nextSequence);
      this.spawnUnit(kind, faction, spawn);
    }
    this.reinforcementSequence.set(faction, sequence + spawnCount);
  }

  private checkFactionEliminations(): void {
    let territoryChanged = false;
    for (const faction of FACTION_ORDER) {
      if (
        this.eliminatedFactions.has(faction)
        || this.units.some((unit) => unit.faction === faction && !unit.destroyed)
      ) {
        continue;
      }
      this.eliminatedFactions.add(faction);
      this.resources.set(faction, 0);
      for (const outpost of this.outposts) {
        if (outpost.owner === faction) {
          outpost.setOwner(null);
          territoryChanged = true;
        }
      }
      this.hud.notify(
        '국가 멸망',
        `${FACTIONS[faction].name}의 생존 병력이 모두 전멸했습니다.`,
        '#ff4f47',
      );
    }
    if (territoryChanged) {
      this.world.setTerritories(this.outposts);
    }
    const survivors = FACTION_ORDER.filter(
      (faction) => !this.eliminatedFactions.has(faction),
    );
    if (survivors.length === 1 && this.victoryFaction === null) {
      this.victoryFaction = survivors[0];
      this.hud.notify(
        '전쟁 승리',
        `${FACTIONS[this.victoryFaction].name}이 최후의 생존 국가가 되었습니다.`,
        FACTIONS[this.victoryFaction].accent,
      );
    }
  }

  private cleanupDestroyedUnits(): void {
    for (let index = this.units.length - 1; index >= 0; index -= 1) {
      const unit = this.units[index];
      const destroyedTime = this.destroyedAt.get(unit.id);
      if (!unit.destroyed || destroyedTime === undefined || this.elapsed - destroyedTime < 8) {
        continue;
      }
      if (this.selectedUnit === unit) {
        this.selectUnit(null);
      }
      if (this.possessedUnit === unit) {
        this.exitPossession();
      }
      const geometries = new Set<{ dispose: () => void }>();
      const materials = new Set<{ dispose: () => void }>();
      unit.root.traverse((object) => {
        if (!(object instanceof Mesh)) {
          return;
        }
        geometries.add(object.geometry);
        const meshMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of meshMaterials) {
          materials.add(material);
        }
      });
      unit.root.removeFromParent();
      for (const geometry of geometries) {
        geometry.dispose();
      }
      for (const material of materials) {
        material.dispose();
      }
      this.units.splice(index, 1);
      this.destroyedAt.delete(unit.id);
      this.explodedUnitIds.delete(unit.id);
    }
  }

  private updateDiplomacy(delta: number): void {
    const strength = new Map<FactionId, number>();
    for (const faction of FACTION_ORDER) {
      if (this.eliminatedFactions.has(faction)) {
        continue;
      }
      const unitStrength = this.units
        .filter((unit) => unit.faction === faction && !unit.destroyed)
        .reduce((total, unit) => total + unit.health / unit.stats.maxHealth + unit.stats.cost / 150, 0);
      const territory = this.outposts.filter((outpost) => outpost.owner === faction).length * 3;
      strength.set(faction, unitStrength + territory);
    }
    const event = this.diplomacy.update(delta, strength);
    if (event) {
      this.announceDiplomacy(event);
      this.updateDiplomacyHud();
    }
  }

  private checkHeadquarters(): void {
    for (const [faction, headquarters] of this.headquarters) {
      if (this.destroyedHeadquarters.has(faction) || headquarters.integrity > 0.18) {
        continue;
      }
      this.destroyedHeadquarters.add(faction);
      this.hud.notify(
        '지휘 본부 붕괴',
        `${FACTIONS[faction].name}의 본부가 파괴됐지만 생존 병력과 점령 거점은 계속 작전합니다.`,
        '#ff5f57',
      );
    }
  }

  private updateHud(delta: number): void {
    this.hudRefreshTimer -= delta;
    if (this.hudRefreshTimer > 0) {
      return;
    }
    this.hudRefreshTimer = 0.2;
    this.hud.setResources(this.resources.get(this.activeFaction) ?? 0);
    const unitCounts: Record<FactionId, number> = {
      azure: 0,
      crimson: 0,
      amber: 0,
    };
    for (const unit of this.units) {
      if (!unit.destroyed) {
        unitCounts[unit.faction] += 1;
      }
    }
    const outpostCounts: Record<FactionId, number> = {
      azure: 0,
      crimson: 0,
      amber: 0,
    };
    let neutralOutposts = 0;
    for (const outpost of this.outposts) {
      if (outpost.owner) {
        outpostCounts[outpost.owner] += 1;
      } else {
        neutralOutposts += 1;
      }
    }
    this.hud.setStats({
      unitCounts,
      outpostCounts,
      eliminated: {
        azure: this.eliminatedFactions.has('azure'),
        crimson: this.eliminatedFactions.has('crimson'),
        amber: this.eliminatedFactions.has('amber'),
      },
      neutralOutposts,
    });
    this.hud.setSelection(this.possessedUnit ?? this.selectedUnit);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.code === 'KeyF' && this.mode === 'god') {
      this.cycleFaction();
    } else if (event.code === 'KeyG' && this.mode === 'possession') {
      this.exitPossession();
    } else if (event.code === 'KeyV' && this.mode === 'possession') {
      this.cameraView = this.cameraView === 'thirdPerson' ? 'firstPerson' : 'thirdPerson';
      this.hud.notify('시점 전환', this.cameraView === 'firstPerson' ? '1인칭 조종 시점' : '3인칭 추적 시점');
    } else if (event.code === 'Enter' && this.mode === 'god' && this.selectedUnit && !this.selectedUnit.destroyed) {
      this.enterPossession(this.selectedUnit);
    } else if (this.mode === 'god' && event.code.startsWith('Digit')) {
      const hotkeys: DeployKind[] = [
        'tree',
        'infantry',
        'tank',
        'fighter',
        'helicopter',
        'drone',
        'wall',
        'mountain',
        'trench',
        'building',
      ];
      const digit = Number.parseInt(event.code.replace('Digit', ''), 10);
      const index = digit === 0 ? 0 : digit;
      if (hotkeys[index]) {
        this.toggleDeploy(hotkeys[index]);
      }
    }
  }

  private handleMouseLook(movementX: number, movementY: number): void {
    if (this.mode === 'possession') {
      this.aimYaw -= movementX * 0.0023;
      this.aimPitch = clamp(this.aimPitch - movementY * 0.0019, -1.1, 0.78);
      return;
    }
    this.godAzimuth -= movementX * 0.0023;
    this.godPitch = clamp(this.godPitch - movementY * 0.0019, -1.3, 1.1);
  }

  private handlePointerLockChange(locked: boolean): void {
    this.hud.setPointerLocked(locked);
    if (this.mode === 'possession' && !locked) {
      this.exitPossession();
    }
  }

  private handleWheel(deltaY: number): void {
    if (this.mode === 'god') {
      this.godMoveSpeed = clamp(this.godMoveSpeed - deltaY * 0.055, 24, 140);
    }
  }

  private handleDoubleClick(event: MouseEvent): void {
    if (this.mode !== 'god') {
      return;
    }
    const unit = this.pickUnit(event);
    if (unit && !unit.destroyed) {
      this.enterPossession(unit);
    }
  }

  private handleMouseDown(event: MouseEvent): void {
    if (!this.simulationRunning) {
      return;
    }
    if (!this.input.pointerLocked) {
      this.input.lockPointer();
    }
    if (this.mode === 'possession') {
      if ((event.button === 0 || event.button === 2) && this.possessedUnit) {
        if (event.button === 2 && this.possessedUnit.kind === 'drone') {
          this.combat.detonateDrone(
            this.possessedUnit,
            this.units,
            this.structures,
          );
          return;
        }
        if (event.button === 2 && this.possessedUnit.kind === 'infantry') {
          return;
        }
        const target = this.getCrosshairAimPoint();
        this.combat.fire(
          this.possessedUnit,
          target,
          event.button === 2 ? 'special' : 'normal',
        );
      }
      return;
    }

    if (event.button === 2) {
      this.issueGodCommand(event);
      event.preventDefault();
      return;
    }

    if (event.button === 0) {
      if (this.deployKind) {
        const point = this.pickGround(event);
        if (point) {
          this.deployAt(point);
        }
        return;
      }
      this.selectUnit(this.pickUnit(event));
    }
  }

  private getCrosshairAimPoint(): Vector3 {
    this.pointer.set(0, 0);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const possessedId = this.possessedUnit?.id;
    const intersections = this.raycaster.intersectObjects([
      ...this.world.terrainMeshes,
      ...this.structures
        .filter((structure) => !structure.destroyed)
        .map((structure) => structure.root),
      ...this.units
        .filter((unit) => !unit.destroyed && unit.id !== possessedId)
        .map((unit) => unit.root),
    ], true);
    return intersections[0]?.point.clone()
      ?? this.raycaster.ray.origin.clone().addScaledVector(
        this.raycaster.ray.direction,
        1000,
      );
  }

  private issueGodCommand(event: MouseEvent): void {
    if (!this.selectedUnit || this.selectedUnit.destroyed) {
      return;
    }
    const targetUnit = this.pickUnit(event);
    const point = targetUnit?.position.clone() ?? this.pickGround(event);
    if (!point) {
      return;
    }
    this.selectedUnit.order = {
      type: targetUnit ? 'attack' : 'move',
      destination: point,
      targetId: targetUnit?.id,
    };
    this.hud.notify(
      '전술 명령 전송',
      `${this.selectedUnit.displayName}: ${targetUnit ? '표적 교전' : '지정 위치로 이동'}`,
      FACTIONS[this.selectedUnit.faction].accent,
    );
  }

  private pickUnit(event: MouseEvent): Unit | null {
    this.setPointerFromEvent(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.units.map((unit) => unit.root), true);
    for (const intersection of intersections) {
      let object = intersection.object;
      while (object) {
        const entity = object.userData.entity as Unit | undefined;
        if (entity instanceof Unit) {
          return entity;
        }
        if (!object.parent) {
          break;
        }
        object = object.parent;
      }
    }
    return null;
  }

  private pickGround(event: MouseEvent): Vector3 | null {
    this.setPointerFromEvent(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.world.terrainMeshes, false);
    return intersections[0]?.point.clone() ?? null;
  }

  private setPointerFromEvent(event: MouseEvent): void {
    if (this.input.pointerLocked) {
      this.pointer.set(0, 0);
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private selectUnit(unit: Unit | null): void {
    this.selectedUnit?.setSelected(false);
    this.selectedUnit = unit;
    unit?.setSelected(true);
  }

  private enterPossession(unit: Unit): void {
    this.selectUnit(unit);
    this.possessedUnit?.setPossessed(false);
    this.possessedUnit = unit;
    unit.setPossessed(true);
    unit.order = null;
    this.mode = 'possession';
    this.cameraView = 'thirdPerson';
    this.aimYaw = unit.yaw;
    this.aimPitch = -0.07;
    this.hud.setMode(this.mode);
    this.hud.notify(
      '유닛 빙의 연결',
      `${FACTIONS[unit.faction].name} ${unit.displayName} 직접 조종 권한 획득`,
      FACTIONS[unit.faction].accent,
    );
    this.input.lockPointer();
  }

  private exitPossession(): void {
    if (!this.possessedUnit) {
      return;
    }
    this.godPosition.copy(this.possessedUnit.position);
    this.godPosition.y += 18;
    this.godAzimuth = this.possessedUnit.yaw + Math.PI;
    this.godPitch = -0.32;
    this.possessedUnit.setPossessed(false);
    this.possessedUnit = null;
    this.mode = 'god';
    this.hud.setMode(this.mode);
    this.input.unlockPointer();
  }

  private toggleDeploy(kind: DeployKind): void {
    this.deployKind = this.deployKind === kind ? null : kind;
    this.hud.setDeploy(this.deployKind);
  }

  private deployAt(point: Vector3): void {
    const kind = this.deployKind;
    if (!kind) {
      return;
    }
    if (kind === 'mountain' || kind === 'trench') {
      this.world.sculptTerrain(point, kind);
      this.hud.notify(
        kind === 'mountain' ? '산악 지형 생성' : '참호 지형 굴착',
        kind === 'mountain'
          ? '지면을 상승시켜 고지대와 엄폐 능선을 만들었습니다.'
          : '지면을 깊게 굴착해 차량과 보병이 이용할 참호를 만들었습니다.',
        FACTIONS[this.activeFaction].accent,
      );
      return;
    }
    if (kind === 'tree') {
      this.world.plantTree(point);
      return;
    }
    if (kind === 'building') {
      const width = 6 + Math.floor(Math.random() * 5);
      const height = 15 + Math.floor(Math.random() * 14);
      const depth = 5 + Math.floor(Math.random() * 5);
      const palette = [0x6f7778, 0x827668, 0x6d7367, 0x817069];
      const structure = new BrickStructure(
        new Vector3(point.x, terrainHeight(point.x, point.z), point.z),
        { width, height, depth },
        palette[Math.floor(Math.random() * palette.length)],
        true,
        this.activeFaction,
      );
      structure.root.rotation.y = this.godAzimuth + (Math.random() - 0.5) * 0.3;
      this.structures.push(structure);
      this.scene.add(structure.root);
      return;
    }
    if (kind === 'wall') {
      const structure = new BrickStructure(
        point,
        { width: 20, height: 6, depth: 1 },
        FACTIONS[this.activeFaction].color,
        false,
        this.activeFaction,
      );
      structure.root.rotation.y = this.godAzimuth;
      this.structures.push(structure);
      this.scene.add(structure.root);
    } else {
      if (this.eliminatedFactions.has(this.activeFaction)) {
        this.eliminatedFactions.delete(this.activeFaction);
        this.victoryFaction = null;
        this.hud.notify(
          '신 모드 국가 재건',
          `${FACTIONS[this.activeFaction].name}에 새 병력을 배치해 전장에 복귀시켰습니다.`,
          FACTIONS[this.activeFaction].accent,
        );
      }
      const unit = this.spawnUnit(kind, this.activeFaction, point);
      this.selectUnit(unit);
    }
  }

  private cycleFaction(): void {
    const index = FACTION_ORDER.indexOf(this.activeFaction);
    this.activeFaction = FACTION_ORDER[(index + 1) % FACTION_ORDER.length];
    this.hud.setFaction(this.activeFaction);
    this.updateDiplomacyHud();
  }

  private interveneDiplomacy(target: FactionId): void {
    const cost = 150;
    const balance = this.resources.get(this.activeFaction) ?? 0;
    if (balance < cost) {
      this.hud.notify('외교 영향력 부족', `관계 개입에는 ${cost} SUP가 필요합니다.`, '#ff746b');
      return;
    }
    this.resources.set(this.activeFaction, balance - cost);
    const event = this.diplomacy.intervene(this.activeFaction, target);
    this.announceDiplomacy(event);
    this.updateDiplomacyHud();
  }

  private announceDiplomacy(event: DiplomacyEvent): void {
    const relation = event.relation === 'allied' ? '동맹 체결' : event.relation === 'neutral' ? '중립 전환' : '적대 선언';
    this.hud.notify(
      `외교 전문 · ${relation}`,
      `${FACTIONS[event.from].name} ↔ ${FACTIONS[event.to].name}: ${event.reason}`,
      event.relation === 'allied' ? '#64e59b' : event.relation === 'hostile' ? '#ff6860' : '#e7c46a',
    );
  }

  private updateDiplomacyHud(): void {
    this.hud.setRelations(this.diplomacy.forFaction(this.activeFaction));
  }

  private onUnitDestroyed(event: CombatKillEvent): void {
    if (this.explodedUnitIds.has(event.victim.id)) {
      return;
    }
    this.explodedUnitIds.add(event.victim.id);
    this.destroyedAt.set(event.victim.id, this.elapsed);
    const baseColor = new Color(FACTIONS[event.victim.faction].color);
    const debrisColors = [
      baseColor.getHex(),
      baseColor.clone().multiplyScalar(0.58).getHex(),
      0x111820,
      0xd7dce0,
    ];
    this.brickBursts.burstObject(
      event.victim.model,
      debrisColors,
      event.victim.kind === 'tank' ? 16 : event.victim.isAircraft ? 14 : 11,
    );
    event.victim.hideDestroyedModel();
    this.onWorldExplosion(
      event.victim.position.clone(),
      event.victim.collisionRadius * 2.2 + 3,
    );

    const playerDeath = event.victim === this.possessedUnit;
    const playerKill = event.playerControlled && !playerDeath;
    const victimName = `${FACTIONS[event.victim.faction].name} ${event.victim.displayName}`;

    if (playerDeath || playerKill) {
      this.startKillCamera(event.victim, playerDeath);
    } else if (Math.random() < 0.4 || event.victim.kind === 'tank' || event.victim.isAircraft) {
      this.hud.notify(
        '전장 손실 보고',
        `${FACTIONS[event.attackerFaction].name}이 ${victimName}을 파괴했습니다.`,
        FACTIONS[event.attackerFaction].accent,
      );
    }
  }

  private onWorldExplosion(position: Vector3, radius: number): void {
    const trees = this.world.destroyTrees(position, Math.max(4, radius * 1.25));
    for (const tree of trees) {
      this.brickBursts.burstAt(
        tree.position.clone().add(new Vector3(0, 2.2 * tree.scale, 0)),
        [0x3f2a1d, 0x68452a, 0x174f2b, 0x2e7b3f],
        Math.round(8 + tree.scale * 5),
        8 + tree.scale * 3,
      );
    }
  }

  private startKillCamera(victim: Unit, playerDeath: boolean): void {
    if (playerDeath) {
      this.exitPossession();
    }
    this.killCamera = {
      focus: victim.position.clone(),
      timer: 3.35,
      duration: 3.35,
      angle: this.godAzimuth + Math.PI * 0.65,
      distance: clamp(8 + victim.collisionRadius * 3.8, 10, 26),
    };
  }

  private updateKillCamera(delta: number): void {
    if (!this.killCamera) {
      return;
    }
    this.killCamera.timer -= delta;
    if (this.killCamera.timer <= 0) {
      this.killCamera = null;
    }
  }

  private handleResize(): void {
    const width = this.shell.clientWidth;
    const height = this.shell.clientHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.setSize(width, height, false);
  }

  private detectSoftwareRendering(): boolean {
    const context = this.renderer.getContext();
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    if (!debugInfo) {
      return false;
    }
    const rendererName = String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
    return /swiftshader|llvmpipe|software|basic render/i.test(rendererName);
  }

  private strategyLabel(strategy: string): string {
    const labels: Record<string, string> = {
      assault: '기갑 집중 돌파',
      capture: '전진 거점 확보',
      defend: '종심 방어',
      'air-superiority': '항공 우세 확보',
      entrench: '참호 방어선 구축',
    };
    return labels[strategy] ?? strategy;
  }
}
