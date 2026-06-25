// React-hook som matar gruppspelsvyn med användarens grupp-tips-RESULTAT per avgjord
// grupp (poäng + per-position-bockar). TUNN I/O-glue: läser det aktiva rummet ur
// rooms-synk-seamen (tolerant, samma seam som tips-providers), hämtar mina grupp-tips
// för rummet och HÄRLEDER resultatet (deriveGroupPredictionResults, ren + testad).
//
// OVERLAY ÄR ADDITIV: en saknad config/rum eller en hämtnings-miss ger tom map, så
// gruppspelsvyn renderar den vanliga tabellen utan overlay (aldrig en blank vy för en
// nice-to-have). Re-hämtar vid rumsbyte + tips-invaliderings-nonce (samma seam som
// GroupPredictionsProvider), så en kopiering/ändring slår igenom utan rum-byte.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GroupId, GroupTable } from '../../domain/types';
import { listMyGroupPredictions, type GroupPrediction } from '../../data/predictions';
import { getSupabaseClient, type VmSupabaseClient } from '../../data/supabase-browser';
import { isSupabaseConfigured, LIVE_READY } from '../../data';
import { useRoomsSync } from '../rooms';
import {
  deriveGroupPredictionResults,
  type GroupResultEntry,
} from './derive-group-prediction-results';

/** Stabil tom referens, så ready-vägen utan tips inte skapar en ny Map per render. */
const EMPTY_RESULTS: Map<GroupId, GroupResultEntry> = new Map();

/**
 * Härled grupp-tips-resultatet per avgjord grupp för det aktiva rummet.
 *
 * @param tables  de härledda grupptabellerna (ur useGroupData).
 * @param env     injicerbar env (testbarhet), default = import.meta.env.
 * @returns       Map groupId -> resultat (poäng + bockar), bara avgjorda grupper man tippat.
 */
export function useGroupPredictionResults(
  tables: readonly GroupTable[],
  env: ImportMetaEnv = import.meta.env
): Map<GroupId, GroupResultEntry> {
  const roomsSync = useRoomsSync();
  const { activeRoomId, tipsRefreshNonce } = roomsSync;

  const liveConfigured = isSupabaseConfigured(env) && LIVE_READY;
  const supabase = useMemo<VmSupabaseClient | null>(
    () => (liveConfigured ? getSupabaseClient(env) : null),
    [liveConfigured, env]
  );

  const [myPredictions, setMyPredictions] = useState<ReadonlyMap<string, GroupPrediction>>(
    new Map()
  );

  // FETCH-VAKT (samma mönster som tips-providers): ett föråldrat svar från ett
  // tidigare rum får aldrig skriva över ett nyare (snabbt rumsbyte).
  const loadTokenRef = useRef(0);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    if (!supabase || activeRoomId === null) {
      setMyPredictions(new Map());
      return;
    }
    listMyGroupPredictions(supabase, activeRoomId)
      .then((preds) => {
        if (token !== loadTokenRef.current) {
          return; // föråldrat svar, ett nyare rumsbyte hann starta
        }
        setMyPredictions(new Map(preds.map((p) => [p.groupId, p])));
      })
      .catch((err: unknown) => {
        if (token !== loadTokenRef.current) {
          return;
        }
        // Overlay är additiv: en miss ska aldrig blanka gruppspelsvyn. Logga och
        // visa ingen overlay (den vanliga tabellen står kvar).
        console.warn(
          '[VM2026] Kunde inte ladda grupp-tips för grupp-resultat-overlay, visar tabellen utan:',
          err
        );
        setMyPredictions(new Map());
      });
  }, [supabase, activeRoomId, tipsRefreshNonce]);

  return useMemo(
    () =>
      myPredictions.size === 0
        ? EMPTY_RESULTS
        : deriveGroupPredictionResults(tables, myPredictions),
    [tables, myPredictions]
  );
}
