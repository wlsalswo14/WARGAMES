import { FACTIONS } from '../config';
import type {
  ChallengeFormat,
  PlayMode,
  PlayModeConfig,
} from '../modes/PlayMode';
import type { AdaptivePrediction } from '../systems/AdaptiveDirector';
import type { ChallengeSessionSnapshot } from '../systems/ChallengeSession';
import {
  COMMANDER_ABILITIES,
  type CommanderAbilityState,
} from '../systems/CommanderAbilitySystem';
import type { ConquestSessionSnapshot } from '../systems/ConquestSession';
import type { ProgressionReward } from '../systems/PlayerProgression';
import type {
  BattlefieldStats,
  CommanderAbilityKind,
  DeployKind,
  FactionId,
  FormationType,
  GameMode,
  Relation,
} from '../types';
import type { Unit } from '../entities/Unit';

interface HudCallbacks {
  onStart: () => void;
  onModeSelect: (mode: PlayMode) => void;
  onFormatSelect: (format: ChallengeFormat) => void;
  onDeploy: (kind: DeployKind) => void;
  onCycleFaction: () => void;
  onDiplomacy: (target: FactionId) => void;
  onPossess: () => void;
  onCommanderAbility: (kind: CommanderAbilityKind) => void;
}

interface ChallengeHudState {
  session: ChallengeSessionSnapshot;
  prediction: AdaptivePrediction;
  objectives: Array<{
    label: string;
    owner: FactionId | null;
    captureFaction: FactionId | null;
    capturePercent: number;
    contested: boolean;
  }>;
}

interface ConquestHudState {
  session: ConquestSessionSnapshot;
  objectives: ChallengeHudState['objectives'];
  phase: string;
}

const DEPLOYMENTS: Array<{ kind: DeployKind; label: string }> = [
  { kind: 'infantry', label: '보병' },
  { kind: 'general', label: '지휘관' },
  { kind: 'tank', label: '전차' },
  { kind: 'fighter', label: '전투기' },
  { kind: 'helicopter', label: '헬기' },
  { kind: 'drone', label: '드론' },
  { kind: 'wall', label: '장벽' },
  { kind: 'mountain', label: '산' },
  { kind: 'trench', label: '참호' },
  { kind: 'building', label: '대형 건물' },
  { kind: 'factory', label: '생산기지' },
  { kind: 'barracks', label: '보병 막사' },
  { kind: 'armorFactory', label: '기갑 공장' },
  { kind: 'airfield', label: '전술 비행장' },
  { kind: 'tree', label: '나무' },
];

const FORMATION_LABELS: Record<FormationType, string> = {
  line: '횡대',
  wedge: '쐐기',
  column: '종대',
};

export class Hud {
  readonly root: HTMLDivElement;
  private readonly modeBadge: HTMLDivElement;
  private readonly resourcesLabel: HTMLElement;
  private readonly outpostStatsLabel: HTMLElement;
  private readonly unitStatsLabel: HTMLElement;
  private readonly factionPanel: HTMLDivElement;
  private readonly relationList: HTMLDivElement;
  private readonly economyLabel: HTMLElement;
  private readonly factionName: HTMLElement;
  private readonly selectionPanel: HTMLDivElement;
  private readonly selectionName: HTMLElement;
  private readonly selectionFaction: HTMLElement;
  private readonly selectionType: HTMLElement;
  private readonly selectionHealth: HTMLElement;
  private readonly healthBar: HTMLElement;
  private readonly messageLog: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly godControls: HTMLDivElement;
  private readonly possessionControls: HTMLDivElement;
  private readonly deployDock: HTMLDivElement;
  private readonly commanderDock: HTMLDivElement;
  private readonly profileLabel: HTMLElement;
  private readonly selectionBox: HTMLDivElement;
  private readonly factionButton: HTMLButtonElement;
  private readonly damageVignette: HTMLDivElement;
  private readonly challengePanel: HTMLDivElement;
  private readonly challengeTimer: HTMLElement;
  private readonly challengeScore: HTMLElement;
  private readonly objectiveStrip: HTMLElement;
  private readonly linkFill: HTMLElement;
  private readonly linkLabel: HTMLElement;
  private readonly predictionTarget: HTMLElement;
  private readonly predictionConfidence: HTMLElement;
  private readonly tutorial: HTMLDivElement;
  private readonly resultOverlay: HTMLDivElement;
  private readonly possessButton: HTMLButtonElement;
  private readonly deployButtons = new Map<DeployKind, HTMLButtonElement>();
  private readonly abilityButtons = new Map<
    CommanderAbilityKind,
    HTMLButtonElement
  >();
  private activeDeploy: DeployKind | null = null;
  private currentFaction: FactionId = 'azure';
  private currentMode: GameMode = 'god';
  private pointerLocked = false;
  private unlimitedDeployment = false;
  private hasDeployments = true;

