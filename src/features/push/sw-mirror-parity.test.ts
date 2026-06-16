// MIRROR-PARITETSTEST (T85, #177): bevisa att service-worker-filens INLINE parse-regel
// (public/custom-push-sw.js) ger EXAKT samma utdata som src-originalet
// (src/features/push/sw-payload.ts parsePushPayload) för en battericuppsättning indata.
//
// VARFÖR (samma lärdom som livescore v3-mirror-parity): SW-filen kan inte importera från
// src/ (annan körkontext, ingen bundling), så parse-regeln finns DUBBELT , en gång i src
// (typad + testad) och en gång inline i SW:n (ren JS, körs aldrig i CI). En synk-kommentar
// är en MÄNSKLIG påminnelse, ingen grind: en en-sidig redigering skulle driva isär utan att
// något rödnar förrän en riktig push kommer in på en enhet (notisen tappas eller får fel
// text). DETTA test är grinden: vi EXTRAHERAR SW:ns parsePushPayload + dess default-konstant
// ur filtexten (läst via Vites ?raw-import, ingen node:fs), kör den som en funktion, och
// jämför mot src för samma indata. En divergens failar i CI i stället för i prod.

import { describe, expect, it } from 'vitest';
// ?raw: Vite läser filen som en sträng-literal vid transform (ingen node:fs, funkar i jsdom).
import swSource from '../../../public/custom-push-sw.js?raw';
import { parsePushPayload as srcParse } from './sw-payload';

/**
 * Extrahera SW:ns parse-regel ur filtexten och bygg en körbar funktion. Vi plockar ut
 * DEFAULT_PUSH_NOTIFICATION-objektet + parsePushPayload-funktionen via stabila ankare och
 * evaluerar BARA de bitarna , aldrig filens self.addEventListener-rader (de kräver en
 * service-worker-miljö).
 */
function loadSwParse(): (raw: string | null | undefined) => unknown {
  const startMarker = 'const DEFAULT_PUSH_NOTIFICATION';
  const endMarker = "self.addEventListener('push'";
  const start = swSource.indexOf(startMarker);
  const end = swSource.indexOf(endMarker);
  if (start === -1 || end === -1) {
    throw new Error(
      'sw-mirror-parity: kunde inte hitta parse-blocket i custom-push-sw.js , ' +
        'ankaren (DEFAULT_PUSH_NOTIFICATION / push-lyssnaren) har ändrats.'
    );
  }
  const block = swSource.slice(start, end);
  // Bygg en funktion som definierar blockets symboler och returnerar parsePushPayload.
  // (new Function är medvetet , vi kör BARA det extraherade parse-blocket, aldrig filens
  // self.addEventListener-rader, och bara över känd, committad filtext i ett test.)
  const factory = new Function(`${block}; return parsePushPayload;`);
  return factory() as (raw: string | null | undefined) => unknown;
}

const swParse = loadSwParse();

describe('SW parse-regel speglar src parsePushPayload (mirror-paritet)', () => {
  // Battericuppsättning indata som täcker ALLA grenar (samma som sw-payload.test +
  // skarvfall), så en en-sidig drift mellan src och SW garanterat träffar minst ett fall.
  const cases: Array<string | null | undefined> = [
    JSON.stringify({ title: 'Mål!', body: 'Sverige 1-0', url: '/match/M73' }),
    JSON.stringify({ title: 'Bara titel' }),
    JSON.stringify({ title: 123, body: 'ok', url: '/x' }),
    '[1,2,3]',
    '42',
    'null',
    'inte json {{{',
    '',
    null,
    undefined,
  ];

  it.each(cases.map((c, i) => [i, c] as const))(
    'fall %i ger identiskt resultat i src och SW',
    (_i, raw) => {
      expect(swParse(raw)).toEqual(srcParse(raw));
    }
  );

  it('NEGATIV KONTROLL: en muterad SW-regel skulle faila (testet vaktar på riktigt)', () => {
    // Bevisa att paritets-assertionen ovan kan RÖDNA: kör src mot ett medvetet FEL
    // SW-resultat (som om SW:n droppat fält-fyllningen). Detta är negativ-kontrollen
    // (befordrad regel): ett paritets-test som aldrig kan faila vaktar ingenting.
    const brokenSw = (raw: string | null | undefined) => {
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    };
    // För en delvis payload skiljer sig de åt (src fyller saknade fält, broken gör inte).
    const partial = JSON.stringify({ title: 'Bara titel' });
    expect(brokenSw(partial)).not.toEqual(srcParse(partial));
  });
});
