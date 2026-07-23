import { FACTIONS } from '../config';
import type {
  BattlefieldStats,
  DeployKind,
  FactionId,
  GameMode,
  Relation,
} from '../types';
import type { Unit } from '../entities/Unit';

interface HudCallbacks {
  onStart: () => void;
  onDeploy: (kind: DeployKind) => void;
  onCycleFaction: () => void;
  onDiplomacy: (target: FactionId) => void;
  onPossess: () => void;
}

export class Hud {
  readonly root: HTMLDivElement;
  private readonly modeBadge: HTMLDivElement;
  private readonly resourcesLabel: HTMLElement;
  private readonly statsLabel: HTMLElement;
  private readonly windLabel: HTMLElement;
  private readonly factionPanel: HTMLDivElement;
  private readonly relationList: HTMLDivElement;
  private readonly factionName: HTMLElement;
  private readonly selectionPanel: HTMLDivElement;
  private readonly selectionName: HTMLElement;
  private readonly selectionFaction: HTMLElement;
  private readonly selectionType: HTMLElement;
  private readonly selectionHealth: HTMLElement;
  private readonly healthBar: HTMLElement;
  private readonly messageLog: HTMLDivElement;
  private readonly killLog: HTMLDivElement;
  private readonly killKicker: HTMLElement;
  private readonly killTitle: HTMLElement;
  private readonly killDetail: HTMLElement;
  private readonly crosshair: HTMLDivElement;
  private readonly godControls: HTMLDivElement;
  private readonly possessionControls: HTMLDivElement;
  private readonly deployDock: HTMLDivElement;
  private readonly factionButton: HTMLButtonElement;
  private readonly damageVignette: HTMLDivElement;
  private readonly deployButtons = new Map<DeployKind, HTMLButtonElement>();
  private readonly callbacks: HudCallbacks;
  private activeDeploy: DeployKind | null = null;
  private currentFaction: FactionId = 'azure';
  private currentMode: GameMode = 'god';
  private pointerLocked = false;
  private killLogTimer = 0;

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="top-bar">
        <div class="brand">PROJECT BRICK WARFARE</div>
        <div class="mode-badge">GOD EYE</div>
        <div class="status-strip">
          <span>자원 <b data-ui="resources">0</b></span>
          <span>풍향 <b data-ui="wind">--</b></span>
          <span><b data-ui="stats">0 UNIT · 0 FPS</b></span>
        </div>
      </div>
      <section class="faction-panel">
        <h2 data-ui="faction-name">청람 연방</h2>
        <div data-ui="relation-list"></div>
      </section>
      <section class="selection-panel hidden">
        <h2 data-ui="selection-name">선택 없음</h2>
        <div class="selection-grid">
          <span>진영</span><strong data-ui="selection-faction">-</strong>
          <span>병과</span><strong data-ui="selection-type">-</strong>
          <span>상태</span><strong data-ui="selection-health">-</strong>
        </div>
        <div class="health-bar"><span data-ui="health-bar"></span></div>
        <button class="possess-button" type="button">선택 유닛 직접 조종 <span>[ENTER]</span></button>
      </section>
      <div class="deploy-dock"></div>
      <div class="message-log"></div>
      <div class="kill-log hidden" data-ui="kill-log">
        <div class="kill-log-kicker" data-ui="kill-kicker">KILL CONFIRMED</div>
        <div class="kill-log-title" data-ui="kill-title">TARGET DESTROYED</div>
        <div class="kill-log-detail" data-ui="kill-detail"></div>
        <div class="kill-log-progress"></div>
      </div>
      <div class="crosshair hidden"></div>
      <div class="controls controls-god">
        <b>화면 클릭</b> 마우스 고정 · <b>마우스 이동</b> 자유 회전 · <b>Esc</b> 해제<br />
        <b>WASD</b> 화면 이동 · <b>휠</b> 줌 · <b>우클릭</b> 명령<br />
        <b>좌클릭</b> 선택/무한 배치 · <b>F</b> 진영 변경<br />
        <b>더블클릭/Enter</b> 선택 유닛 빙의
      </div>
      <div class="controls controls-possession hidden">
        <b>W/S</b> 전후 · <b>A</b> 오른쪽 · <b>D</b> 왼쪽 · <b>마우스</b> 방향 전환<br />
        <b>좌클릭</b> 사격 · <b>Space/Ctrl</b> 상승/하강<br />
        <b>V</b> 1·3인칭 · <b>G 또는 Esc</b> 신 모드 복귀
      </div>
      <div class="damage-vignette"></div>
      <section class="splash">
        <div class="splash-card">
          <div class="eyebrow">BLOCKS · BALLISTICS · BATTLEFIELD</div>
          <h1>PROJECT<br /><span>BRICK WARFARE</span></h1>
          <p>
            끝없이 생성되는 블록 전장을 지휘하고, 어느 진영의 어떤 유닛이든 직접 조종하십시오.
            탄도, 장갑 도탄, 항공 역학, 구조물 붕괴와 자율 외교가 하나의 전장에서 작동합니다.
          </p>
          <div class="feature-row">
            <span>GOD ↔ POSSESSION</span>
            <span>3 FACTION DIPLOMACY</span>
            <span>BRICK DESTRUCTION</span>
            <span>PROCEDURAL WORLD</span>
          </div>
          <button class="start-button" type="button">전장 시뮬레이션 시작</button>
        </div>
      </section>
    `;
    container.append(this.root);

    this.modeBadge = this.require('[class="mode-badge"]');
    this.resourcesLabel = this.require('[data-ui="resources"]');
    this.statsLabel = this.require('[data-ui="stats"]');
    this.windLabel = this.require('[data-ui="wind"]');
    this.factionPanel = this.require('[class="faction-panel"]');
    this.relationList = this.require('[data-ui="relation-list"]');
    this.factionName = this.require('[data-ui="faction-name"]');
    this.selectionPanel = this.require('[class~="selection-panel"]');
    this.selectionName = this.require('[data-ui="selection-name"]');
    this.selectionFaction = this.require('[data-ui="selection-faction"]');
    this.selectionType = this.require('[data-ui="selection-type"]');
    this.selectionHealth = this.require('[data-ui="selection-health"]');
    this.healthBar = this.require('[data-ui="health-bar"]');
    this.messageLog = this.require('[class="message-log"]');
    this.killLog = this.require('[data-ui="kill-log"]');
    this.killKicker = this.require('[data-ui="kill-kicker"]');
    this.killTitle = this.require('[data-ui="kill-title"]');
    this.killDetail = this.require('[data-ui="kill-detail"]');
    this.crosshair = this.require('[class~="crosshair"]');
    this.godControls = this.require('[class~="controls-god"]');
    this.possessionControls = this.require('[class~="controls-possession"]');
    this.deployDock = this.require('[class="deploy-dock"]');
    this.damageVignette = this.require('[class="damage-vignette"]');

    const splash = this.require<HTMLDivElement>('[class="splash"]');
    const startButton = this.require<HTMLButtonElement>('[class="start-button"]');
    const possessButton = this.require<HTMLButtonElement>('[class="possess-button"]');
    possessButton.addEventListener('click', callbacks.onPossess);
    startButton.addEventListener('click', () => {
      splash.classList.add('hidden');
      callbacks.onStart();
    });

    this.factionButton = document.createElement('button');
    this.factionButton.className = 'deploy-button';
    this.factionButton.type = 'button';
    this.factionButton.addEventListener('click', callbacks.onCycleFaction);
    this.deployDock.append(this.factionButton);

    const buttons: Array<{ kind: DeployKind; label: string }> = [
      { kind: 'infantry', label: '보병' },
      { kind: 'tank', label: '전차' },
      { kind: 'fighter', label: '전투기' },
      { kind: 'helicopter', label: '헬기' },
      { kind: 'drone', label: '드론' },
      { kind: 'wall', label: '장벽' },
      { kind: 'mountain', label: '산 생성' },
      { kind: 'trench', label: '참호 굴착' },
      { kind: 'building', label: '건물' },
      { kind: 'tree', label: '나무' },
    ];
    for (const descriptor of buttons) {
      const button = document.createElement('button');
      button.className = 'deploy-button';
      button.type = 'button';
      button.innerHTML = `${descriptor.label}<small>∞ GOD DEPLOY</small>`;
      button.addEventListener('click', () => {
        this.setDeploy(this.activeDeploy === descriptor.kind ? null : descriptor.kind);
        callbacks.onDeploy(descriptor.kind);
      });
      this.deployButtons.set(descriptor.kind, button);
      this.deployDock.append(button);
    }
    this.setFaction('azure');
  }

  setMode(mode: GameMode): void {
    this.currentMode = mode;
    const possessed = mode === 'possession';
    this.modeBadge.textContent = possessed ? 'POSSESSION' : 'GOD EYE';
    this.modeBadge.style.borderColor = possessed ? '#ffcf5d' : '#56b8ff';
    this.modeBadge.style.color = possessed ? '#ffe39c' : '#8bd1ff';
    this.updateCrosshair();
    this.godControls.classList.toggle('hidden', possessed);
    this.possessionControls.classList.toggle('hidden', !possessed);
    this.deployDock.classList.toggle('hidden', possessed);
  }

  setPointerLocked(locked: boolean): void {
    this.pointerLocked = locked;
    this.updateCrosshair();
  }

  setFaction(faction: FactionId): void {
    this.currentFaction = faction;
    const definition = FACTIONS[faction];
    this.factionName.textContent = `${definition.name} · ${this.doctrineLabel(definition.doctrine)}`;
    this.factionPanel.style.setProperty('--faction-color', definition.accent);
    this.factionButton.innerHTML = `진영 변경<small>${definition.name} [F]</small>`;
  }

  setResources(amount: number): void {
    this.resourcesLabel.textContent = Math.floor(amount).toString();
  }

  setWind(x: number, z: number): void {
    const direction = Math.atan2(x, z) * (180 / Math.PI);
    const normalized = (direction + 360) % 360;
    this.windLabel.textContent = `${normalized.toFixed(0)}° ${Math.hypot(x, z).toFixed(1)}m/s`;
  }

  setStats(stats: BattlefieldStats): void {
    this.statsLabel.textContent = `${stats.unitCount} UNIT · ${stats.projectileCount} SHOT · ${stats.fps} FPS`;
  }

  setSelection(unit: Unit | null): void {
    this.selectionPanel.classList.toggle('hidden', !unit);
    if (!unit) {
      return;
    }
    this.selectionName.textContent = unit.displayName;
    this.selectionFaction.textContent = FACTIONS[unit.faction].name;
    this.selectionFaction.style.color = FACTIONS[unit.faction].accent;
    this.selectionType.textContent = unit.possessed ? '직접 조종 중' : unit.order ? this.orderLabel(unit.order.type) : '대기';
    this.selectionHealth.textContent = unit.destroyed
      ? '파괴됨'
      : `${Math.ceil(unit.health)} / ${unit.stats.maxHealth}${unit.immobilizedTimer > 0 ? ' · 궤도 위험' : ''}`;
    this.healthBar.style.setProperty('--health', `${Math.max(0, (unit.health / unit.stats.maxHealth) * 100)}%`);
  }

  setRelations(relations: Map<FactionId, Relation>): void {
    this.relationList.replaceChildren();
    for (const faction of Object.keys(FACTIONS) as FactionId[]) {
      if (faction === this.currentFaction) {
        continue;
      }
      const relation = relations.get(faction) ?? 'neutral';
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'relation-row';
      row.style.width = '100%';
      row.style.borderRight = '0';
      row.style.borderBottom = '0';
      row.style.borderLeft = '0';
      row.style.background = 'transparent';
      row.style.cursor = 'pointer';
      row.style.pointerEvents = 'auto';
      const name = document.createElement('span');
      name.textContent = FACTIONS[faction].name;
      name.style.textAlign = 'left';
      const state = document.createElement('strong');
      state.className = `relation-${relation}`;
      state.textContent = `${this.relationLabel(relation)} · 개입`;
      row.append(name, state);
      row.addEventListener('click', () => this.callbacks.onDiplomacy(faction));
      this.relationList.append(row);
    }
  }

  setDeploy(kind: DeployKind | null): void {
    this.activeDeploy = kind;
    for (const [buttonKind, button] of this.deployButtons) {
      button.classList.toggle('active', buttonKind === kind);
    }
  }

  notify(title: string, body: string, color = '#56b8ff'): void {
    const message = document.createElement('div');
    message.className = 'message';
    message.style.borderRightColor = color;
    const heading = document.createElement('strong');
    heading.textContent = title;
    message.append(heading, document.createElement('br'), document.createTextNode(body));
    this.messageLog.prepend(message);
    while (this.messageLog.children.length > 5) {
      this.messageLog.lastElementChild?.remove();
    }
    window.setTimeout(() => {
      message.style.opacity = '0';
      window.setTimeout(() => message.remove(), 250);
    }, 6500);
  }

  flashDamage(intensity: number): void {
    this.damageVignette.style.opacity = Math.min(0.9, intensity).toString();
    window.setTimeout(() => {
      this.damageVignette.style.opacity = '0';
    }, 90);
  }

  showKillEvent(
    playerDeath: boolean,
    killerName: string,
    killerColor: string,
    victimName: string,
    victimColor: string,
  ): void {
    window.clearTimeout(this.killLogTimer);
    this.killLog.style.setProperty('--killer-color', killerColor);
    this.killLog.style.setProperty('--victim-color', victimColor);
    this.killKicker.textContent = playerDeath ? 'YOUR UNIT DESTROYED' : 'KILL CONFIRMED';
    this.killTitle.textContent = playerDeath ? '빙의 유닛 전투 불능' : `${victimName} 격파`;
    this.killDetail.textContent = `${killerName}  →  ${victimName}`;
    this.killLog.classList.remove('hidden');
    this.killLog.classList.toggle('player-death', playerDeath);
    this.killLogTimer = window.setTimeout(() => {
      this.killLog.classList.add('hidden');
    }, 3400);
  }

  private require<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`HUD element missing: ${selector}`);
    }
    return element;
  }

  private updateCrosshair(): void {
    const visible = this.currentMode === 'possession' || this.pointerLocked;
    this.crosshair.classList.toggle('hidden', !visible);
  }

  private relationLabel(relation: Relation): string {
    return relation === 'allied' ? '동맹' : relation === 'hostile' ? '적대' : '중립';
  }

  private orderLabel(order: 'move' | 'attack' | 'hold'): string {
    return order === 'move' ? '이동 중' : order === 'attack' ? '교전 중' : '위치 사수';
  }

  private doctrineLabel(doctrine: 'firepower' | 'mobility' | 'entrenchment'): string {
    if (doctrine === 'firepower') {
      return '화력 교리';
    }
    if (doctrine === 'mobility') {
      return '기동 교리';
    }
    return '참호 방어 교리';
  }
}