  constructor(
    container: HTMLElement,
    private readonly playMode: PlayMode,
    private readonly challengeFormat: ChallengeFormat,
    private readonly callbacks: HudCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = `hud hud-${playMode}`;
    this.root.innerHTML = this.createMarkup();
    container.append(this.root);

    this.modeBadge = this.require('[data-ui="mode-badge"]');
    this.resourcesLabel = this.require('[data-ui="resources"]');
    this.outpostStatsLabel = this.require('[data-ui="outpost-stats"]');
    this.unitStatsLabel = this.require('[data-ui="unit-stats"]');
    this.factionPanel = this.require('[data-ui="faction-panel"]');
    this.relationList = this.require('[data-ui="relation-list"]');
    this.economyLabel = this.require('[data-ui="economy"]');
    this.factionName = this.require('[data-ui="faction-name"]');
    this.selectionPanel = this.require('[data-ui="selection-panel"]');
    this.selectionName = this.require('[data-ui="selection-name"]');
    this.selectionFaction = this.require('[data-ui="selection-faction"]');
    this.selectionType = this.require('[data-ui="selection-type"]');
    this.selectionHealth = this.require('[data-ui="selection-health"]');
    this.healthBar = this.require('[data-ui="health-bar"]');
    this.messageLog = this.require('[data-ui="message-log"]');
    this.crosshair = this.require('[data-ui="crosshair"]');
    this.godControls = this.require('[data-ui="controls-god"]');
    this.possessionControls = this.require('[data-ui="controls-possession"]');
    this.deployDock = this.require('[data-ui="deploy-dock"]');
    this.commanderDock = this.require('[data-ui="commander-dock"]');
    this.profileLabel = this.require('[data-ui="profile"]');
    this.selectionBox = this.require('[data-ui="selection-box"]');
    this.damageVignette = this.require('[data-ui="damage-vignette"]');
    this.challengePanel = this.require('[data-ui="challenge-panel"]');
    this.challengeTimer = this.require('[data-ui="challenge-timer"]');
    this.challengeScore = this.require('[data-ui="challenge-score"]');
    this.objectiveStrip = this.require('[data-ui="objective-strip"]');
    this.linkFill = this.require('[data-ui="link-fill"]');
    this.linkLabel = this.require('[data-ui="link-label"]');
    this.predictionTarget = this.require('[data-ui="prediction-target"]');
    this.predictionConfidence = this.require('[data-ui="prediction-confidence"]');
    this.tutorial = this.require('[data-ui="tutorial"]');
    this.resultOverlay = this.require('[data-ui="result-overlay"]');
    this.possessButton = this.require('[data-ui="possess-button"]');

    this.bindSplash();
    this.factionButton = this.createFactionButton();
    this.createDeployButtons();
    this.createCommanderButtons();
    this.setFaction('azure');
    this.challengePanel.classList.toggle('hidden', playMode === 'sandbox');
    this.commanderDock.classList.toggle('hidden', playMode !== 'conquest');
    this.tutorial.classList.toggle('hidden', playMode === 'sandbox');
  }

