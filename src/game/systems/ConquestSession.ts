import type { FactionId } from '../types';

export type ConquestFinishReason =
  | 'timeout'
  | 'domination'
  | 'headquarters'
  | 'elimination';

export interface ConquestSessionSnapshot {
  remainingSeconds: number;
  commandPoints: Record<FactionId, number>;
  active: boolean;
  finished: boolean;
  winner: FactionId | null;
  finishReason: ConquestFinishReason | null;
  dominationSeconds: number;
  dominationTarget: number;
  captures: number;
  kills: number;
  buildings: number;
  abilities: number;
}

interface ConquestSessionOptions {
  duration: number;
  activeFactions: readonly FactionId[];
  outpostTotal: number;
  dominationDuration: number;
}

export class ConquestSession {
  private remainingSeconds: number;
  private readonly commandPoints: Record<FactionId, number> = {
    azure: 0,
    crimson: 0,
    amber: 0,
  };
  private active = false;
  private finished = false;
  private winner: FactionId | null = null;
  private finishReason: ConquestFinishReason | null = null;
  private scoreTick = 1;
  private dominationFaction: FactionId | null = null;
  private dominationSeconds = 0;
  private captures = 0;
  private kills = 0;
  private buildings = 0;
  private abilities = 0;

  constructor(private readonly options: ConquestSessionOptions) {
    this.remainingSeconds = options.duration;
  }

  start(): void {
    this.active = true;
  }

  update(
    delta: number,
    outpostCounts: Record<FactionId, number>,
  ): ConquestSessionSnapshot {
    if (!this.active || this.finished) {
      return this.snapshot();
    }
    this.remainingSeconds = Math.max(0, this.remainingSeconds - delta);
    this.scoreTick -= delta;
    if (this.scoreTick <= 0) {
      this.scoreTick += 1;
      for (const faction of this.options.activeFactions) {
        this.commandPoints[faction] += outpostCounts[faction];
      }
    }

    const dominant = this.options.activeFactions.find(
      (faction) => outpostCounts[faction] === this.options.outpostTotal,
    ) ?? null;
    if (dominant) {
      if (this.dominationFaction !== dominant) {
        this.dominationFaction = dominant;
        this.dominationSeconds = 0;
      }
      this.dominationSeconds += delta;
      if (this.dominationSeconds >= this.options.dominationDuration) {
        this.finish(dominant, 'domination');
      }
    } else {
      this.dominationFaction = null;
      this.dominationSeconds = 0;
    }

    if (this.remainingSeconds <= 0) {
      this.finish(this.findLeader(), 'timeout');
    }
    return this.snapshot();
  }

  recordCapture(faction: FactionId): void {
    this.commandPoints[faction] += 12;
    if (faction === 'azure') {
      this.captures += 1;
    }
  }

  recordKill(faction: FactionId, value: number): void {
    this.commandPoints[faction] += Math.max(1, value);
    if (faction === 'azure') {
      this.kills += 1;
    }
  }

  recordBuilding(faction: FactionId): void {
    if (faction === 'azure') {
      this.buildings += 1;
    }
  }

  recordAbility(faction: FactionId): void {
    if (faction === 'azure') {
      this.abilities += 1;
    }
  }

  finish(
    winner: FactionId | null,
    reason: ConquestFinishReason,
  ): ConquestSessionSnapshot {
    if (!this.finished) {
      this.finished = true;
      this.active = false;
      this.winner = winner;
      this.finishReason = reason;
    }
    return this.snapshot();
  }

  snapshot(): ConquestSessionSnapshot {
    return {
      remainingSeconds: this.remainingSeconds,
      commandPoints: { ...this.commandPoints },
      active: this.active,
      finished: this.finished,
      winner: this.winner,
      finishReason: this.finishReason,
      dominationSeconds: this.dominationSeconds,
      dominationTarget: this.options.dominationDuration,
      captures: this.captures,
      kills: this.kills,
      buildings: this.buildings,
      abilities: this.abilities,
    };
  }

  private findLeader(): FactionId | null {
    const ranked = this.options.activeFactions
      .map((faction) => ({
        faction,
        score: this.commandPoints[faction],
      }))
      .sort((left, right) => right.score - left.score);
    if (ranked.length === 0 || ranked[0].score === ranked[1]?.score) {
      return null;
    }
    return ranked[0].faction;
  }
}
