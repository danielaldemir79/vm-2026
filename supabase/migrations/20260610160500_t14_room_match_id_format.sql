-- T14 (#14, KA-SA2): härda room_match_results.match_id mot godtycklig text.
--
-- BAKGRUND: match_id är fri `text not null` utan format-koll. En klient (anon-roll,
-- enda skyddet är RLS) kan därför skriva en match_id på upp till tiotusentals tecken
-- (eller annat skräp) i ett rum man är medlem i. Det är ingen privilege-läcka (RLS
-- gränsar fortfarande till rummet), men det är en obegränsad, ovaliderad textkolumn:
-- en enda skräprad behöver inte bryta klienten (apply-room-results hoppar okända id),
-- men kolumnen ska INTE acceptera värden som omöjligt kan vara ett VM-matchnummer.
--
-- KÄLLHÄNVISAD FORMAT-REGEL (gissa aldrig, verifiera mot källan):
-- match_id refererar den STATISKA matchplanen i klient-bundlen (ingen FK finns,
-- matcherna är inte i DB). De FAKTISKA id:na i planen (src/data/wc2026, verifierat
-- mot getDataSource().getMatches(), 104 matcher) är TVÅ format, INTE bara "M<n>":
--   * 72 GRUPPMATCHER:   'g-<GRUPP>-<n>' där grupp = A..L och n = 1..6
--                        (match-schedule-parser.ts / wc2026-id-konventionen).
--   * 32 SLUTSPELSMATCHER:'M<nn>' där nn = 73..104 (FIFA:s matchnummer, samma id som
--                        bracket-structure.ts; match-schedule-parser.ts rad ~475
--                        `id: M${matchNumber}`). Gruppspelet är M1..M72 i FIFA:s
--                        numrering men bär i DENNA kodbas g-...-id, så M-prefixet
--                        börjar först vid 73 (sextondelarna).
--
-- VARFÖR detta avviker från task-direktivets `^M[0-9]{1,3}$`: det mönstret antar
-- att ALLA match-id är "M1..M104". Det stämmer INTE för denna kodbas, gruppmatcherna
-- är 'g-A-1'..'g-L-6'. `^M[0-9]{1,3}$` hade NEKAT alla 72 gruppresultat och brutit
-- delnings-funktionen. Constrainten nedan är därför härledd ur de faktiska id:na och
-- matchar exakt de 104 giltiga (verifierat: 0 av 104 omatchade), inte en gissad form.
-- Se docs/decisions.md (T14, KA-SA2) för spårbarheten.

alter table public.room_match_results
  add constraint rmr_match_id_format
  check (match_id ~ '^(g-[A-L]-[1-6]|M(7[3-9]|8[0-9]|9[0-9]|10[0-4]))$');
