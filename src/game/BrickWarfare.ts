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
  getChallengeBattlefield,
} from './battlefield/challengeLayout';
import { getConquestBattlefield } from './battlefield/conquestLayout';
import {
  BASE_LAYOUTS,
  FACTION_ORDER,
  OUTPOST_LAYOUTS,
  STAGING_SPAWN_LAYOUTS,
} from './battlefield/layout';
import {
  initialSpawnPosition,
  reinforcementBaseAnchor,
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
import { ConquestRuntime } from './systems/ConquestRuntime';
import { DiplomacySystem } from './systems/DiplomacySystem';
import { GameLoop } from './systems/GameLoop';
import { PlayerProgression } from './systems/PlayerProgression';
import {
  canProduceUnit,
  chooseProductionExpansion,
  isProductionKind,
  isUnitKind,
  PRODUCTION_CATALOG,
  requiredProductionKind,
} from './systems/ProductionCatalog';
import { ProductionNetwork } from './systems/ProductionNetwork';
import { UnitCollisionSystem } from './systems/UnitCollisionSystem';
import type {
  CommanderAbilityKind,
  DeployKind,
  DiplomacyEvent,
  FactionId,
  FormationType,
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
  private readonly challengeBattlefield = getChallengeBattlefield(
    this.challengeFormat,
    new URLSearchParams(window.location.search).get('map'),
  );
  private readonly conquestBattlefield = getConquestBattlefield();
  private readonly challengeLayout = this.challengeBattlefield.layout;
  private readonly battlefieldTheme = this.playMode === 'challenge'
    ? this.challengeBattlefield.theme
    : this.playMode === 'conquest'
      ? this.conquestBattlefield.theme
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
  private readonly productionNetwork: ProductionNetwork;
  private readonly destroyedHeadquarters = new Set<FactionId>();
  private readonly eliminatedFactions = new Set<FactionId>();
  private readonly progression = new PlayerProgression();
  private readonly resources = new Map<FactionId, number>(
    FACTION_ORDER.map((faction) => [
      faction,
      this.modeConfig.startingResources[faction]
        + (
          this.playMode === 'conquest' && faction === 'azure'
            ? this.progression.startingSupplyBonus
            : 0
        ),
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
  private conquestRuntime: ConquestRuntime | null = null;
  private adaptiveDirector: AdaptiveDirector | null = null;
  private readonly gameLoop = new GameLoop(() => this.frame());
  private mode: GameMode = 'god';
  private activeFaction: FactionId = 'azure';
  private selectedUnit: Unit | null = null;
  private selectedUnits: Unit[] = [];
  private formation: FormationType = 'line';
  private selectionDragStart: Vector2 | null = null;
  private selectionDragCurrent: Vector2 | null = null;
  private possessedUnit: Unit | null = null;
  private deployKind: DeployKind | null = null;
  private simulationRunning = false;
  private elapsed = 0;
  private resourceTimer = WORLD.resourceTick;
  private aiSpawnTimer = 7;
  private aiBuildTimer = 12;
  private hudRefreshTimer = 0;
  private aiAccumulator = 0;
  private outpostAccumulator = 0;
  private diplomacyAccumulator = 0;
  private headquartersAccumulator = 0;
  private conquestSiegeAccumulator = 0;
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
      antialias: this.playMode !== 'challenge',
      powerPreference: 'high-performance',
    });
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.shadowMap.enabled = this.playMode !== 'challenge';
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.softwareRendering = this.detectSoftwareRendering();
    if (this.softwareRendering) {
      this.renderer.shadowMap.enabled = false;
    }
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
          this.conquestRuntime?.start();
          if (this.playMode !== 'sandbox') {
            const commandUnit = this.units.find(
              (unit) => unit.faction === this.activeFaction && unit.kind === 'general',
            ) ?? this.units.find(
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
          } else if (this.playMode === 'conquest') {
            this.hud.notify(
              `정복전 개시 · ${this.battlefieldTheme.label}`,
              '7개 거점을 확보하고 생산망을 확장해 적 본부를 파괴하십시오.',
              '#ffcf5d',
            );
            this.hud.notify(
              `지휘관 프로필 · ${this.progression.summary}`,
              '1~4 지휘 능력 · R 대형 변경 · Tab 전술 커서 · 드래그 다중 선택',
              '#8ed8ff',
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
        onCommanderAbility: (kind) => this.selectCommanderAbility(kind),
      },
    );

    this.combat = new CombatSystem(
      this.scene,
      (event) => this.onUnitDestroyed(event),
      (damage) => this.hud.flashDamage(0.25 + damage * 2.4),
      (position, radius) => this.onWorldExplosion(position, radius),
      this.playMode === 'challenge'
        ? 72
        : this.playMode === 'conquest'
          ? 96
          : WORLD.maxProjectiles,
    );
    if (this.playMode === 'conquest') {
      this.conquestRuntime = new ConquestRuntime(
        {
          duration: this.testMode
            ? 75
            : (this.modeConfig.matchDuration ?? 720),
          dominationDuration: this.testMode ? 8 : 30,
          activeFactions: this.activeFactions,
          outpostTotal: this.conquestBattlefield.layout.outposts.length,
          activeFaction: this.activeFaction,
        },
        {
          units: this.units,
          structures: this.structures,
          outposts: this.outposts,
          resources: this.resources,
          combat: this.combat,
          progression: this.progression,
          getHeading: () => this.battleCamera.heading,
          spawnUnit: (kind, faction, position) => (
            this.spawnUnit(kind, faction, position)
          ),
          selectUnits: (units) => this.selectUnits(units),
          notify: (title, body, color) => (
            this.hud.notify(title, body, color)
          ),
          playCommand: () => this.audio.command(),
          createRepairEffect: (point, colors) => {
            this.brickBursts.burstAt(point, colors, 18, 7);
          },
        },
      );
    }
    this.productionNetwork = new ProductionNetwork({
      scene: this.scene,
      structures: this.structures,
      outposts: this.outposts,
      headquarters: this.headquarters,
      getHeading: () => this.battleCamera.heading,
      notify: (title, body, color) => (
        this.hud.notify(title, body, color)
      ),
      onBuilt: (faction) => {
        this.conquestRuntime?.session.recordBuilding(faction);
      },
    });
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
      onMouseMove: (event) => this.handleMouseMove(event),
      onMouseUp: (event) => this.handleMouseUp(event),
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
    sun.castShadow = this.playMode !== 'challenge';
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
      : this.playMode === 'conquest'
        ? this.conquestBattlefield.layout.outposts
        : OUTPOST_LAYOUTS;
    const baseLayouts = this.playMode === 'challenge'
      ? this.challengeLayout.bases
      : this.playMode === 'conquest'
        ? this.conquestBattlefield.layout.bases
        : BASE_LAYOUTS;
    const stagingLayouts = this.playMode === 'challenge'
      ? this.challengeLayout.staging
      : this.playMode === 'conquest'
        ? this.conquestBattlefield.layout.staging
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
          this.playMode !== 'sandbox',
        ),
      );
      this.structures.push(headquarters);
      this.headquarters.set(faction, headquarters);
      this.scene.add(headquarters.root);

      if (this.playMode === 'conquest') {
        this.productionNetwork.createStartingBase(
          faction,
          position,
          layout.yaw,
        );
      }

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
      ? this.challengeBattlefield.structures
      : this.playMode === 'conquest'
        ? this.conquestBattlefield.structures
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
      this.updateSimulation(simulationDelta, simulationDelta);
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
    if (this.playMode === 'conquest') {
      this.conquestSiegeAccumulator += delta;
      if (this.conquestSiegeAccumulator >= 0.4) {
        this.updateConquestSiege(this.conquestSiegeAccumulator);
        this.conquestSiegeAccumulator = 0;
      }
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
    this.updateConquest(challengeDelta);

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

  private updateConquest(delta: number): void {
    if (!this.conquestRuntime) {
      return;
    }
    const result = this.conquestRuntime.update(
      delta,
      this.getChallengeOutpostCounts(),
    );
    if (!result) {
      return;
    }
    this.simulationRunning = false;
    this.input.unlockPointer();
    this.audio.result(result.snapshot.winner === this.activeFaction);
    this.hud.showConquestResult(result.snapshot, result.reward);
  }

  private selectCommanderAbility(kind: CommanderAbilityKind): void {
    if (
      this.playMode !== 'conquest'
      || this.mode !== 'god'
      || !this.simulationRunning
    ) {
      return;
    }
    this.deployKind = null;
    this.hud.setDeploy(null);
    this.conquestRuntime?.selectAbility(kind);
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
    const sideInput = this.inputAxis(LEFT_KEYS, RIGHT_KEYS);
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
    const side = this.inputAxis(LEFT_KEYS, RIGHT_KEYS);
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
    this.updatePossessedFire();
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
        this.conquestRuntime?.session.recordCapture(capturedBy);
        this.audio.capture(capturedBy);
        this.hud.notify(
          `${outpost.label} 거점 점령`,
          `${FACTIONS[capturedBy].name}이 전선을 확보했습니다. +8점${
            capturedBy === this.activeFaction
              ? ' · B로 생산기지 건설 가능'
              : ''
          }`,
          FACTIONS[capturedBy].accent,
        );
      }
    }
  }

  private updateEconomy(delta: number): void {
    this.resourceTimer -= delta;
    this.aiSpawnTimer -= delta;
    this.aiBuildTimer -= delta;
    if (this.resourceTimer <= 0) {
      this.resourceTimer = WORLD.resourceTick;
      for (const faction of this.activeFactions) {
        if (this.eliminatedFactions.has(faction)) {
          continue;
        }
        const outpostCount = this.outposts.filter(
          (outpost) => outpost.owner === faction,
        ).length;
        const outpostIncome = outpostCount * (
          this.playMode === 'challenge'
            ? 4
            : this.playMode === 'conquest'
              ? 8
              : 14
        );
        const baseIncome = this.playMode === 'challenge'
          ? 5
          : this.playMode === 'conquest'
            ? 8
            : 18;
        const productionIncome = this.playMode === 'conquest'
          ? this.productionNetwork.incomeBonus(faction)
          : 0;
        const doctrineBonus = FACTIONS[faction].doctrine === 'entrenchment' ? 4 : 0;
        this.resources.set(
          faction,
          (this.resources.get(faction) ?? 0)
            + baseIncome
            + outpostIncome
            + productionIncome
            + doctrineBonus,
        );
      }
    }
    if (this.aiSpawnTimer <= 0) {
      this.aiSpawnTimer = 5;
      for (const faction of this.activeFactions) {
        this.spawnAiReinforcement(
          faction,
          this.playMode === 'conquest'
            && faction === this.activeFaction
            ? 10
            : undefined,
        );
      }
    }
    if (this.playMode === 'conquest' && this.aiBuildTimer <= 0) {
      this.aiBuildTimer = 14;
      this.updateConquestAiInfrastructure();
    }
  }

  private spawnAiReinforcement(
    faction: FactionId,
    targetOverride?: number,
  ): void {
    const alive = this.units.filter((unit) => unit.faction === faction && !unit.destroyed).length;
    const operationalProductionBases = this.productionNetwork
      .operationalFor(faction);
    const targetUnitCount = targetOverride
      ?? this.productionNetwork.unitCapacity(
        faction,
        this.modeConfig.targetUnitsPerFaction,
        this.playMode,
      );
    if (
      alive === 0
      || alive >= targetUnitCount
      || this.eliminatedFactions.has(faction)
    ) {
      return;
    }
    const sequence = this.reinforcementSequence.get(faction) ?? 0;
    const ownedOutposts = this.outposts.filter((outpost) => outpost.owner === faction);
    const headquarters = this.headquarters.get(faction);
    const baseLayouts = this.playMode === 'challenge'
      ? this.challengeLayout.bases
      : this.playMode === 'conquest'
        ? this.conquestBattlefield.layout.bases
        : BASE_LAYOUTS;
    const spawnAnchors = this.playMode === 'conquest'
      ? operationalProductionBases.map(
          (productionBase) => productionBase.spawnAnchor,
        )
      : [
          ...(
            headquarters && !headquarters.destroyed
              ? [reinforcementBaseAnchor(baseLayouts[faction])]
              : []
          ),
          ...ownedOutposts.map((outpost) => outpost.root.position),
          ...operationalProductionBases.map(
            (productionBase) => productionBase.spawnAnchor,
          ),
        ];
    if (spawnAnchors.length === 0) {
      return;
    }
    const strategy = this.ai.getStrategy(faction);
    const missing = targetUnitCount - alive;
    const spawnCount = Math.min(missing, spawnAnchors.length, 2);
    let spawnedCount = 0;
    const producibleKinds = new Set<UnitKind>(
      operationalProductionBases.flatMap(
        (productionBase) => PRODUCTION_CATALOG[productionBase.kind].unitKinds,
      ),
    );
    for (let index = 0; index < spawnCount; index += 1) {
      const preferredKind = chooseReinforcementKind(strategy);
      const kind = this.playMode !== 'conquest' || producibleKinds.has(preferredKind)
        ? preferredKind
        : [...producibleKinds][(sequence + index) % Math.max(1, producibleKinds.size)]
          ?? 'infantry';
      const reinforcementCost = this.modeConfig.deploymentCosts[kind] ?? 0;
      const balance = this.resources.get(faction) ?? 0;
      if (!this.modeConfig.unlimitedDeployment && balance < reinforcementCost) {
        break;
      }
      const nextSequence = sequence + index;
      const spawnAnchor = spawnAnchors[nextSequence % spawnAnchors.length];
      const spawn = reinforcementSpawnPosition(spawnAnchor, nextSequence);
      this.spawnUnit(kind, faction, spawn);
      spawnedCount += 1;
      if (!this.modeConfig.unlimitedDeployment) {
        this.resources.set(faction, balance - reinforcementCost);
      }
    }
    this.reinforcementSequence.set(faction, sequence + spawnedCount);
  }

  private updateConquestAiInfrastructure(): void {
    for (const faction of this.activeFactions) {
      if (
        faction === this.activeFaction
        || this.eliminatedFactions.has(faction)
      ) {
        continue;
      }
      const existingKinds = this.productionNetwork
        .operationalFor(faction)
        .map((productionBase) => productionBase.kind);
      const kind = chooseProductionExpansion(existingKinds);
      const cost = this.modeConfig.deploymentCosts[kind] ?? 0;
      const balance = this.resources.get(faction) ?? 0;
      const ownedOutposts = this.outposts.filter(
        (outpost) => outpost.owner === faction,
      );
      if (
        ownedOutposts.length > 0
        && balance >= cost
        && existingKinds.length < 7
      ) {
        const outpost = ownedOutposts
          .filter(
            (candidate) => !this.productionNetwork.bases.some(
              (productionBase) => (
                productionBase.outpost === candidate
                && productionBase.faction === faction
                && !productionBase.structure.destroyed
              ),
            ),
          )[0] ?? ownedOutposts[0];
        const placement = this.productionNetwork.findAiPlacement(
          faction,
          outpost,
          existingKinds.length,
        );
        if (placement) {
          this.resources.set(faction, balance - cost);
          this.productionNetwork.create(
            faction,
            kind,
            placement,
            false,
          );
        }
      }
      const objective = this.outposts
        .filter((outpost) => outpost.owner !== faction)
        .sort((left, right) => {
          const leftPriority = left.owner === this.activeFaction ? 0 : 1;
          const rightPriority = right.owner === this.activeFaction ? 0 : 1;
          return leftPriority - rightPriority;
        })[0];
      if (objective) {
        this.ai.setPriorityObjective(faction, objective.id, 12);
      }
    }
  }

  private updateConquestSiege(delta: number): void {
    for (const faction of this.activeFactions) {
      const controlled = this.outposts.filter(
        (outpost) => outpost.owner === faction,
      ).length;
      if (controlled < 3 || this.eliminatedFactions.has(faction)) {
        continue;
      }
      const opponents = this.activeFactions.filter(
        (candidate) => (
          candidate !== faction
          && !this.eliminatedFactions.has(candidate)
        ),
      );
      const opponent = opponents[0];
      if (!opponent) {
        continue;
      }
      const enemyHeadquarters = this.headquarters.get(opponent);
      const enemyProduction = this.productionNetwork
        .operationalFor(opponent)
        .map((productionBase) => productionBase.structure);
      const strategicTargets = controlled >= 5
        && enemyHeadquarters
        && !enemyHeadquarters.destroyed
        ? [enemyHeadquarters, ...enemyProduction]
        : enemyProduction;
      const target = strategicTargets[0];
      if (!target) {
        continue;
      }
      const attackers = this.units
        .filter(
          (unit) => (
            unit.faction === faction
            && !unit.destroyed
            && !unit.possessed
            && (
              unit.kind === 'tank'
              || unit.kind === 'fighter'
              || unit.kind === 'helicopter'
              || unit.kind === 'general'
            )
          ),
        )
        .sort(
          (left, right) => (
            left.position.distanceToSquared(target.root.position)
            - right.position.distanceToSquared(target.root.position)
          ),
        )
        .slice(0, 3);
      for (const unit of attackers) {
        const distance = unit.position.distanceTo(target.root.position);
        const aimPoint = target.root.position.clone().add(
          new Vector3(0, Math.min(10, target.collisionRadius * 0.5), 0),
        );
        if (
          distance <= unit.stats.range * 0.92
          && unit.canFire('special')
        ) {
          if (this.combat.fire(unit, aimPoint, 'special')) {
            this.audio.fire(unit.kind, 'special');
          }
          continue;
        }
        if (
          faction !== this.activeFaction
          && (!unit.order || unit.order.type === 'hold')
        ) {
          const approach = unit.position.clone()
            .sub(target.root.position)
            .setY(0);
          if (approach.lengthSq() < 0.1) {
            approach.set(faction === 'azure' ? -1 : 1, 0, 0);
          }
          approach.normalize();
          const destination = target.root.position.clone()
            .addScaledVector(
              approach,
              Math.max(20, unit.stats.range * 0.55),
            );
          destination.y = unit.isAircraft
            ? terrainHeight(destination.x, destination.z)
              + (unit.kind === 'fighter' ? 34 : 18)
            : terrainHeight(destination.x, destination.z);
          unit.order = {
            type: 'move',
            destination,
          };
          unit.faceTarget(aimPoint, delta);
        }
      }
    }
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
      if (this.conquestRuntime && faction === this.activeFaction) {
        const opponents = this.activeFactions.filter(
          (candidate) => candidate !== this.activeFaction
            && !this.eliminatedFactions.has(candidate),
        );
        this.conquestRuntime.session.finish(
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
      this.conquestRuntime?.session.finish(
        this.victoryFaction,
        'elimination',
      );
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
      if (this.selectedUnits.includes(unit)) {
        unit.setSelected(false);
        this.selectedUnits = this.selectedUnits.filter(
          (selected) => selected !== unit,
        );
        this.selectedUnit = this.selectedUnits[0] ?? null;
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
      if (this.conquestRuntime) {
        const opponents = this.activeFactions.filter(
          (candidate) => candidate !== this.activeFaction,
        );
        if (faction === this.activeFaction) {
          this.conquestRuntime.session.finish(
            this.findLeadingFaction(opponents),
            'headquarters',
          );
        } else if (
          opponents.every(
            (opponent) => this.destroyedHeadquarters.has(opponent)
              || this.eliminatedFactions.has(opponent),
          )
        ) {
          this.conquestRuntime.session.finish(
            this.activeFaction,
            'headquarters',
          );
        }
      }
    }
  }

  private findLeadingFaction(candidates: readonly FactionId[]): FactionId | null {
    const scores = this.challengeSession?.snapshot().scores
      ?? this.conquestRuntime?.session.snapshot().commandPoints;
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
    if (this.playMode === 'conquest') {
      const operational = this.productionNetwork.operationalFor(
        this.activeFaction,
      );
      const buildingCounts = {
        barracks: operational.filter(
          (productionBase) => productionBase.kind === 'barracks',
        ).length,
        armor: operational.filter(
          (productionBase) => productionBase.kind === 'armorFactory',
        ).length,
        air: operational.filter(
          (productionBase) => productionBase.kind === 'airfield',
        ).length,
      };
      const income = 8
        + outpostCounts[this.activeFaction] * 8
        + operational.reduce(
          (total, productionBase) => (
            total + PRODUCTION_CATALOG[productionBase.kind].incomeBonus
          ),
          0,
        );
      this.hud.setEconomySummary(
        `병력 ${unitCounts[this.activeFaction]} / ${this.productionNetwork.unitCapacity(
          this.activeFaction,
          this.modeConfig.targetUnitsPerFaction,
          this.playMode,
        )} · +${income} SUP / ${WORLD.resourceTick}초\n`
        + `막사 ${buildingCounts.barracks} · 기갑 ${buildingCounts.armor} · 비행장 ${buildingCounts.air}`,
      );
    } else {
      this.hud.setEconomySummary(null);
    }
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
    if (this.conquestRuntime) {
      const snapshot = this.conquestRuntime.session.snapshot();
      const controlled = outpostCounts[this.activeFaction];
      const enemyControlled = outpostCounts.crimson;
      const phase = controlled <= 1
        ? '초기 거점 확보 · 정찰 분산'
        : controlled < enemyControlled
          ? '방어선 재편 · 적 생산망 차단'
          : controlled >= Math.ceil(this.outposts.length * 0.65)
            ? '최종 공세 · 적 본부 압박'
            : '생산망 확장 · 중앙 전선 돌파';
      this.hud.setConquestState({
        session: snapshot,
        phase,
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
      this.hud.setCommanderState(
        this.conquestRuntime.abilityState(),
        this.conquestRuntime.pending,
        this.conquestRuntime.progressionSummary,
      );
    }
    this.hud.setSelection(
      this.possessedUnit ?? this.selectedUnit,
      this.possessedUnit ? 1 : this.selectedUnits.length,
      this.formation,
    );
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (
      event.code === 'Escape'
      && this.mode === 'god'
      && (this.deployKind || this.conquestRuntime?.pending)
    ) {
      this.deployKind = null;
      this.conquestRuntime?.cancelTargeting();
      this.hud.setDeploy(null);
      this.hud.notify(
        '전술 도구 취소',
        '부대 선택과 지휘 상태로 복귀했습니다.',
        '#8ed8ff',
      );
      event.preventDefault();
    } else if (
      event.code === 'Tab'
      && this.mode === 'god'
      && this.playMode === 'conquest'
      && !event.repeat
    ) {
      if (this.input.pointerLocked) {
        this.input.unlockPointer();
        this.hud.notify(
          '전술 커서 활성화',
          '드래그로 여러 부대를 선택하고 우클릭으로 대형 명령을 내리십시오.',
          '#8ed8ff',
        );
      } else {
        this.input.lockPointer();
      }
      event.preventDefault();
    } else if (
      event.code === 'KeyR'
      && this.mode === 'god'
      && this.playMode === 'conquest'
      && !event.repeat
    ) {
      const formations: FormationType[] = ['line', 'wedge', 'column'];
      const index = formations.indexOf(this.formation);
      this.formation = formations[(index + 1) % formations.length];
      this.hud.notify(
        '부대 대형 변경',
        this.formation === 'line'
          ? '횡대: 넓은 화력선'
          : this.formation === 'wedge'
            ? '쐐기: 돌파 전개'
            : '종대: 좁은 길과 시가지 이동',
        '#8ed8ff',
      );
      event.preventDefault();
    } else if (
      this.playMode === 'conquest'
      && this.mode === 'god'
      && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)
    ) {
      const abilities: CommanderAbilityKind[] = [
        'artillery',
        'airstrike',
        'reinforce',
        'repair',
      ];
      const index = Number.parseInt(event.code.slice(-1), 10) - 1;
      this.selectCommanderAbility(abilities[index]);
      event.preventDefault();
    } else if (event.code === 'KeyF' && this.mode === 'god') {
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
      event.code === 'KeyB'
      && this.mode === 'god'
      && !event.repeat
      && this.modeConfig.allowedDeployments.includes('factory')
    ) {
      this.toggleDeploy('factory');
      event.preventDefault();
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
    if (locked) {
      this.selectionDragStart = null;
      this.selectionDragCurrent = null;
      this.hud.setSelectionBox(null);
    }
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
    if (this.mode === 'possession') {
      if (!this.input.pointerLocked) {
        this.input.lockPointer();
      }
      if (event.button === 0 || event.button === 2) {
        this.firePossessedWeapon(event.button);
      }
      return;
    }

    if (
      !this.input.pointerLocked
      && this.playMode !== 'conquest'
    ) {
      this.input.lockPointer();
    }

    if (event.button === 2) {
      this.issueGodCommand(event);
      event.preventDefault();
      return;
    }

    if (event.button === 0) {
      if (this.conquestRuntime?.pending) {
        const point = this.pickGround(event);
        if (point) {
          this.conquestRuntime.activateAbility(
            this.conquestRuntime.pending,
            point,
          );
        }
        return;
      }
      if (this.deployKind) {
        const point = this.pickGround(event);
        if (point) {
          this.deployAt(point);
        }
        return;
      }
      if (
        this.playMode === 'conquest'
        && !this.input.pointerLocked
      ) {
        this.selectionDragStart = new Vector2(event.clientX, event.clientY);
        this.selectionDragCurrent = this.selectionDragStart.clone();
        this.updateSelectionBox();
        return;
      }
      this.selectUnit(this.pickUnit(event));
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.selectionDragStart || this.input.pointerLocked) {
      return;
    }
    this.selectionDragCurrent = new Vector2(event.clientX, event.clientY);
    this.updateSelectionBox();
  }

  private handleMouseUp(event: MouseEvent): void {
    if (
      event.button !== 0
      || !this.selectionDragStart
      || !this.selectionDragCurrent
    ) {
      return;
    }
    const start = this.selectionDragStart;
    const end = this.selectionDragCurrent;
    const dragDistance = start.distanceTo(end);
    this.selectionDragStart = null;
    this.selectionDragCurrent = null;
    this.hud.setSelectionBox(null);
    if (dragDistance < 7) {
      const unit = this.pickUnit(event);
      this.selectUnits(
        unit ? [unit] : [],
        event.shiftKey,
      );
      return;
    }
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const selected = this.units.filter((unit) => {
      if (
        unit.destroyed
        || unit.faction !== this.activeFaction
      ) {
        return false;
      }
      const projected = unit.position.clone()
        .add(new Vector3(0, unit.collisionRadius, 0))
        .project(this.camera);
      if (projected.z < -1 || projected.z > 1) {
        return false;
      }
      const screenX = canvasRect.left
        + (projected.x + 1) * 0.5 * canvasRect.width;
      const screenY = canvasRect.top
        + (1 - projected.y) * 0.5 * canvasRect.height;
      return screenX >= left
        && screenX <= right
        && screenY >= top
        && screenY <= bottom;
    });
    this.selectUnits(selected, event.shiftKey);
  }

  private updateSelectionBox(): void {
    if (!this.selectionDragStart || !this.selectionDragCurrent) {
      this.hud.setSelectionBox(null);
      return;
    }
    const shellRect = this.shell.getBoundingClientRect();
    const left = Math.min(
      this.selectionDragStart.x,
      this.selectionDragCurrent.x,
    ) - shellRect.left;
    const top = Math.min(
      this.selectionDragStart.y,
      this.selectionDragCurrent.y,
    ) - shellRect.top;
    this.hud.setSelectionBox({
      left,
      top,
      width: Math.abs(
        this.selectionDragCurrent.x - this.selectionDragStart.x,
      ),
      height: Math.abs(
        this.selectionDragCurrent.y - this.selectionDragStart.y,
      ),
    });
  }

  private updatePossessedFire(): void {
    if (this.input.isMouseDown(0)) {
      this.firePossessedWeapon(0);
    }
    if (this.input.isMouseDown(2)) {
      this.firePossessedWeapon(2);
    }
  }

  private firePossessedWeapon(button: 0 | 2): void {
    const unit = this.possessedUnit;
    if (!unit || unit.destroyed) {
      return;
    }
    if (button === 2 && unit.kind === 'drone') {
      this.combat.detonateDrone(
        unit,
        this.units,
        this.structures,
      );
      return;
    }
    if (button === 2 && unit.kind === 'infantry') {
      return;
    }
    const attackMode = button === 2 ? 'special' : 'normal';
    if (!unit.canFire(attackMode)) {
      return;
    }
    const target = this.getCrosshairAimPoint();
    if (this.combat.fire(unit, target, attackMode)) {
      this.audio.fire(unit.kind, attackMode);
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
    const commandableUnits = this.selectedUnits.filter(
      (unit) => (
        !unit.destroyed
        && (
          this.playMode === 'sandbox'
          || unit.faction === this.activeFaction
        )
      ),
    );
    if (commandableUnits.length === 0) {
      return;
    }
    if (
      this.playMode !== 'sandbox'
      && commandableUnits.length !== this.selectedUnits.length
    ) {
      this.hud.notify(
        '명령 권한 없음',
        '정규 작전에서는 아군 유닛만 지휘할 수 있습니다.',
        '#ff746b',
      );
    }
    const targetUnit = this.pickUnit(event);
    const point = targetUnit?.position.clone() ?? this.pickGround(event);
    if (!point) {
      return;
    }
    this.commandUnitsInFormation(commandableUnits, point, targetUnit);
    const commandedOutpost = this.findClosestOutpost(point, 42);
    if (this.adaptiveDirector) {
      const observation = this.adaptiveDirector.observeCommand(
        commandableUnits[0].kind,
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
      `${commandableUnits.length}개 부대: ${
        targetUnit ? '표적 집중 교전' : `${this.formation} 대형으로 이동`
      }`,
      FACTIONS[commandableUnits[0].faction].accent,
    );
    this.audio.command();
  }

  private commandUnitsInFormation(
    units: Unit[],
    point: Vector3,
    targetUnit: Unit | null,
  ): void {
    const center = units.reduce(
      (total, unit) => total.add(unit.position),
      new Vector3(),
    ).multiplyScalar(1 / Math.max(1, units.length));
    const forward = point.clone().sub(center).setY(0);
    if (forward.lengthSq() < 0.1) {
      forward.set(
        Math.sin(this.battleCamera.heading),
        0,
        Math.cos(this.battleCamera.heading),
      );
    } else {
      forward.normalize();
    }
    const lateral = new Vector3(forward.z, 0, -forward.x);
    for (const [index, unit] of units.entries()) {
      const destination = point.clone();
      if (!targetUnit) {
        destination.add(
          this.getFormationOffset(
            index,
            units.length,
            forward,
            lateral,
          ),
        );
      }
      const ground = terrainHeight(destination.x, destination.z);
      destination.y = unit.kind === 'fighter'
        ? ground + 34
        : unit.kind === 'helicopter'
          ? ground + 18
          : unit.kind === 'drone'
            ? ground + 12
            : ground;
      unit.order = {
        type: targetUnit ? 'attack' : 'move',
        destination,
        targetId: targetUnit?.id,
      };
    }
  }

  private getFormationOffset(
    index: number,
    count: number,
    forward: Vector3,
    lateral: Vector3,
  ): Vector3 {
    const spacing = 6.5;
    if (this.formation === 'line') {
      return lateral.clone().multiplyScalar(
        (index - (count - 1) / 2) * spacing,
      );
    }
    if (this.formation === 'column') {
      return forward.clone().multiplyScalar(-index * spacing);
    }
    if (index === 0) {
      return new Vector3();
    }
    const row = Math.ceil(index / 2);
    const side = index % 2 === 0 ? 1 : -1;
    return lateral.clone().multiplyScalar(side * row * spacing)
      .addScaledVector(forward, -row * spacing * 0.7);
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
    const units = this.selectedUnits.filter(
      (candidate) => (
        !candidate.destroyed
        && candidate.faction === this.activeFaction
      ),
    );
    this.commandUnitsInFormation(
      units.length > 0 ? units : [unit],
      outpost.root.position.clone(),
      null,
    );
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
      `${Math.max(1, units.length)}개 부대에 점령 명령을 전송했습니다. Enter로 선두 유닛을 직접 조종할 수 있습니다.`,
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
    this.selectUnits(unit ? [unit] : []);
  }

  private selectUnits(units: Unit[], additive = false): void {
    const selectable = units.filter(
      (unit, index, candidates) => (
        !unit.destroyed
        && candidates.indexOf(unit) === index
        && (
          this.playMode === 'sandbox'
          || unit.faction === this.activeFaction
        )
      ),
    );
    const next = additive
      ? [
          ...this.selectedUnits.filter((unit) => !unit.destroyed),
          ...selectable.filter((unit) => !this.selectedUnits.includes(unit)),
        ]
      : selectable;
    for (const unit of this.selectedUnits) {
      if (!next.includes(unit)) {
        unit.setSelected(false);
      }
    }
    for (const unit of next) {
      unit.setSelected(true);
    }
    this.selectedUnits = next;
    this.selectedUnit = next[0] ?? null;
  }

  private enterPossession(unit: Unit): void {
    if (this.playMode !== 'sandbox' && unit.faction !== this.activeFaction) {
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
      unit.kind === 'fighter'
        ? 'Space/Shift 기수 조작 · 3인칭 지평선 추적 · V 기수 시점'
        : `${FACTIONS[unit.faction].name} ${unit.displayName} 직접 조종 권한 획득`,
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
        '모드 제한',
        '현재 모드에서 사용할 수 없는 배치 도구입니다.',
        '#ffcf5d',
      );
      return;
    }
    this.conquestRuntime?.cancelTargeting();
    this.deployKind = this.deployKind === kind ? null : kind;
    this.hud.setDeploy(this.deployKind);
    if (this.playMode === 'conquest' && this.deployKind) {
      if (isUnitKind(kind)) {
        const required = requiredProductionKind(kind);
        const logisticsAlternative = canProduceUnit('factory', kind)
          ? ' 또는 전방 군수기지'
          : '';
        this.hud.notify(
          `${kind === 'general' ? '지휘관' : '유닛'} 생산 대기`,
          `${PRODUCTION_CATALOG[required].label}${logisticsAlternative} 근처를 클릭해 출격시키십시오.`,
          '#8ed8ff',
        );
      } else if (isProductionKind(kind)) {
        this.hud.notify(
          `${PRODUCTION_CATALOG[kind].label} 건설 대기`,
          '아군이 점령한 거점 가장자리를 클릭하십시오.',
          '#8ed8ff',
        );
      }
    }
  }

  private deployAt(point: Vector3): void {
    const kind = this.deployKind;
    if (!kind) {
      return;
    }
    if (
      this.playMode !== 'sandbox'
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
      && isUnitKind(kind)
      && this.units.filter(
        (unit) => unit.faction === this.activeFaction && !unit.destroyed,
      ).length >= (
        this.playMode === 'conquest'
          ? this.productionNetwork.unitCapacity(
              this.activeFaction,
              this.modeConfig.targetUnitsPerFaction,
              this.playMode,
            )
          : this.modeConfig.targetUnitsPerFaction + 4
      )
    ) {
      this.hud.notify(
        '지휘 한도 도달',
        '생산시설을 확장하거나 기존 병력을 운용해 지휘 한도를 확보하십시오.',
        '#ffcf5d',
      );
      return;
    }
    const productionKind = isProductionKind(kind) ? kind : null;
    const productionBasePlacement = productionKind
      ? this.productionNetwork.findPlayerPlacement(
          point,
          productionKind,
          this.activeFaction,
          this.playMode,
        )
      : null;
    if (productionKind && !productionBasePlacement) {
      return;
    }
    const productionSource = (
      this.playMode === 'conquest'
      && isUnitKind(kind)
    )
      ? this.productionNetwork.findPlayerSource(
          kind,
          point,
          this.activeFaction,
        )
      : null;
    if (
      this.playMode === 'conquest'
      && isUnitKind(kind)
      && !productionSource
    ) {
      return;
    }
    if (!this.spendDeploymentCost(kind)) {
      return;
    }
    if (productionKind) {
      if (!productionBasePlacement) {
        return;
      }
      this.productionNetwork.create(
        this.activeFaction,
        productionKind,
        productionBasePlacement,
        true,
      );
      if (this.playMode === 'challenge') {
        this.deployKind = null;
        this.hud.setDeploy(null);
      }
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
    } else if (isUnitKind(kind)) {
      if (this.eliminatedFactions.has(this.activeFaction)) {
        this.eliminatedFactions.delete(this.activeFaction);
        this.victoryFaction = null;
        this.hud.notify(
          '신 모드 국가 재건',
          `${FACTIONS[this.activeFaction].name}에 새 병력을 배치해 전장에 복귀시켰습니다.`,
          FACTIONS[this.activeFaction].accent,
        );
      }
      const spawnPoint = productionSource?.spawnAnchor ?? point;
      const unit = this.spawnUnit(kind, this.activeFaction, spawnPoint);
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
      this.challengeSession?.recordKill(
        event.attackerFaction,
        event.victim.kind === 'general' ? 12 : 2,
      );
      this.conquestRuntime?.session.recordKill(
        event.attackerFaction,
        event.victim.kind === 'general'
          ? 18
          : event.victim.kind === 'tank' || event.victim.isAircraft
            ? 5
            : 2,
      );
    }

    const playerDeath = event.victim === this.possessedUnit;
    const playerKill = event.playerControlled && !playerDeath;
    const victimName = `${FACTIONS[event.victim.faction].name} ${event.victim.displayName}`;

    if (
      event.victim.kind === 'general'
      && event.attackerFaction !== event.victim.faction
    ) {
      this.hud.notify(
        '적 지휘관 제거 · +12점',
        `${FACTIONS[event.attackerFaction].name}이 ${victimName}을 제거했습니다.`,
        FACTIONS[event.attackerFaction].accent,
      );
    } else if (this.modeConfig.enableKillCamera && (playerDeath || playerKill)) {
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
      : this.playMode === 'challenge'
        ? 1
        : this.playMode === 'conquest'
          ? 1.1
          : 1.25;
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
