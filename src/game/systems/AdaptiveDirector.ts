import type { Outpost } from '../entities/Outpost';
import type { UnitKind } from '../types';

interface LearnedProfile {
  targetWeights: Record<string, number>;
  unitWeights: Partial<Record<UnitKind, number>>;
}

export interface AdaptivePrediction {
  targetId: string | null;
  targetLabel: string;
  confidence: number;
  read: '관찰 중' | '공세 예측' | '방어 집중';
}

export interface AdaptiveObservation {
  prediction: AdaptivePrediction;
  deceptionTriggered: boolean;
}

export class AdaptiveDirector {
  private readonly targetWeights = new Map<string, number>();
  private readonly unitWeights = new Map<UnitKind, number>();
  private readonly storageKey: string;
  private prediction: AdaptivePrediction = {
    targetId: null,
    targetLabel: '데이터 수집 중',
    confidence: 0,
    read: '관찰 중',
  };
  private deceptionCooldown = 0;
  private commandCount = 0;

  constructor(outposts: Outpost[]) {
    this.storageKey = `brick-warfare-adaptive-profile-v1-${outposts.length}`;
    const saved = this.loadProfile();
    outposts.forEach((outpost, index) => {
      this.targetWeights.set(
        outpost.id,
        saved.targetWeights[outpost.id] ?? 1 + (index % 3) * 0.04,
      );
    });
    for (const [kind, weight] of Object.entries(saved.unitWeights)) {
      this.unitWeights.set(kind as UnitKind, weight ?? 0);
    }
    this.recalculatePrediction(outposts);
  }

  update(delta: number, outposts: Outpost[]): AdaptivePrediction {
    this.deceptionCooldown = Math.max(0, this.deceptionCooldown - delta);
    for (const [id, weight] of this.targetWeights) {
      this.targetWeights.set(id, Math.max(0.4, weight - delta * 0.003));
    }
    this.recalculatePrediction(outposts);
    return this.prediction;
  }

  observeCommand(
    unitKind: UnitKind,
    target: Outpost | null,
    outposts: Outpost[],
  ): AdaptiveObservation {
    const previousPrediction = this.prediction;
    let deceptionTriggered = false;

    if (target) {
      if (
        previousPrediction.targetId
        && previousPrediction.targetId !== target.id
        && previousPrediction.confidence >= 0.48
        && this.deceptionCooldown <= 0
      ) {
        deceptionTriggered = true;
        this.deceptionCooldown = 25;
      }
      this.targetWeights.set(
        target.id,
        (this.targetWeights.get(target.id) ?? 1) + 1.35,
      );
    }
    this.unitWeights.set(unitKind, (this.unitWeights.get(unitKind) ?? 0) + 1);
    this.commandCount += 1;
    this.recalculatePrediction(outposts);
    this.saveProfile();
    return {
      prediction: this.prediction,
      deceptionTriggered,
    };
  }

  getPrediction(): AdaptivePrediction {
    return this.prediction;
  }

  private recalculatePrediction(outposts: Outpost[]): void {
    const ranked = outposts
      .map((outpost) => ({
        id: outpost.id,
        label: `거점 ${outpost.label}`,
        weight: this.targetWeights.get(outpost.id) ?? 1,
        owner: outpost.owner,
      }))
      .sort((left, right) => right.weight - left.weight);
    const top = ranked[0];
    const total = ranked.reduce((sum, candidate) => sum + Math.exp(candidate.weight), 0);
    const confidence = top ? Math.exp(top.weight) / Math.max(1, total) : 0;
    this.prediction = {
      targetId: top?.id ?? null,
      targetLabel: this.commandCount < 2 ? '명령 패턴 분석 중' : top?.label ?? '없음',
      confidence: this.commandCount < 2 ? Math.min(confidence, 0.28) : confidence,
      read: this.commandCount < 2
        ? '관찰 중'
        : top?.owner === 'crimson'
          ? '방어 집중'
          : '공세 예측',
    };
  }

  private loadProfile(): LearnedProfile {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return { targetWeights: {}, unitWeights: {} };
      }
      const parsed = JSON.parse(raw) as Partial<LearnedProfile>;
      return {
        targetWeights: parsed.targetWeights ?? {},
        unitWeights: parsed.unitWeights ?? {},
      };
    } catch {
      return { targetWeights: {}, unitWeights: {} };
    }
  }

  private saveProfile(): void {
    try {
      const targetWeights = Object.fromEntries(this.targetWeights);
      const unitWeights = Object.fromEntries(this.unitWeights);
      window.localStorage.setItem(
        this.storageKey,
        JSON.stringify({ targetWeights, unitWeights }),
      );
    } catch {
    }
  }
}
