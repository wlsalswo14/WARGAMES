import type { ConquestSessionSnapshot } from './ConquestSession';

const STORAGE_KEY = 'brick-warfare-command-profile-v1';
const RANKS = [
  { name: '소위', xp: 0 },
  { name: '중위', xp: 250 },
  { name: '대위', xp: 650 },
  { name: '소령', xp: 1200 },
  { name: '중령', xp: 2000 },
  { name: '대령', xp: 3100 },
] as const;

interface StoredProfile {
  xp: number;
  victories: number;
  matches: number;
}

export interface ProgressionReward {
  earnedXp: number;
  rankName: string;
  rankUp: boolean;
  totalXp: number;
  victories: number;
  matches: number;
}

export class PlayerProgression {
  private profile: StoredProfile = this.load();

  get rankName(): string {
    return this.rankFor(this.profile.xp).name;
  }

  get startingSupplyBonus(): number {
    return Math.min(100, this.rankIndex * 20);
  }

  get summary(): string {
    return `${this.rankName} · ${this.profile.xp} XP · ${this.profile.victories}승`;
  }

  completeConquest(snapshot: ConquestSessionSnapshot): ProgressionReward {
    const previousRank = this.rankName;
    const won = snapshot.winner === 'azure';
    const earnedXp = Math.round(
      70
      + snapshot.captures * 22
      + snapshot.kills * 5
      + snapshot.buildings * 16
      + snapshot.abilities * 8
      + (won ? 130 : 25),
    );
    this.profile.xp += earnedXp;
    this.profile.matches += 1;
    if (won) {
      this.profile.victories += 1;
    }
    this.save();
    return {
      earnedXp,
      rankName: this.rankName,
      rankUp: previousRank !== this.rankName,
      totalXp: this.profile.xp,
      victories: this.profile.victories,
      matches: this.profile.matches,
    };
  }

  private get rankIndex(): number {
    const current = this.rankFor(this.profile.xp);
    return RANKS.indexOf(current);
  }

  private rankFor(xp: number): (typeof RANKS)[number] {
    return [...RANKS].reverse().find((rank) => xp >= rank.xp) ?? RANKS[0];
  }

  private load(): StoredProfile {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return { xp: 0, victories: 0, matches: 0 };
      }
      const parsed = JSON.parse(stored) as Partial<StoredProfile>;
      return {
        xp: Math.max(0, Number(parsed.xp) || 0),
        victories: Math.max(0, Number(parsed.victories) || 0),
        matches: Math.max(0, Number(parsed.matches) || 0),
      };
    } catch {
      return { xp: 0, victories: 0, matches: 0 };
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {}
  }
}
