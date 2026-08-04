import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LineageScope } from '@witness/core/family';

// Who counts as "yours" for featuring (digest, notifications) and
// family-scoped filters: the direct line only, or every blood relative
// including collaterals. Relationship *labels* ignore this — a cousin in
// a result list still gets explained, they just aren't celebrated.
const KEY = 'witness.lineage-scope';

export async function getLineageScope(): Promise<LineageScope> {
  return (await AsyncStorage.getItem(KEY)) === 'all' ? 'all' : 'direct';
}

export async function setLineageScope(scope: LineageScope): Promise<void> {
  await AsyncStorage.setItem(KEY, scope);
}
