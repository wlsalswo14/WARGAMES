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
import { chooseReinforcementKind } from './battlefield/forces';
import {
  CHALLENGE_STRUCTURES,
  CHALLENGE_THEME,
  getChallengeLayout,
} from './battlefield/challengeLayout';
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
import {
  createHeadquartersPlan,
  createPlayerBuildingPlan,
  createStructureFromPlan,
  type StructurePlan,
} from './battlefield/structurePlans';
import { createRandomBattlefieldTheme } from './battlefield/themes';
import { FACTIONS, WORLD } from './config';
import { BrickStructure } from './entities/BrickStructure';
import { Outpost } from './entities/Outpost';
import { Unit } from './entities/Unit';
import { GameInput } from './input/GameInput';
import {
  resetTerrainStamps,
  sculptTerrain as addTerrainStamp,
  terrainHeight,
} from './math';
import {
  getChallengeFactions,
  getRequestedChallengeFormat,
  getRequestedPlayMode,
  PLAY_MODE_CONFIGS,
  type ChallengeFormat,
  type PlayMode,
} from './modes/PlayMode';
import { AdaptiveDirector } from './systems/AdaptiveDirector';
import { BattleAudio } from './systems/BattleAudio';
import { BattlefieldAI } from './systems/BattlefieldAI';
import { BattleCamera } from './systems/BattleCamera';
import { BrickBurstSystem } from './systems/BrickBurstSystem';
import { ChallengeSession } from './systems/ChallengeSession';
import { CombatSystem, type CombatKillEvent } from './systems/CombatSystem';
import { DiplomacySystem } from './systems/DiplomacySystem';
import { GameLoop } from './systems/GameLoop';
import { UnitCollisionSystem } from './systems/UnitCollisionSystem';
import type {
  DeployKind,
  DiplomacyEvent,
  FactionId,
  GameMode,
  UnitKind,
} from './types';
import { Hud } from './ui/Hud';
import { BattlefieldWorld } from './world/BattlefieldWorld';

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
  private readonly battleCamera = new BattleCamera(this.camera);
  private readonly clock = new Clock();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly playMode = getRequestedPlayMode();
  private readonly testMode = new URLSearchParams(window.location.search).has('test');
  private readonly challengeFormat = getRequestedChallengeFormat();
  private readonly modeConfig = PLAY_MODE_CONFIGS[this.playMode];
  private readonly activeFactions = this.playMode === 'challenge'
    ? getChallengeFactions(this.challengeFormat)
    : this.modeConfig.activeFactions;
  private readonly challengeLayout = getChallengeLayout(this.challengeFormat);
  private readonly battlefieldTheme = this.playMode === 'challenge'
    ? CHALLENGE_THEME
    : createRandomBattlefieldTheme();
  private readonly world = new BattlefieldWorld(
    this.battlefieldTheme.palette,
    this.battlefieldTheme.treeDensity,
    this.battlefieldTheme.terrainProfile,
    this.modeConfig.chunkRadius,
  );
  private readonly units: Unit[] = [];
  private readonly structures: BrickStructure[] = [];
  private readonly outposts: Outpost[] = [];
  private readonly headquarters = new Map<FactionId, BrickStructure>();
  private readonly destroyedHeadquarters = new Set<FactionId>();
  private readonly eliminatedFactions = new Set<FactionId>();
  private readonly resources = new Map<FactionId, number>(
    FACTION_ORDER.map((faction) => [
      faction,
      this.modeConfig.startingResources[faction],
    ]),
  );
  private readonly input: GameInput;
  private readonly diplomacy = new DiplomacySystem();
  private readonly brickBursts = new BrickBurstSystem(this.scene);
  private readonly audio = new BattleAudio();
  private readonly combat: CombatSystem;
  private readonly collisions: UnitCollisionSystem;
  private readonly ai: BattlefieldAI;
  private readonly hud: Hud;
  private readonly challengeSession = this.playMode === 'challenge'
    ? new ChallengeSession({
        duration: this.testMode ? 45 : (this.modeConfig.matchDuration ?? 180),
        possessionDuration: this.modeConfig.possessionDuration,
        possessionRecharge: this.modeConfig.possessionRecharge,
        scoreLimit: this.testMode ? 20 : 100,
        activeFactions: this.activeFactions,
      })
    : null;
  private adaptiveDirector: AdaptiveDirector | null = null;
  private readonly gameLoop = new GameLoop(() => this.frame());
  private mode: GameMode = 'god';
  private activeFaction: FactionId = 'azure';
  private selectedUnit: Unit | null = null;
  private possessedUnit: Unit | null = null;
  private deployKind: DeployKind | null = null;
  private simulationRunning = false;
  private elapsed = 0;
  private resourceTimer = WORLD.resourceTick;
  private aiSpawnTimer = 7;
  private hudRefreshTimer = 0;
  private aiAccumulator = 0;
  private outpostAccumulator = 0;
  private diplomacyAccumulator = 0;
  private headquartersAccumulator = 0;
  private victoryFaction: FactionId | null = null;
  private adaptiveSyncTimer = 0;
  private challengeResultShown = false;
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

    this.renderer = new WebGLRenderer({
      antialias: this.playMode === 'sandbox',
      powerPreference: 'high-performance',
    });
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.shadowMap.enabled = this.playMode === 'sandbox';
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
    if (this.playMode === 'challenge' && this.challengeFormat === 'triple') {
      this.diplomacy.set('azure', 'amber', 'hostile');
    }

    this.hud = new Hud(
      this.shell,
      this.playMode,
      this.challengeFormat,
      {
        onStart: () => {
          this.audio.resume();
          this.simulationRunning = true;
          this.challengeSession?.start();
          if (this.playMode === 'challenge') {
            const commandUnit = this.units.find(
              (unit) => unit.faction === this.activeFaction && unit.kind === 'tank',
            ) ?? this.units.find((unit) => unit.faction === this.activeFaction);
            if (commandUnit) {
              this.selectUnit(commandUnit);
            }
          }
          this.clock.getDelta();
          this.input.lockPointer();
          if (this.playMode === 'challenge') {
            const scoreLimit = this.challengeSession?.snapshot().scoreLimit ?? 100;
            this.hud.notify(
              `작전 개시 · ${this.battlefieldTheme.label}`,
              `A·B·C 확보 → ${scoreLimit}점 선취 · 1/2/3 명령 · Enter 직접 조종`,
              '#ffcf5d',
            );
          } else {
            this.hud.notify(
              `전장 전개 · ${this.battlefieldTheme.label}`,
              this.battlefieldTheme.description,
              '#8ed8ff',
            );
            this.hud.notify(
              'Sandbox 연결',
              '모든 진영과 지형 도구를 무제한으로 사용할 수 있습니다.',
            );
          }
          if (this.softwareRendering) {
            this.hud.notify(
              '소프트웨어 렌더링 감지',
              '브라우저 하드웨어 가속을 켠 뒤 다시 실행하면 CPU 사용량과 프레임이 개선됩니다.',
              '#ff7b63',
            );
          }
        },
        onModeSelect: (mode) => this.selectPlayMode(mode),
        onFormatSelect: (format) => this.selectChallengeFormat(format),
        onDeploy: (kind) => this.toggleDeploy(kind),
        onCycleFaction: () => this.cycleFaction(),
        onDiplomacy: (target) => this.interveneDiplomacy(target),
        onPossess: () => {
          if (this.selectedUnit && !this.selectedUnit.destroyed) {
            this.enterPossession(this.selectedUnit);
          }
        },
      },
    );

    this.combat = new CombatSystem(
      this.scene,
      (event) => this.onUnitDestroyed(event),
      (damage) => this.hud.flashDamage(0.25 + damage * 2.4),
      (position, radius) => this.onWorldExplosion(position, radius),
      this.playMode === 'challenge' ? 72 : WORLD.maxProjectiles,
    );
    this.collisions = new UnitCollisionSystem({
      units: this.units,
      structures: this.structures,
      outposts: this.outposts,
      world: this.world,
      diplomacy: this.diplomacy,
      detonateDrone: (drone) => {
        this.combat.detonateDrone(
          drone,
          this.units,
          this.structures,
        );
      },
    });
    this.ai = new BattlefieldAI((faction, strategy, reason) => {
      this.hud.notify(
        `${FACTIONS[faction].name} 작전 변경`,
        `${this.strategyLabel(strategy)} · ${reason}`,
        FACTIONS[faction].accent,
      );
    }, this.activeFactions);
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
    this.hud.configureMode(this.modeConfig);
    this.handleResize();
    this.world.update(this.battleCamera.godPosition);
    this.updateDiplomacyHud();
  }

  start(): void {
    this.gameLoop.start();
  }

  private selectPlayMode(mode: PlayMode): void {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', mode);
    window.location.assign(url);
  }

  private selectChallengeFormat(format: ChallengeFormat): void {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'challenge');
    url.searchParams.set('factions', format === 'triple' ? '3' : '2');
    window.location.assign(url);
  }

  private setupLighting(): void {
    const hemisphere = new HemisphereLight(0xc9e7f2, 0x30352b, 1.65);
    this.scene.add(hemisphere);
    this.scene.add(new AmbientLight(0x8aa0a8, 0.38));
    const sun = new DirectionalLight(0xfff0d4, 3.1);
    sun.position.set(-170, 240, 95);
    sun.castShadow = this.playMode === 'sandbox';
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

    const outpostLayouts = this.playMode === 'challenge'
      ? this.challengeLayout.outposts
      : OUTPOST_LAYOUTS;
    const baseLayouts = this.playMode === 'challenge'
      ? this.challengeLayout.bases
      : BASE_LAYOUTS;
    const stagingLayouts = this.playMode === 'challenge'
      ? this.challengeLayout.staging
      : STAGING_SPAWN_LAYOUTS;

    for (const [index, layout] of outpostLayouts.entries()) {
      const position = new Vector3(
        layout.x,
        terrainHeight(layout.x, layout.z),
        layout.z,
      );
      const outpost = new Outpost(
        layout.owner,
        layout.label ?? `${index + 1}`,
      );
      outpost.root.position.copy(position);
      this.outposts.push(outpost);
      this.scene.add(outpost.root);
    }

    for (const faction of this.activeFactions) {
      const layout = baseLayouts[faction];
      const position = new Vector3(
        layout.x,
        terrainHeight(layout.x, layout.z),
        layout.z,
      );
      const headquarters = createStructureFromPlan(
        createHeadquartersPlan(
          faction,
          position.x,
          position.z,
          layout.yaw,
          this.playMode === 'challenge',
        ),
      );
      this.structures.push(headquarters);
      this.headquarters.set(faction, headquarters);
      this.scene.add(headquarters.root);

      const spawnAnchors = [
        position,
        ...this.outposts
          .filter((outpost) => outpost.owner === faction)
          .map((outpost) => outpost.root.position),
        ...stagingLayouts[faction].map(({ x, z }) => new Vector3(x, 0, z)),
      ];
      const zoneKindCounts = new Map<string, number>();
      this.modeConfig.initialForce.forEach((kind, index) => {
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

    const structurePlans = this.playMode === 'challenge'
      ? CHALLENGE_STRUCTURES
      : this.createSandboxStructurePlans();
    for (const plan of structurePlans) {
      const structure = createStructureFromPlan(plan);
      this.structures.push(structure);
      this.scene.add(structure.root);
    }
    this.world.setTerritories(this.outposts);
    if (this.playMode === 'challenge') {
      this.adaptiveDirector = new AdaptiveDirector(this.outposts);
    }
  }

  private createSandboxStructurePlans(): StructurePlan[] {
    const buildings: StructurePlan[] = this.battlefieldTheme.buildings.map(
      (building, index) => ({
        id: `sandbox-building-${index + 1}`,
        kind: 'building',
        x: building.x,
        z: building.z,
        width: building.width,
        height: building.height,
        depth: building.depth,
        yaw: (building.x * 0.13 + building.z * 0.07) % Math.PI,
        color: building.color,
        openCenter: true,
      }),
    );
    const walls: StructurePlan[] = this.battlefieldTheme.walls.map(
      (wall, index) => ({
        id: `sandbox-wall-${index + 1}`,
        kind: 'wall',
        x: wall.x,
        z: wall.z,
        width: wall.length,
        height: wall.height,
        depth: 1,
        yaw: wall.yaw,
        color: wall.color,
        openCenter: false,
      }),
    );
    return [...buildings, ...walls];
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
    const wallDelta = Math.min(0.5, this.clock.getDelta());
    const maximumSimulationDelta = this.playMode === 'challenge' ? 0.1 : 0.05;
    const delta = Math.min(maximumSimulationDelta, wallDelta);
    this.elapsed += delta;
    if (this.simulationRunning) {
      const simulationDelta = this.battleCamera.isKillCameraActive
        ? delta * 0.24
        : delta;
      this.updateSimulation(simulationDelta, wallDelta);
      this.battleCamera.updateKillCamera(delta);
    }
    this.battleCamera.update(delta, this.mode, this.possessedUnit);
    this.world.update(
      this.mode === 'possession' && this.possessedUnit
        ? this.possessedUnit.position
        : this.battleCamera.godPosition,
    );
    this.updateHud(delta);
    this.audio.update(
      wallDelta,
      this.simulationRunning,
      this.mode === 'possession' || this.combat.projectiles.length >= 6,
    );
    this.renderer.render(this.scene, this.camera);
  }

  private updateSimulation(delta: number, challengeDelta: number): void {
    for (const unit of this.units) {
      if (!unit.destroyed) {
        unit.beginSimulationStep();
      }
    }
    if (
      !this.battleCamera.isKillCameraActive
      && this.mode === 'possession'
      && this.possessedUnit
      && !this.possessedUnit.destroyed
    ) {
      this.updatePossessedControls(delta);
    } else if (!this.battleCamera.isKillCameraActive && this.mode === 'god') {
      this.updateGodControls(delta);
    }

    this.aiAccumulator += delta;
    const aiInterval = this.playMode === 'challenge' ? 1 / 15 : 1 / 20;
    if (this.aiAccumulator >= aiInterval) {
      const aiDelta = Math.min(this.aiAccumulator, 0.1);
      this.aiAccumulator = 0;
      this.ai.update(
        aiDelta,
        this.units,
        this.outposts,
        this.structures,
        this.diplomacy,
        this.world.wind,
        (unit, target, mode) => {
          if (mode === 'suicide') {
            this.combat.detonateDrone(unit, this.units, this.structures);
          } else if (
            this.combat.fire(unit, target, mode)
            && unit.position.distanceToSquared(this.camera.position) <= 180 * 180
          ) {
            this.audio.fire(unit.kind, mode);
          }
        },
      );
    }

    for (const unit of this.units) {
      unit.update(delta, this.elapsed);
    }
    this.collisions.update();
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
    if (this.modeConfig.enableDiplomacy) {
      this.diplomacyAccumulator += delta;
      if (this.diplomacyAccumulator >= 0.5) {
        this.updateDiplomacy(this.diplomacyAccumulator);
        this.diplomacyAccumulator = 0;
      }
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
    this.updateChallenge(challengeDelta);

    if (
      this.possessedUnit?.destroyed
      && !this.battleCamera.isKillCameraActive
    ) {
      this.hud.notify(
        '빙의 연결 종료',
        `${this.possessedUnit.displayName}이 파괴되었습니다.`,
        '#ff6b63',
      );
      this.exitPossession();
    }
  }

  private updateChallenge(delta: number): void {
    if (!this.challengeSession || !this.adaptiveDirector) {
      return;
    }
    const prediction = this.adaptiveDirector.update(delta, this.outposts);
    this.adaptiveSyncTimer -= delta;
    if (
      this.adaptiveSyncTimer <= 0
      && prediction.targetId
      && prediction.confidence >= 0.24
    ) {
      this.adaptiveSyncTimer = 4;
      for (const faction of this.activeFactions) {
        if (faction !== this.activeFaction) {
          this.ai.setPriorityObjective(faction, prediction.targetId, 5.5);
        }
      }
    }

    const snapshot = this.challengeSession.update(
      delta,
      this.getChallengeOutpostCounts(),
    );
    if (
      this.mode === 'possession'
      && this.possessedUnit
      && this.modeConfig.possessionDuration !== null
      && snapshot.possessionSeconds <= 0
    ) {
      this.hud.notify(
        '빙의 시간 종료',
        '지휘 링크가 재충전을 시작합니다.',
        '#ffcf5d',
      );
      this.exitPossession();
    }
    if (snapshot.finished && !this.challengeResultShown) {
      this.challengeResultShown = true;
      this.simulationRunning = false;
      this.input.unlockPointer();
      this.audio.result(snapshot.winner === this.activeFaction);
      this.hud.showResult(snapshot);
    }
  }

  private getChallengeOutpostCounts(): Record<FactionId, number> {
    const counts: Record<FactionId, number> = {
      azure: 0,
      crimson: 0,
      amber: 0,
    };
    for (const outpost of this.outposts) {
      if (outpost.owner) {
        counts[outpost.owner] += 1;
      }
    }
    return counts;
  }

  private updateGodControls(delta: number): void {
    const forwardInput = this.inputAxis(FORWARD_KEYS, BACKWARD_KEYS);
    const sideInput = this.inputAxis(RIGHT_KEYS, LEFT_KEYS);
    const verticalInput = Number(this.input.isDown('Space'))
      - Number(this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    const rotateInput = Number(this.input.isDown('KeyE')) - Number(this.input.isDown('KeyQ'));
    this.battleCamera.updateGodMovement({
      forward: forwardInput,
      side: sideInput,
      vertical: verticalInput,
      rotate: rotateInput,
    }, delta);
  }

  private updatePossessedControls(delta: number): void {
    const unit = this.possessedUnit;
    if (!unit) {
      return;
    }
    const forward = this.inputAxis(FORWARD_KEYS, BACKWARD_KEYS);
    const side = this.inputAxis(RIGHT_KEYS, LEFT_KEYS);
    const up = Number(this.input.isDown('Space'))
      - Number(this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    unit.movePossessed(
      forward,
      side,
      up,
      this.battleCamera.possessionYaw,
      delta,
      this.world.wind,
    );
  }

  private inputAxis(
    positiveKeys: readonly string[],
    negativeKeys: readonly string[],
  ): number {
    return Number(positiveKeys.some((key) => this.input.isDown(key)))
      - Number(negativeKeys.some((key) => this.input.isDown(key)));
  }

  private updateOutposts(delta: number): void {
    for (const outpost of this.outposts) {
      const capturedBy = outpost.update(delta, this.units);
      if (capturedBy) {
        this.world.setTerritories(this.outposts);
        this.challengeSession?.recordCapture(capturedBy);
        this.audio.capture(capturedBy);
        this.hud.notify(
          `${outpost.label} 거점 점령`,
          `${FACTIONS[capturedBy].name}이 전선을 확보했습니다. +8점`,
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
      for (const faction of this.activeFactions) {
        if (this.eliminatedFactions.has(faction)) {
          continue;
        }
        const outpostCount = this.outposts.filter(
          (outpost) => outpost.owner === faction,
        ).length;
        const outpostIncome = outpostCount * (this.playMode === 'challenge' ? 4 : 14);
        const baseIncome = this.playMode === 'challenge' ? 5 : 18;
        const doctrineBonus = FACTIONS[faction].doctrine === 'entrenchment' ? 4 : 0;
        this.resources.set(
          faction,
          (this.resources.get(faction) ?? 0)
            + baseIncome
            + outpostIncome
            + doctrineBonus,
        );
      }
    }
    if (this.aiSpawnTimer <= 0) {
      this.aiSpawnTimer = 5;
      for (const faction of this.activeFactions) {
        this.spawnAiReinforcement(faction);
      }
    }
  }

  private spawnAiReinforcement(faction: FactionId): void {
    const alive = this.units.filter((unit) => unit.faction === faction && !unit.destroyed).length;
    if (
      alive === 0
      || alive >= this.modeConfig.targetUnitsPerFaction
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
    const missing = this.modeConfig.targetUnitsPerFaction - alive;
    const spawnCount = Math.min(missing, ownedOutposts.length);
    let spawnedCount = 0;
    for (let index = 0; index < spawnCount; index += 1) {
      const requestedKind = chooseReinforcementKind(strategy);
      const kind = this.playMode === 'challenge'
        && (requestedKind === 'fighter' || requestedKind === 'helicopter')
        ? 'drone'
        : requestedKind;
      const reinforcementCost = this.modeConfig.deploymentCosts[kind] ?? 0;
      const balance = this.resources.get(faction) ?? 0;
      if (!this.modeConfig.unlimitedDeployment && balance < reinforcementCost) {
        break;
      }
      const nextSequence = sequence + index;
      const spawnAnchor = ownedOutposts[nextSequence % ownedOutposts.length].root.position;
      const spawn = reinforcementSpawnPosition(spawnAnchor, nextSequence);
      this.spawnUnit(kind, faction, spawn);
      spawnedCount += 1;
      if (!this.modeConfig.unlimitedDeployment) {
        this.resources.set(faction, balance - reinforcementCost);
      }
    }
    this.reinforcementSequence.set(faction, sequence + spawnedCount);
  }

  private checkFactionEliminations(): void {
    let territoryChanged = false;
    for (const faction of this.activeFactions) {
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
      if (this.challengeSession && faction === this.activeFaction) {
        const opponents = this.activeFactions.filter(
          (candidate) => candidate !== this.activeFaction
            && !this.eliminatedFactions.has(candidate),
        );
        this.challengeSession.finish(
          this.findLeadingFaction(opponents),
          'elimination',
        );
      }
    }
    if (territoryChanged) {
      this.world.setTerritories(this.outposts);
    }
    const survivors = this.activeFactions.filter(
      (faction) => !this.eliminatedFactions.has(faction),
    );
    if (survivors.length === 1 && this.victoryFaction === null) {
      this.victoryFaction = survivors[0];
      this.challengeSession?.finish(this.victoryFaction, 'elimination');
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
      if (this.challengeSession) {
        const opponents = this.activeFactions.filter(
          (candidate) => candidate !== this.activeFaction,
        );
        if (faction === this.activeFaction) {
          this.challengeSession.finish(
            this.findLeadingFaction(opponents),
            'headquarters',
          );
        } else if (
          opponents.every(
            (opponent) => this.destroyedHeadquarters.has(opponent)
              || this.eliminatedFactions.has(opponent),
          )
        ) {
          this.challengeSession.finish(this.activeFaction, 'headquarters');
        }
      }
    }
  }

  private findLeadingFaction(candidates: readonly FactionId[]): FactionId | null {
    const scores = this.challengeSession?.snapshot().scores;
    if (!scores || candidates.length === 0) {
      return null;
    }
    return [...candidates].sort(
      (left, right) => scores[right] - scores[left],
    )[0] ?? null;
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
    if (this.challengeSession && this.adaptiveDirector) {
      this.hud.setChallengeState({
        session: this.challengeSession.snapshot(),
        prediction: this.adaptiveDirector.getPrediction(),
        objectives: this.outposts.map((outpost) => ({
          label: outpost.label,
          owner: outpost.owner,
          captureFaction: outpost.captureFaction,
          capturePercent: Math.min(
            100,
            (outpost.captureProgress / WORLD.outpostCaptureTime) * 100,
          ),
          contested: outpost.contested,
        })),
      });
    }
    this.hud.setSelection(this.possessedUnit ?? this.selectedUnit);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.code === 'KeyF' && this.mode === 'god') {
      this.cycleFaction();
    } else if (event.code === 'KeyG' && this.mode === 'possession') {
      this.exitPossession();
    } else if (event.code === 'KeyV' && this.mode === 'possession') {
      const cameraView = this.battleCamera.toggleView();
      this.hud.notify(
        '시점 전환',
        cameraView === 'firstPerson'
          ? '1인칭 조종 시점'
          : '3인칭 추적 시점',
      );
    } else if (event.code === 'Enter' && this.mode === 'god' && this.selectedUnit && !this.selectedUnit.destroyed) {
      this.enterPossession(this.selectedUnit);
    } else if (
      this.playMode === 'challenge'
      && this.mode === 'god'
      && ['Digit1', 'Digit2', 'Digit3'].includes(event.code)
    ) {
      const objectiveIndex = Number.parseInt(event.code.slice(-1), 10) - 1;
      this.commandSelectedToOutpost(objectiveIndex);
      event.preventDefault();
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
    this.battleCamera.handleMouseLook(
      this.mode,
      movementX,
      movementY,
    );
  }

  private handlePointerLockChange(locked: boolean): void {
    this.hud.setPointerLocked(locked);
    if (this.mode === 'possession' && !locked) {
      this.exitPossession();
    }
  }

  private handleWheel(deltaY: number): void {
    if (this.mode === 'god') {
      this.battleCamera.adjustGodMoveSpeed(deltaY);
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
        const attackMode = event.button === 2 ? 'special' : 'normal';
        if (this.combat.fire(
          this.possessedUnit,
          target,
          attackMode,
        )) {
          this.audio.fire(this.possessedUnit.kind, attackMode);
        }
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
    if (
      this.playMode === 'challenge'
      && this.selectedUnit.faction !== this.activeFaction
    ) {
      this.hud.notify(
        '명령 권한 없음',
        'Challenge에서는 청람 연합 유닛만 지휘할 수 있습니다.',
        '#ff746b',
      );
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
    const commandedOutpost = this.findClosestOutpost(point, 42);
    if (this.adaptiveDirector) {
      const observation = this.adaptiveDirector.observeCommand(
        this.selectedUnit.kind,
        commandedOutpost,
        this.outposts,
      );
      if (observation.deceptionTriggered) {
        this.challengeSession?.recordDeception();
        this.hud.notify(
          '전술 기만 성공',
          '적 예비대가 잘못된 거점으로 이동했습니다. +5점',
          '#70e1a1',
        );
      }
    }
    this.hud.notify(
      '전술 명령 전송',
      `${this.selectedUnit.displayName}: ${targetUnit ? '표적 교전' : '지정 위치로 이동'}`,
      FACTIONS[this.selectedUnit.faction].accent,
    );
    this.audio.command();
  }

  private commandSelectedToOutpost(index: number): void {
    const outpost = this.outposts[index];
    if (!outpost) {
      return;
    }
    if (!this.selectedUnit || this.selectedUnit.destroyed) {
      const fallback = this.units.find(
        (unit) => unit.faction === this.activeFaction && !unit.destroyed,
      );
      if (!fallback) {
        return;
      }
      this.selectUnit(fallback);
    }
    const unit = this.selectedUnit;
    if (!unit || unit.faction !== this.activeFaction) {
      return;
    }
    unit.order = {
      type: 'move',
      destination: outpost.root.position.clone(),
    };
    if (this.adaptiveDirector) {
      const observation = this.adaptiveDirector.observeCommand(
        unit.kind,
        outpost,
        this.outposts,
      );
      if (observation.deceptionTriggered) {
        this.challengeSession?.recordDeception();
        this.hud.notify(
          '전술 기만 성공',
          '적 예비대가 잘못된 거점으로 이동했습니다. +5점',
          '#70e1a1',
        );
      }
    }
    this.hud.notify(
      `${outpost.label} 거점 진격`,
      `${unit.displayName}에 점령 명령을 전송했습니다. Enter로 직접 조종할 수 있습니다.`,
      FACTIONS[unit.faction].accent,
    );
    this.audio.command();
  }

  private findClosestOutpost(point: Vector3, maximumDistance: number): Outpost | null {
    let closest: Outpost | null = null;
    let closestDistance = maximumDistance * maximumDistance;
    for (const outpost of this.outposts) {
      const distance = outpost.root.position.distanceToSquared(point);
      if (distance < closestDistance) {
        closest = outpost;
        closestDistance = distance;
      }
    }
    return closest;
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
    if (this.playMode === 'challenge' && unit.faction !== this.activeFaction) {
      this.hud.notify(
        '빙의 권한 없음',
        '적월 유닛의 전술 링크에는 접속할 수 없습니다.',
        '#ff746b',
      );
      return;
    }
    const possessionLimited = this.playMode === 'challenge'
      && this.modeConfig.possessionDuration !== null
      && this.modeConfig.possessionRecharge > 0;
    if (
      possessionLimited
      && this.challengeSession
      && !this.challengeSession.beginPossession()
    ) {
      const link = this.challengeSession.snapshot().linkPercent;
      this.hud.notify(
        '지휘 링크 재충전 중',
        `빙의 링크 ${Math.floor(link)}% · 100%에서 다시 접속할 수 있습니다.`,
        '#ffcf5d',
      );
      return;
    }
    this.selectUnit(unit);
    this.possessedUnit?.setPossessed(false);
    this.possessedUnit = unit;
    unit.setPossessed(true);
    unit.order = null;
    this.mode = 'possession';
    this.audio.link(true);
    this.battleCamera.beginPossession(unit);
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
    this.battleCamera.returnToGod(this.possessedUnit);
    this.possessedUnit.setPossessed(false);
    this.possessedUnit = null;
    if (this.playMode === 'challenge') {
      this.challengeSession?.endPossession();
    }
    this.mode = 'god';
    this.audio.link(false);
    this.hud.setMode(this.mode);
    this.input.unlockPointer();
  }

  private toggleDeploy(kind: DeployKind): void {
    if (!this.modeConfig.allowedDeployments.includes(kind)) {
      this.hud.notify(
        'Challenge 제한',
        '지형 편집 도구는 Sandbox에서만 사용할 수 있습니다.',
        '#ffcf5d',
      );
      return;
    }
    this.deployKind = this.deployKind === kind ? null : kind;
    this.hud.setDeploy(this.deployKind);
  }

  private deployAt(point: Vector3): void {
    const kind = this.deployKind;
    if (!kind) {
      return;
    }
    if (
      this.playMode === 'challenge'
      && this.eliminatedFactions.has(this.activeFaction)
    ) {
      this.hud.notify(
        '작전 종료',
        '전멸한 진영은 다시 배치할 수 없습니다.',
        '#ff746b',
      );
      return;
    }
    if (
      !this.modeConfig.unlimitedDeployment
      && this.playMode === 'challenge'
      && (kind === 'infantry'
        || kind === 'tank'
        || kind === 'fighter'
        || kind === 'helicopter'
        || kind === 'drone')
      && this.units.filter(
        (unit) => unit.faction === this.activeFaction && !unit.destroyed,
      ).length >= this.modeConfig.targetUnitsPerFaction + 4
    ) {
      this.hud.notify(
        '지휘 한도 도달',
        '동시 운용 병력은 최대 16개입니다.',
        '#ffcf5d',
      );
      return;
    }
    if (!this.spendDeploymentCost(kind)) {
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
      const structure = createStructureFromPlan(
        createPlayerBuildingPlan(
          point,
          this.battleCamera.heading,
          this.activeFaction,
        ),
      );
      this.structures.push(structure);
      this.scene.add(structure.root);
      return;
    }
    if (kind === 'wall') {
      const structure = new BrickStructure(
        new Vector3(point.x, terrainHeight(point.x, point.z), point.z),
        { width: 32, height: 7, depth: 1 },
        FACTIONS[this.activeFaction].color,
        false,
        this.activeFaction,
      );
      structure.root.rotation.y = this.battleCamera.heading;
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

  private spendDeploymentCost(kind: DeployKind): boolean {
    if (this.modeConfig.unlimitedDeployment) {
      return true;
    }
    const cost = this.modeConfig.deploymentCosts[kind];
    if (cost === undefined) {
      return false;
    }
    const balance = this.resources.get(this.activeFaction) ?? 0;
    if (balance < cost) {
      this.hud.notify(
        '보급 부족',
        `${cost} SUP가 필요합니다. 현재 보급: ${Math.floor(balance)}`,
        '#ff746b',
      );
      return false;
    }
    this.resources.set(this.activeFaction, balance - cost);
    return true;
  }

  private cycleFaction(): void {
    if (!this.modeConfig.enableFactionCycle) {
      return;
    }
    const index = FACTION_ORDER.indexOf(this.activeFaction);
    this.activeFaction = FACTION_ORDER[(index + 1) % FACTION_ORDER.length];
    this.hud.setFaction(this.activeFaction);
    this.updateDiplomacyHud();
  }

  private interveneDiplomacy(target: FactionId): void {
    if (!this.modeConfig.enableDiplomacy) {
      return;
    }
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
    if (event.attackerFaction !== event.victim.faction) {
      this.challengeSession?.recordKill(event.attackerFaction);
    }

    const playerDeath = event.victim === this.possessedUnit;
    const playerKill = event.playerControlled && !playerDeath;
    const victimName = `${FACTIONS[event.victim.faction].name} ${event.victim.displayName}`;

    if (this.modeConfig.enableKillCamera && (playerDeath || playerKill)) {
      if (playerDeath) {
        this.exitPossession();
      }
      this.battleCamera.startKillCamera(
        event.victim.position,
        event.victim.collisionRadius,
      );
    } else if (Math.random() < 0.4 || event.victim.kind === 'tank' || event.victim.isAircraft) {
      this.hud.notify(
        '전장 손실 보고',
        `${FACTIONS[event.attackerFaction].name}이 ${victimName}을 파괴했습니다.`,
        FACTIONS[event.attackerFaction].accent,
      );
    }
  }

  private onWorldExplosion(position: Vector3, radius: number): void {
    this.audio.explosion(radius);
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

  private handleResize(): void {
    const width = this.shell.clientWidth;
    const height = this.shell.clientHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    const maximumPixelRatio = this.softwareRendering
      ? (this.playMode === 'challenge' ? 0.68 : 0.82)
      : (this.playMode === 'challenge' ? 1 : 1.25);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maximumPixelRatio));
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
