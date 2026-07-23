import { FACTIONS, WORLD } from '../config';
import { factionPairKey, seededRandom } from '../math';
import type { DiplomacyEvent, FactionId, Relation } from '../types';

export class DiplomacySystem {
  private readonly relations = new Map<string, Relation>();
  private timer = WORLD.diplomacyInterval * 0.7;
  private cycle = 0;

  constructor() {
    this.set('azure', 'crimson', 'hostile');
    this.set('azure', 'amber', 'neutral');
    this.set('crimson', 'amber', 'hostile');
  }

  get(a: FactionId, b: FactionId): Relation {
    if (a === b) {
      return 'allied';
    }
    return this.relations.get(factionPairKey(a, b)) ?? 'neutral';
  }

  set(a: FactionId, b: FactionId, relation: Relation): void {
    if (a === b) {
      return;
    }
    this.relations.set(factionPairKey(a, b), relation);
  }

  isHostile(a: FactionId, b: FactionId): boolean {
    return this.get(a, b) === 'hostile';
  }

  forFaction(faction: FactionId): Map<FactionId, Relation> {
    const result = new Map<FactionId, Relation>();
    for (const other of Object.keys(FACTIONS) as FactionId[]) {
      if (other !== faction) {
        result.set(other, this.get(faction, other));
      }
    }
    return result;
  }

  intervene(from: FactionId, to: FactionId): DiplomacyEvent {
    const current = this.get(from, to);
    const relation: Relation = current === 'hostile' ? 'neutral' : current === 'neutral' ? 'allied' : 'hostile';
    this.set(from, to, relation);
    return {
      from,
      to,
      relation,
      reason: '플레이어의 신 모드 외교 개입',
    };
  }

  update(delta: number, strength: Map<FactionId, number>): DiplomacyEvent | null {
    this.timer -= delta;
    if (this.timer > 0) {
      return null;
    }
    this.timer = WORLD.diplomacyInterval;
    this.cycle += 1;

    const ranked = [...strength.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length < 3) {
      return null;
    }
    const [strongest, middle, weakest] = ranked;
    const imbalance = strongest[1] / Math.max(1, weakest[1]);
    if (imbalance > 1.55 && this.get(middle[0], weakest[0]) !== 'allied') {
      this.set(middle[0], weakest[0], 'allied');
      this.set(strongest[0], weakest[0], 'hostile');
      return {
        from: weakest[0],
        to: middle[0],
        relation: 'allied',
        reason: `${FACTIONS[strongest[0]].name}의 전력 우세를 견제`,
      };
    }

    const pairs: Array<[FactionId, FactionId]> = [
      ['azure', 'crimson'],
      ['azure', 'amber'],
      ['crimson', 'amber'],
    ];
    const pair = pairs[Math.floor(seededRandom(this.cycle * 917) * pairs.length)];
    const current = this.get(pair[0], pair[1]);
    const roll = seededRandom(this.cycle * 151 + Math.round(strongest[1]));
    let relation: Relation = current;
    let reason = '국경 분쟁과 전력 균형 재평가';
    if (current === 'allied' && roll > 0.46) {
      relation = 'neutral';
      reason = '공동의 위협이 감소해 동맹을 해소';
    } else if (current === 'neutral' && roll > 0.58) {
      relation = 'hostile';
      reason = '거점 소유권을 둘러싼 충돌 발생';
    } else if (current === 'hostile' && roll > 0.7) {
      relation = 'neutral';
      reason = '소모전 중단을 위한 임시 휴전';
    }
    if (relation === current) {
      return null;
    }
    this.set(pair[0], pair[1], relation);
    return { from: pair[0], to: pair[1], relation, reason };
  }
}