  configureMode(config: PlayModeConfig): void {
    this.unlimitedDeployment = config.unlimitedDeployment;
    this.hasDeployments = config.allowedDeployments.length > 0;
    this.factionButton.classList.toggle('hidden', !config.enableFactionCycle);
    this.factionPanel.classList.toggle('compact', !config.enableDiplomacy);
    this.deployDock.classList.toggle('hidden', !this.hasDeployments);
    for (const [kind, button] of this.deployButtons) {
      const enabled = config.allowedDeployments.includes(kind);
      button.classList.toggle('hidden', !enabled);
      const detail = button.querySelector('small');
      if (detail) {
        const cost = config.deploymentCosts[kind];
        detail.textContent = config.unlimitedDeployment
          ? '∞ GOD DEPLOY'
          : `${cost ?? 0} SUP`;
      }
    }
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
    this.possessButton.classList.toggle('hidden', possessed);
    if (possessed) {
      this.tutorial.classList.add('hidden');
    }
    this.deployDock.classList.toggle('hidden', possessed || !this.hasDeployments);
    this.commanderDock.classList.toggle(
      'hidden',
      possessed || this.playMode !== 'conquest',
    );
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
    this.resourcesLabel.textContent = this.unlimitedDeployment
      ? '∞'
      : Math.floor(amount).toString();
  }

  setStats(stats: BattlefieldStats): void {
    const outposts = [
      `청람 ${stats.outpostCounts.azure}`,
      `적월 ${stats.outpostCounts.crimson}`,
    ];
    const units = [
      stats.eliminated.azure ? '청람 멸망' : `청람 ${stats.unitCounts.azure}`,
      stats.eliminated.crimson ? '적월 멸망' : `적월 ${stats.unitCounts.crimson}`,
    ];
    if (
      this.playMode === 'sandbox'
      || (
        this.playMode === 'challenge'
        && this.challengeFormat === 'triple'
      )
    ) {
      outposts.push(`황토 ${stats.outpostCounts.amber}`);
      units.push(stats.eliminated.amber ? '황토 멸망' : `황토 ${stats.unitCounts.amber}`);
    }
    outposts.push(`중립 ${stats.neutralOutposts}`);
    this.outpostStatsLabel.textContent = outposts.join(' · ');
    this.unitStatsLabel.textContent = units.join(' · ');
  }

  setEconomySummary(summary: string | null): void {
    this.economyLabel.classList.toggle('hidden', !summary);
    this.economyLabel.textContent = summary ?? '';
  }

  setSelection(
    unit: Unit | null,
    count = unit ? 1 : 0,
    formation: FormationType = 'line',
  ): void {
    this.selectionPanel.classList.toggle('hidden', !unit);
    if (!unit) {
      return;
    }
    this.selectionName.textContent = count > 1
      ? `${unit.displayName} 외 ${count - 1}개 부대`
      : unit.displayName;
    this.selectionFaction.textContent = FACTIONS[unit.faction].name;
    this.selectionFaction.style.color = FACTIONS[unit.faction].accent;
    this.selectionType.textContent = unit.possessed
      ? '직접 조종 중'
      : count > 1
        ? `${FORMATION_LABELS[formation]} 대형 · R 변경`
      : unit.order
        ? this.orderLabel(unit.order.type)
        : '대기';
    const specialState = unit.kind === 'infantry'
      ? ''
      : unit.specialReloadTimer > 0
        ? ` · ${unit.specialAttackName} ${unit.specialReloadTimer.toFixed(1)}초`
        : ` · ${unit.specialAttackName} 준비`;
    this.selectionHealth.textContent = unit.destroyed
      ? '파괴됨'
      : `${Math.ceil(unit.health)} / ${unit.stats.maxHealth}${specialState} · ${unit.subsystemStatus}`;
    this.healthBar.style.setProperty(
      '--health',
      `${Math.max(0, (unit.health / unit.stats.maxHealth) * 100)}%`,
    );
  }

