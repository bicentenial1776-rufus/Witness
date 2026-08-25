import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LineageScope } from '@witness/core/family';

// Who counts as "yours" for featuring (digest, notifications) and
// family-scoped filters: the direct line only, blood relatives including
// collaterals, or those plus everyone married in. Relationship *labels*
// ignore this — a cousin in a result list still gets explained, they just
// aren't celebrated.
const KEY = 'witness.lineage-scope';

export async function getLineageScope(): Promise<LineageScope> {
  const stored = await AsyncStorage.getItem(KEY);
  // 'all' is what "every blood relative" was called before the distant
  // tier existed; a setting chosen then keeps exactly the reach it had.
  if (stored === 'all' || stored === 'blood') return 'blood';
  if (stored === 'distant') return 'distant';
  return 'direct';
}

export async function setLineageScope(scope: LineageScope): Promise<void> {
  await AsyncStorage.setItem(KEY, scope);
}
