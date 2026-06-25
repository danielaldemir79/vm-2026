// Test för use-group-prediction-results: den TUNNA glue-hooken. Den tyngre logiken
// (derive) är testad separat; här bevisar vi bara den SÄKRA default-vägen: utan
// live-config / RoomsProvider ger den tom map (ingen overlay) och kraschar inte.

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GroupTable } from '../../domain/types';
import { useGroupPredictionResults } from './use-group-prediction-results';

// Tom env -> isSupabaseConfigured falskt -> live av -> ingen hämtning.
const TEST_ENV = {} as ImportMetaEnv;

describe('useGroupPredictionResults', () => {
  it('utan live-config eller rum: tom map (ingen overlay), kraschar ej utan RoomsProvider', () => {
    const tables: GroupTable[] = [{ groupId: 'A', standings: [] }];
    const { result } = renderHook(() => useGroupPredictionResults(tables, TEST_ENV));
    expect(result.current.size).toBe(0);
  });
});