  setRelations(relations: Map<FactionId, Relation>): void {
    this.relationList.replaceChildren();
    if (this.playMode !== 'sandbox') {
      const opponents: FactionId[] = (
        this.playMode === 'challenge'
        && this.challengeFormat === 'triple'
      )
        ? ['crimson', 'amber']
        : ['crimson'];
      for (const opponent of opponents) {
        const summary = document.createElement('div');
        summary.className = 'relation-row relation-static';
        summary.innerHTML = `<span>${FACTIONS[opponent].name}</span><strong class="relation-hostile">적대</strong>`;
        this.relationList.append(summary);
      }
      return;
    }
    for (const faction of Object.keys(FACTIONS) as FactionId[]) {
      if (faction === this.currentFaction) {
        continue;
      }
      const relation = relations.get(faction) ?? 'neutral';
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'relation-row';
      const name = document.createElement('span');
      name.textContent = FACTIONS[faction].name;
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

  setChallengeState(state: ChallengeHudState): void {
    const totalSeconds = Math.ceil(state.session.remainingSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.challengeTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    this.challengeScore.textContent = this.challengeFormat === 'triple'
      ? `${state.session.scores.azure} : ${state.session.scores.crimson} : ${state.session.scores.amber} / ${state.session.scoreLimit}`
      : `${state.session.scores.azure} : ${state.session.scores.crimson} / ${state.session.scoreLimit}`;
    const linkValue = state.session.possessionSeconds > 0
      ? (state.session.possessionSeconds / 15) * 100
      : state.session.linkPercent;
    this.linkFill.style.width = `${Math.max(0, Math.min(100, linkValue))}%`;
    this.linkLabel.textContent = state.session.possessionSeconds > 0
      ? `접속 ${state.session.possessionSeconds.toFixed(1)}초`
      : state.session.linkPercent >= 100
        ? '즉시 빙의 가능'
        : `재충전 ${Math.floor(state.session.linkPercent)}%`;
    this.predictionTarget.textContent = state.prediction.confidence < 0.35
      ? '적 지휘관이 전선을 분석 중'
      : `적 대응 · ${state.prediction.read} · ${state.prediction.targetLabel}`;
    this.predictionConfidence.textContent = state.prediction.confidence < 0.35
      ? '대기'
      : `${Math.round(state.prediction.confidence * 100)}%`;
    this.objectiveStrip.replaceChildren(
      ...state.objectives.map((objective) => {
        const chip = document.createElement('div');
        const ownerClass = objective.owner ?? 'neutral';
        chip.className = `objective-chip owner-${ownerClass}${
          objective.contested ? ' contested' : ''
        }`;
        const activeFaction = objective.captureFaction ?? objective.owner;
        const color = activeFaction
          ? FACTIONS[activeFaction].accent
          : '#d7e1e8';
        const stateLabel = objective.contested
          ? '교전 중'
          : objective.captureFaction
            ? `${FACTIONS[objective.captureFaction].name} 점령 중`
            : objective.owner
              ? FACTIONS[objective.owner].name
              : '중립';
        chip.style.setProperty('--objective-color', color);
        chip.innerHTML = `
          <b>${objective.label}</b>
          <span><i style="width:${objective.capturePercent}%"></i></span>
          <small>${stateLabel}</small>
        `;
        return chip;
      }),
    );
  }

  setConquestState(state: ConquestHudState): void {
    const totalSeconds = Math.ceil(state.session.remainingSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.challengeTimer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    this.challengeScore.textContent = `${state.session.commandPoints.azure} : ${state.session.commandPoints.crimson} CP`;
    const dominationPercent = state.session.dominationTarget > 0
      ? state.session.dominationSeconds / state.session.dominationTarget * 100
      : 0;
    this.linkFill.style.width = `${Math.min(100, dominationPercent)}%`;
    this.linkLabel.textContent = state.session.dominationSeconds > 0
      ? `완전 점령 ${state.session.dominationSeconds.toFixed(1)} / ${state.session.dominationTarget}초`
      : '전 거점 30초 장악 시 승리';
    this.predictionTarget.textContent = state.phase;
    this.predictionConfidence.textContent = 'LIVE';
    this.objectiveStrip.replaceChildren(
      ...state.objectives.map((objective) => {
        const chip = document.createElement('div');
        const ownerClass = objective.owner ?? 'neutral';
        chip.className = `objective-chip owner-${ownerClass}${
          objective.contested ? ' contested' : ''
        }`;
        const activeFaction = objective.captureFaction ?? objective.owner;
        const color = activeFaction
          ? FACTIONS[activeFaction].accent
          : '#d7e1e8';
        const stateLabel = objective.contested
          ? '교전 중'
          : objective.captureFaction
            ? `${FACTIONS[objective.captureFaction].name} 점령 중`
            : objective.owner
              ? FACTIONS[objective.owner].name
              : '중립';
        chip.style.setProperty('--objective-color', color);
        chip.innerHTML = `
          <b>${objective.label}</b>
          <span><i style="width:${objective.capturePercent}%"></i></span>
          <small>${stateLabel}</small>
        `;
        return chip;
      }),
    );
  }

  setCommanderState(
    states: CommanderAbilityState[],
    pending: CommanderAbilityKind | null,
    profile: string,
  ): void {
    this.profileLabel.textContent = profile;
    for (const state of states) {
      const button = this.abilityButtons.get(state.kind);
      if (!button) {
        continue;
      }
      button.classList.toggle('active', pending === state.kind);
      button.classList.toggle('cooldown', state.remaining > 0);
      button.disabled = !state.ready && pending !== state.kind;
      const status = state.remaining > 0
        ? `${state.remaining.toFixed(0)}초`
        : `${state.cost} SUP`;
      button.innerHTML = `<strong>${state.label}</strong><small>${status}</small>`;
    }
  }

  setSelectionBox(
    rect: { left: number; top: number; width: number; height: number } | null,
  ): void {
    this.selectionBox.classList.toggle('hidden', !rect);
    if (!rect) {
      return;
    }
    this.selectionBox.style.left = `${rect.left}px`;
    this.selectionBox.style.top = `${rect.top}px`;
    this.selectionBox.style.width = `${rect.width}px`;
    this.selectionBox.style.height = `${rect.height}px`;
  }

  showResult(snapshot: ChallengeSessionSnapshot): void {
    const title = snapshot.winner === 'azure'
      ? '작전 성공'
      : snapshot.winner
        ? '작전 실패'
        : '무승부';
    const reason = snapshot.finishReason === 'domination'
      ? `${snapshot.scoreLimit} 지휘 점수 선취`
      : snapshot.finishReason === 'headquarters'
      ? '적 지휘 본부 파괴'
      : snapshot.finishReason === 'elimination'
        ? '전투 병력 전멸'
        : '작전 시간 종료';
    this.resultOverlay.innerHTML = `
      <div class="result-card">
        <div class="eyebrow">AFTER ACTION REPORT</div>
        <h2>${title}</h2>
        <p>${reason}</p>
        <div class="result-score">${
          this.challengeFormat === 'triple'
            ? `${snapshot.scores.azure} : ${snapshot.scores.crimson} : ${snapshot.scores.amber}`
            : `${snapshot.scores.azure} : ${snapshot.scores.crimson}`
        }</div>
        <div class="result-stats">
          <span>거점 점령 <b>${snapshot.captures}</b></span>
          <span>격파 <b>${snapshot.kills}</b></span>
          <span>전술 기만 <b>${snapshot.deceptions}</b></span>
        </div>
        <button type="button" data-action="retry">다시 도전</button>
        <button type="button" data-action="sandbox">Sandbox로 이동</button>
      </div>
    `;
    this.resultOverlay.classList.remove('hidden');
    this.resultOverlay.querySelector('[data-action="retry"]')?.addEventListener(
      'click',
      () => window.location.reload(),
    );
    this.resultOverlay.querySelector('[data-action="sandbox"]')?.addEventListener(
      'click',
      () => this.callbacks.onModeSelect('sandbox'),
    );
  }

  showConquestResult(
    snapshot: ConquestSessionSnapshot,
    reward: ProgressionReward,
  ): void {
    const title = snapshot.winner === 'azure'
      ? '정복전 승리'
      : snapshot.winner
        ? '정복전 패배'
        : '교착 상태';
    const reason = snapshot.finishReason === 'domination'
      ? '전 거점 완전 장악'
      : snapshot.finishReason === 'headquarters'
        ? '적 지휘 본부 파괴'
        : snapshot.finishReason === 'elimination'
          ? '적 전투 병력 전멸'
          : '작전 시간 종료';
    this.resultOverlay.innerHTML = `
      <div class="result-card">
        <div class="eyebrow">CONQUEST AFTER ACTION REPORT</div>
        <h2>${title}</h2>
        <p>${reason}</p>
        <div class="result-score">${snapshot.commandPoints.azure} : ${snapshot.commandPoints.crimson} CP</div>
        <div class="result-stats">
          <span>거점 점령 <b>${snapshot.captures}</b></span>
          <span>격파 <b>${snapshot.kills}</b></span>
          <span>생산시설 <b>${snapshot.buildings}</b></span>
          <span>지휘 능력 <b>${snapshot.abilities}</b></span>
        </div>
        <p class="rank-reward">+${reward.earnedXp} XP · ${reward.rankName}${
          reward.rankUp ? ' 진급!' : ''
        }</p>
        <button type="button" data-action="retry">다시 정복전</button>
        <button type="button" data-action="sandbox">Sandbox로 이동</button>
      </div>
    `;
    this.resultOverlay.classList.remove('hidden');
    this.resultOverlay.querySelector('[data-action="retry"]')?.addEventListener(
      'click',
      () => window.location.reload(),
    );
    this.resultOverlay.querySelector('[data-action="sandbox"]')?.addEventListener(
      'click',
      () => this.callbacks.onModeSelect('sandbox'),
    );
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

  private createMarkup(): string {
    const challengeSelected = this.playMode === 'challenge' ? 'selected' : '';
    const conquestSelected = this.playMode === 'conquest' ? 'selected' : '';
    const sandboxSelected = this.playMode === 'sandbox' ? 'selected' : '';
    const duelSelected = this.challengeFormat === 'duel' ? 'selected' : '';
    const tripleSelected = this.challengeFormat === 'triple' ? 'selected' : '';
    return `
      <div class="top-bar">
        <div class="brand">PROJECT BRICK WARFARE</div>
        <div class="mode-badge" data-ui="mode-badge">GOD EYE</div>
        <div class="status-strip">
          <span>SUP <b data-ui="resources">0</b></span>
          <span>거점 <b data-ui="outpost-stats">-</b></span>
          <span>병력 <b data-ui="unit-stats">-</b></span>
          <span class="command-profile" data-ui="profile">소위 · 0 XP</span>
        </div>
      </div>
      <section class="challenge-panel hidden" data-ui="challenge-panel">
        <div><small>남은 시간</small><strong data-ui="challenge-timer">${
          this.playMode === 'conquest' ? '12:00' : '3:00'
        }</strong></div>
        <div><small>${
          this.playMode === 'conquest'
            ? 'COMMAND POINT · 청람 : 적월'
            : this.challengeFormat === 'triple'
            ? '청람 : 적월 : 황토'
            : '지휘 점수 · 청람 : 적월'
        }</small><strong data-ui="challenge-score">${
          this.playMode === 'conquest'
            ? '0 : 0 CP'
            : this.challengeFormat === 'triple'
              ? '0 : 0 : 0 / 100'
              : '0 : 0 / 100'
        }</strong></div>
        <div class="command-link">
          <small>${this.playMode === 'conquest' ? 'TOTAL DOMINATION' : 'DIRECT LINK'}</small>
          <strong data-ui="link-label">${
            this.playMode === 'conquest' ? '전 거점 30초 장악 시 승리' : '즉시 빙의 가능'
          }</strong>
          <span><i data-ui="link-fill"></i></span>
        </div>
        <div class="ai-read">
          <small>${this.playMode === 'conquest' ? 'OPERATION PHASE' : 'ENEMY COMMANDER'}</small>
          <strong data-ui="prediction-target">${
            this.playMode === 'conquest' ? '초기 거점 확보' : '적 지휘관이 전선을 분석 중'
          }</strong>
          <b data-ui="prediction-confidence">대기</b>
        </div>
        <div class="objective-strip" data-ui="objective-strip"></div>
      </section>
      <section class="faction-panel" data-ui="faction-panel">
        <h2 data-ui="faction-name">청람 연합</h2>
        <div data-ui="relation-list"></div>
        <div class="economy-summary hidden" data-ui="economy"></div>
      </section>
      <section class="selection-panel hidden" data-ui="selection-panel">
        <h2 data-ui="selection-name">선택 없음</h2>
        <div class="selection-grid">
          <span>진영</span><strong data-ui="selection-faction">-</strong>
          <span>명령</span><strong data-ui="selection-type">-</strong>
          <span>상태</span><strong data-ui="selection-health">-</strong>
        </div>
        <div class="health-bar"><span data-ui="health-bar"></span></div>
        <button class="possess-button" data-ui="possess-button" type="button">선택 유닛 직접 조종 <span>[ENTER]</span></button>
      </section>
      <div class="deploy-dock" data-ui="deploy-dock"></div>
      <div class="commander-dock hidden" data-ui="commander-dock"></div>
      <div class="message-log" data-ui="message-log"></div>
      <div class="crosshair hidden" data-ui="crosshair"></div>
      <div class="selection-box hidden" data-ui="selection-box"></div>
      <div class="tutorial" data-ui="tutorial">
        ${this.playMode === 'conquest'
          ? '<b>Tab</b> 전술 커서 · 드래그 다중 선택<br /><b>우클릭</b> 대형 이동/공격 · <b>R</b> 대형 변경<br /><b>1~4</b> 포격/공습/증원/수리 · <b>Enter</b> 직접 조종<br />거점 확보 → 생산시설 건설 → 적 본부 파괴'
          : '<b>1 / 2 / 3</b> 선택 유닛을 A / B / C 거점으로 명령<br /><b>우클릭</b> 원하는 위치로 진격 명령<br /><b>Enter / 더블클릭</b> 즉시 직접 조종<br /><b>B</b> 점령 거점 생산기지 건설<br />거점을 지켜 <b>100점</b>을 먼저 확보'}
      </div>
      <div class="controls controls-god" data-ui="controls-god">
        <b>마우스</b> 이동 방향으로 시점 · <b>W/S</b> 전후 · <b>A/D</b> 우/좌 · <b>Space/Shift</b> 상승/하강<br />
        ${this.playMode === 'challenge'
          ? '<b>좌클릭</b> 선택/건설 · <b>1/2/3</b> 거점 명령 · <b>B</b> 생산기지 · <b>Enter</b> 빙의'
          : this.playMode === 'conquest'
            ? '<b>Tab</b> 커서 · <b>드래그</b> 분대 선택 · <b>우클릭</b> 명령 · <b>1~4</b> 지휘 능력 · <b>R</b> 대형'
          : '<b>좌클릭</b> 배치/선택 · <b>우클릭</b> 명령 · <b>1~0</b> 도구 · <b>F</b> 진영'}
      </div>
      <div class="controls controls-possession hidden" data-ui="controls-possession">
        <b>W/S</b> 전후 · <b>A/D</b> 우/좌 · <b>마우스</b> 이동 방향으로 조준 · <b>좌/우클릭 유지</b> 일반/특수 공격<br />
        <b>Space/Shift</b> 상승/하강 (전투기: 기수 올림/내림·루프) · <b>V</b> 시점 · <b>G/Esc</b> 관찰자 복귀
      </div>
      <div class="damage-vignette" data-ui="damage-vignette"></div>
      <div class="result-overlay hidden" data-ui="result-overlay"></div>
      <section class="splash" data-ui="splash">
        <div class="splash-card">
          <div class="eyebrow">BLOCKS · BALLISTICS · ADAPTIVE WARFARE</div>
          <h1>PROJECT<br /><span>BRICK WARFARE</span></h1>
          <p>
            생산망과 7개 전선을 지휘하고, 결정적인 순간 직접 뛰어드십시오.<br />
            파괴된 도시가 길을 바꾸는 블록 전장 하이브리드 RTS입니다.
          </p>
          <div class="mode-selector">
            <button class="mode-card ${conquestSelected}" type="button" data-mode="conquest">
              <strong>CONQUEST · MAIN GAME</strong>
              <span>12분 · 7개 거점 · 기지 건설 · 분대 지휘 · 지휘관 능력 · 성장</span>
            </button>
            <button class="mode-card ${challengeSelected}" type="button" data-mode="challenge">
              <strong>AI CHALLENGE</strong>
              <span>3분 · 3종 전장 · A/B/C 거점전 · 즉시 빙의 · 100점 선취</span>
            </button>
            <button class="mode-card ${sandboxSelected}" type="button" data-mode="sandbox">
              <strong>SANDBOX</strong>
              <span>3개 진영 · 무한 배치 · 랜덤 절차적 전장</span>
            </button>
          </div>
          <div class="format-selector ${this.playMode === 'challenge' ? '' : 'hidden'}">
            <span>CHALLENGE FORMAT</span>
            <button class="${duelSelected}" type="button" data-format="duel">
              1 VS 1
              <small>권장 · 압축 전장 · 중립 거점 3개</small>
            </button>
            <button class="${tripleSelected}" type="button" data-format="triple">
              1 VS 1 VS 1
              <small>확장 전투 · 3개 진영</small>
            </button>
          </div>
          <div class="feature-row">
            <span>GOD ↔ POSSESSION</span>
            <span>BASE & SQUAD COMMAND</span>
            <span>BRICK DESTRUCTION</span>
            <span>ADAPTIVE ENEMY AI</span>
          </div>
          <button class="start-button" type="button">작전 시작</button>
        </div>
      </section>
    `;
  }

  private bindSplash(): void {
    const splash = this.require<HTMLDivElement>('[data-ui="splash"]');
    this.require<HTMLButtonElement>('[class="start-button"]').addEventListener(
      'click',
      () => {
        splash.classList.add('hidden');
        this.callbacks.onStart();
      },
    );
    for (const modeButton of this.root.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      modeButton.addEventListener('click', () => {
        const mode = modeButton.dataset.mode as PlayMode;
        if (mode === this.playMode) {
          return;
        }
        this.callbacks.onModeSelect(mode);
      });
    }
    for (const formatButton of this.root.querySelectorAll<HTMLButtonElement>('[data-format]')) {
      formatButton.addEventListener('click', () => {
        const format = formatButton.dataset.format as ChallengeFormat;
        if (format !== this.challengeFormat) {
          this.callbacks.onFormatSelect(format);
        }
      });
    }
    this.possessButton.addEventListener('click', this.callbacks.onPossess);
  }

  private createFactionButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'deploy-button';
    button.type = 'button';
    button.addEventListener('click', this.callbacks.onCycleFaction);
    this.deployDock.append(button);
    return button;
  }

  private createDeployButtons(): void {
    for (const descriptor of DEPLOYMENTS) {
      const button = document.createElement('button');
      button.className = 'deploy-button';
      button.type = 'button';
      button.innerHTML = `${descriptor.label}<small>∞ GOD DEPLOY</small>`;
      button.addEventListener('click', () => {
        this.setDeploy(this.activeDeploy === descriptor.kind ? null : descriptor.kind);
        this.callbacks.onDeploy(descriptor.kind);
      });
      this.deployButtons.set(descriptor.kind, button);
      this.deployDock.append(button);
    }
  }

  private createCommanderButtons(): void {
    const hotkeys: CommanderAbilityKind[] = [
      'artillery',
      'airstrike',
      'reinforce',
      'repair',
    ];
    for (const [index, kind] of hotkeys.entries()) {
      const definition = COMMANDER_ABILITIES[kind];
      const button = document.createElement('button');
      button.className = 'commander-button';
      button.type = 'button';
      button.title = definition.description;
      button.innerHTML = `<kbd>${index + 1}</kbd><strong>${definition.label}</strong><small>${definition.cost} SUP</small>`;
      button.addEventListener('click', () => {
        this.callbacks.onCommanderAbility(kind);
      });
      this.abilityButtons.set(kind, button);
      this.commanderDock.append(button);
    }
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
