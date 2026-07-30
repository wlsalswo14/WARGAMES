import type {
  DeployKind,
  ProductionKind,
  UnitKind,
} from '../types';

export interface ProductionDefinition {
  kind: ProductionKind;
  label: string;
  unitKinds: readonly UnitKind[];
  capacityBonus: number;
  incomeBonus: number;
}

export const PRODUCTION_CATALOG: Record<ProductionKind, ProductionDefinition> = {
  factory: {
    kind: 'factory',
    label: '전방 군수기지',
    unitKinds: ['infantry', 'tank', 'drone'],
    capacityBonus: 2,
    incomeBonus: 3,
  },
  barracks: {
    kind: 'barracks',
    label: '보병 막사',
    unitKinds: ['infantry', 'general'],
    capacityBonus: 4,
    incomeBonus: 2,
  },
  armorFactory: {
    kind: 'armorFactory',
    label: '기갑 공장',
    unitKinds: ['tank'],
    capacityBonus: 3,
    incomeBonus: 1,
  },
  airfield: {
    kind: 'airfield',
    label: '전술 비행장',
    unitKinds: ['drone', 'helicopter', 'fighter'],
    capacityBonus: 4,
    incomeBonus: 1,
  },
};

export function canProduceUnit(
  productionKind: ProductionKind,
  unitKind: UnitKind,
): boolean {
  return PRODUCTION_CATALOG[productionKind].unitKinds.includes(unitKind);
}

export function requiredProductionKind(unitKind: UnitKind): ProductionKind {
  if (unitKind === 'infantry' || unitKind === 'general') {
    return 'barracks';
  }
  if (unitKind === 'tank') {
    return 'armorFactory';
  }
  return 'airfield';
}

export function chooseProductionExpansion(
  existing: readonly ProductionKind[],
): Exclude<ProductionKind, 'factory'> {
  if (!existing.includes('barracks')) {
    return 'barracks';
  }
  if (!existing.includes('armorFactory')) {
    return 'armorFactory';
  }
  if (!existing.includes('airfield')) {
    return 'airfield';
  }
  const counts = {
    barracks: existing.filter((kind) => kind === 'barracks').length,
    armorFactory: existing.filter((kind) => kind === 'armorFactory').length,
    airfield: existing.filter((kind) => kind === 'airfield').length,
  };
  return (Object.entries(counts) as Array<
    [Exclude<ProductionKind, 'factory'>, number]
  >).sort((left, right) => left[1] - right[1])[0][0];
}

export function isProductionKind(
  kind: DeployKind,
): kind is ProductionKind {
  return kind === 'factory'
    || kind === 'barracks'
    || kind === 'armorFactory'
    || kind === 'airfield';
}

export function isUnitKind(kind: DeployKind): kind is UnitKind {
  return kind === 'infantry'
    || kind === 'general'
    || kind === 'tank'
    || kind === 'fighter'
    || kind === 'helicopter'
    || kind === 'drone';
}
