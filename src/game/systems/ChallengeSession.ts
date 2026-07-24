import type { FactionId } from '../types';

export type ChallengeFinishReason =
  | 'timeout'
  | 'headquarters'
  | 'elimination';

export type ChallengeScore = Record<FactionId, number>;

export interface ChallengeSessionSnapshot {
  remainingSeconds: number;
  scores: ChallengeScore;
  linkPercent: number;
  possessionSeconds: number;
  active: boolean;
  finished: boolean;
  winner: FactionId | null;
  finishReason: ChallengeFinishReason | null;
  captures: number;
  kills: number;
  deceptions: number;
}

interface SessionOptions {
  duration: number;
  possessionDuration: number;
  possessionRecharge: number;
  activeFactions: readonly FactionId[];
}

export class ChallengeSession {
  private remainingSeconds: number;
  private readonly scores: ChallengeScore = {
    azure: 0,
    crimson: 0,
    amber: 0,
  };
  private linkPercent = 100;
  private possessionSeconds = 0;
  private scoreTick = 1;
  private active = false;
  private finished = false;
  private winner: FactionId | null = null;
  private finishReason: ChallengeFinishReason | null = null;
  private captures = 0;
  private kills = 0;
  private deceptions = 0;

  constructor(private readonly options: SessionOptions) {
    this.remainingSeconds = options.duration;
  }

  start(): void {
    this.active = true;
  }

  update(
    delta: number,
    outpostCounts: ChallengeScore,
  ): ChallengeSessionSnapshot {
    if (!this.active || this.finished) {
      return this.snapshot();
    }

    this.remainingSeconds = Math.max(0, this.remainingSeconds - delta);
    if (this.possessionSeconds > 0) {
      this.possessionSeconds = Math.max(0, this.possessionSeconds - delta);
    } else {
      this.linkPercent = Math.min(
        100,
        this.linkPercent + delta * (100 / this.options.possessionRecharge),
      );
    }

    this.scoreTick -= delta;
    if (this.scoreTick <= 0) {
      this.scoreTick += 1;
      for (const faction of this.options.activeFactions) {
        this.scores[faction] += outpostCounts[faction] * 2;
      }
    }

    if (this.remainingSeconds <= 0) {
      this.finish(this.findLeader(), 'timeout');
    }
    return this.snapshot();
  }

  canPossess(): boolean {
    return this.active && !this.finished && this.linkPercent >= 100;
  }

  beginPossession(): boolean {
    if (!this.canPossess()) {
      return false;
    }
    this.linkPercent = 0;
    this.possessionSeconds = this.options.possessionDuration;
    return true;
  }

  endPossession(): void {
    this.possessionSeconds = 0;
  }

  recordCapture(faction: FactionId): void {
    if (this.finished || !this.options.activeFactions.includes(faction)) {
      return;
    }
    this.scores[faction] += 80;
    if (faction === 'azure') {
      this.captures += 1;
    }
  }

  recordKill(attacker: FactionId): void {
    if (this.finished || !this.options.activeFactions.includes(attacker)) {
      return;
    }
    this.scores[attacker] += 20;
    if (attacker === 'azure') {
      this.kills += 1;
    }
  }

  recordDeception(): void {
    if (this.finished) {
      return;
    }
    this.scores.azure += 120;
    this.deceptions += 1;
  }

  finish(
    winner: FactionId | null,
    reason: ChallengeFinishReason,
  ): ChallengeSessionSnapshot {
    if (!this.finished) {
      this.finished = true;
      this.active = false;
      this.winner = winner;
      this.finishReason = reason;
      this.possessionSeconds = 0;
    }
    return this.snapshot();
  }

  snapshot(): ChallengeSessionSnapshot {
    return {
      remainingSeconds: this.remainingSeconds,
      scores: { ...this.scores },
      linkPercent: this.linkPercent,
      possessionSeconds: this.possessionSeconds,
      active: this.active,
      finished: this.finished,
      winner: this.winner,
      finishReason: this.finishReason,
      captures: this.captures,
      kills: this.kills,
      deceptions: this.deceptions,
    };
  }

  private findLeader(): FactionId | null {
    const ranked = this.options.activeFactions
      .map((faction) => ({ faction, score: this.scores[faction] }))
      .sort((left, right) => right.score - left.score);
    if (ranked.length === 0 || ranked[0].score === ranked[1]?.score) {
      return null;
    }
    return ranked[0].faction;
  }
}
