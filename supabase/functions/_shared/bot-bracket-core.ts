// GENERERAD FIL , REDIGERA INTE FÖR HAND (Fas 3, bot-slutspelstips).
//
// Detta är den BUNDLADE, rena härlednings-/seednings-grafen ur
// src/data/bots/bracket-seed-edge-entry.ts (applyRoomResults + deriveBracket +
// selectSeedableSlots + planBotBracketSeeding + den källåkrade statiska planen),
// emitterad av scripts/generate-bot-bracket-core.ts via esbuild så edge-funktionen
// (Deno) kan köra EXAKT samma testade TS-motor som klienten.
//
// SYNK: ändras seednings-/härlednings-koden i src, KÖR `npm run gen:bot-bracket-core`
// och committa om denna fil. Paritet vaktas i bot-bracket-mirror-parity.test.ts
// (bundlar om src och jämför diskriminerande in->ut mot denna fil , divergens rödnar i CI).
// @ts-nocheck , Deno-runtime, typas/lintas inte av app-grafen (eslint/tsc kör mot src/).

// src/domain/types.ts
var GROUP_IDS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L"
];

// src/data/wc2026/team-refs.ts
var TEAMS_BY_GROUP = {
  // Grupp A: värdnation Mexiko på A1 (förbestämd).
  A: [
    { name: "Mexiko", code: "MEX" },
    { name: "Sydafrika", code: "RSA" },
    { name: "Sydkorea", code: "KOR" },
    { name: "Tjeckien", code: "CZE" }
  ],
  // Grupp B: värdnation Kanada på B1 (förbestämd).
  B: [
    { name: "Kanada", code: "CAN" },
    // Det fulla, verifierade landsnamnet (lottnings-data, lagprofilen) + ett kort
    // visningsnamn för trånga ytor: "Bosnien och Hercegovina" tryckte ihop
    // grupptabellens kolumner (T50, Daniels live-feedback). "Bosnien" är den
    // vedertagna svenska kortformen för landet. Enda laget i VM 2026:s 48 vars
    // namn är så långt att en kortform behövs; övriga ryms i de trånga ytorna.
    { name: "Bosnien och Hercegovina", code: "BIH", shortName: "Bosnien" },
    { name: "Qatar", code: "QAT" },
    { name: "Schweiz", code: "SUI" }
  ],
  C: [
    { name: "Brasilien", code: "BRA" },
    { name: "Marocko", code: "MAR" },
    { name: "Haiti", code: "HAI" },
    { name: "Skottland", code: "SCO" }
  ],
  // Grupp D: värdnation USA på D1 (förbestämd).
  D: [
    { name: "USA", code: "USA" },
    { name: "Paraguay", code: "PAR" },
    { name: "Australien", code: "AUS" },
    { name: "Turkiet", code: "TUR" }
  ],
  E: [
    { name: "Tyskland", code: "GER" },
    { name: "Cura\xE7ao", code: "CUW" },
    { name: "Elfenbenskusten", code: "CIV" },
    { name: "Ecuador", code: "ECU" }
  ],
  // Grupp F: Sverige (vann playoff mars 2026, SPEC §10:s öppna fråga avgjord).
  F: [
    { name: "Nederl\xE4nderna", code: "NED" },
    { name: "Japan", code: "JPN" },
    { name: "Sverige", code: "SWE" },
    { name: "Tunisien", code: "TUN" }
  ],
  G: [
    { name: "Belgien", code: "BEL" },
    { name: "Egypten", code: "EGY" },
    { name: "Iran", code: "IRN" },
    { name: "Nya Zeeland", code: "NZL" }
  ],
  H: [
    { name: "Spanien", code: "ESP" },
    { name: "Kap Verde", code: "CPV" },
    { name: "Saudiarabien", code: "KSA" },
    { name: "Uruguay", code: "URU" }
  ],
  I: [
    { name: "Frankrike", code: "FRA" },
    { name: "Senegal", code: "SEN" },
    { name: "Irak", code: "IRQ" },
    { name: "Norge", code: "NOR" }
  ],
  J: [
    { name: "Argentina", code: "ARG" },
    { name: "Algeriet", code: "ALG" },
    { name: "\xD6sterrike", code: "AUT" },
    { name: "Jordanien", code: "JOR" }
  ],
  K: [
    { name: "Portugal", code: "POR" },
    { name: "DR Kongo", code: "COD" },
    { name: "Uzbekistan", code: "UZB" },
    { name: "Colombia", code: "COL" }
  ],
  L: [
    { name: "England", code: "ENG" },
    { name: "Kroatien", code: "CRO" },
    { name: "Ghana", code: "GHA" },
    { name: "Panama", code: "PAN" }
  ]
};
function teamId(code) {
  return code.toLowerCase();
}
var WC2026_TEAM_BASES = GROUP_IDS.flatMap(
  (group) => TEAMS_BY_GROUP[group].map((t) => {
    const base = { id: teamId(t.code), name: t.name, code: t.code, group };
    if (t.shortName !== void 0) {
      base.shortName = t.shortName;
    }
    return base;
  })
);
var WC2026_TEAM_REFS = WC2026_TEAM_BASES.map(
  (t) => ({ id: t.id, code: t.code, group: t.group })
);
var WC2026_GROUPS = GROUP_IDS.map(
  (group) => ({
    id: group,
    teamIds: TEAMS_BY_GROUP[group].map((t) => teamId(t.code))
  })
);

// src/data/wc2026/team-profiles.ts
var WC2026_TEAM_PROFILES = {
  mex: {
    fifaRanking: 14,
    starPlayers: ["Ra\xFAl Jim\xE9nez", "Santiago Gim\xE9nez"],
    trivia: "17 tidigare VM-slutspel. B\xE4st: kvartsfinal (senast 1986, p\xE5 hemmaplan). V\xE4rdnation 2026."
  },
  rsa: {
    fifaRanking: 60,
    starPlayers: ["Evidence Makgopa", "Lyle Foster"],
    trivia: "3 tidigare VM-slutspel. B\xE4st: gruppspel (v\xE4rdnation 2010)."
  },
  kor: {
    fifaRanking: 25,
    starPlayers: ["Son Heung-min", "Lee Jae-sung"],
    trivia: "11 tidigare VM-slutspel. B\xE4st: fj\xE4rdeplats (2002, p\xE5 hemmaplan)."
  },
  cze: {
    fifaRanking: 40,
    starPlayers: ["Patrik Schick", "Tom\xE1\u0161 Sou\u010Dek"],
    trivia: "9 tidigare VM-slutspel (inkl. Tjeckoslovakien). B\xE4st: VM-final (silver 1934 och 1962)."
  },
  can: {
    fifaRanking: 30,
    starPlayers: ["Alphonso Davies", "Jonathan David"],
    trivia: "2 tidigare VM-slutspel. B\xE4st: gruppspel. V\xE4rdnation 2026."
  },
  bih: {
    fifaRanking: 64,
    starPlayers: ["Edin D\u017Eeko"],
    trivia: "1 tidigare VM-slutspel (2014). B\xE4st: gruppspel."
  },
  qat: {
    fifaRanking: 56,
    starPlayers: ["Akram Afif", "Almoez Ali"],
    trivia: "1 tidigare VM-slutspel (v\xE4rdnation 2022). B\xE4st: gruppspel."
  },
  sui: {
    fifaRanking: 19,
    starPlayers: ["Granit Xhaka", "Breel Embolo"],
    trivia: "12 tidigare VM-slutspel. B\xE4st: kvartsfinal (1934, 1938, 1954)."
  },
  bra: {
    fifaRanking: 6,
    starPlayers: ["Neymar", "Vin\xEDcius J\xFAnior"],
    trivia: "Enda landet med i alla 22 VM-slutspel. B\xE4st: 5 VM-titlar (1958, 1962, 1970, 1994, 2002), flest av alla."
  },
  mar: {
    fifaRanking: 7,
    starPlayers: ["Achraf Hakimi", "Sofyan Amrabat"],
    trivia: "6 tidigare VM-slutspel. B\xE4st: fj\xE4rdeplats (2022), f\xF6rsta afrikanska/arabiska semifinallag."
  },
  hai: {
    fifaRanking: 83,
    starPlayers: ["Wilson Isidor", "Jean-Ricner Bellegarde"],
    trivia: "1 tidigare VM-slutspel (1974). B\xE4st: gruppspel."
  },
  sco: {
    fifaRanking: 42,
    starPlayers: ["Andy Robertson", "Scott McTominay"],
    trivia: "8 tidigare VM-slutspel. B\xE4st: gruppspel (aldrig avancerat)."
  },
  usa: {
    fifaRanking: 17,
    starPlayers: ["Christian Pulisic"],
    trivia: "11 tidigare VM-slutspel. B\xE4st: tredjeplats (1930). V\xE4rdnation 2026."
  },
  par: {
    fifaRanking: 41,
    starPlayers: ["Miguel Almir\xF3n"],
    trivia: "8 tidigare VM-slutspel. B\xE4st: kvartsfinal (2010)."
  },
  aus: {
    fifaRanking: 27,
    starPlayers: ["Jackson Irvine", "Mathew Leckie"],
    trivia: "6 tidigare VM-slutspel. B\xE4st: \xE5ttondelsfinal (2006, 2022)."
  },
  tur: {
    fifaRanking: 22,
    starPlayers: ["Hakan \xC7alhano\u011Flu"],
    trivia: "2 tidigare VM-slutspel. B\xE4st: tredjeplats (2002)."
  },
  ger: {
    fifaRanking: 10,
    starPlayers: ["Florian Wirtz", "Jamal Musiala"],
    trivia: "20 tidigare VM-slutspel. B\xE4st: 4 VM-titlar (1954, 1974, 1990, 2014)."
  },
  cuw: {
    fifaRanking: 82,
    starPlayers: ["Tahith Chong"],
    trivia: "VM-debut 2026, minsta nation (i inv\xE5narantal) n\xE5gonsin i ett VM-slutspel."
  },
  civ: {
    fifaRanking: 33,
    starPlayers: ["Franck Kessi\xE9", "Nicolas P\xE9p\xE9"],
    trivia: "3 tidigare VM-slutspel. B\xE4st: gruppspel."
  },
  ecu: {
    fifaRanking: 23,
    starPlayers: ["Mois\xE9s Caicedo"],
    trivia: "4 tidigare VM-slutspel. B\xE4st: \xE5ttondelsfinal (2006)."
  },
  ned: {
    fifaRanking: 8,
    starPlayers: ["Virgil van Dijk", "Frenkie de Jong"],
    trivia: "11 tidigare VM-slutspel. B\xE4st: VM-final tre g\xE5nger (silver 1974, 1978, 2010)."
  },
  jpn: {
    fifaRanking: 18,
    starPlayers: ["Takefusa Kubo", "Wataru End\u014D"],
    trivia: "7 tidigare VM-slutspel. B\xE4st: \xE5ttondelsfinal (2002, 2010, 2018, 2022)."
  },
  swe: {
    fifaRanking: 38,
    starPlayers: ["Alexander Isak", "Viktor Gy\xF6keres"],
    trivia: "12 tidigare VM-slutspel. B\xE4st: VM-final (silver 1958, p\xE5 hemmaplan)."
  },
  tun: {
    fifaRanking: 45,
    starPlayers: ["Hannibal Mejbri"],
    trivia: "6 tidigare VM-slutspel. B\xE4st: gruppspel."
  },
  bel: {
    fifaRanking: 9,
    starPlayers: ["Kevin De Bruyne", "Romelu Lukaku"],
    trivia: "14 tidigare VM-slutspel. B\xE4st: tredjeplats (2018)."
  },
  egy: {
    fifaRanking: 29,
    starPlayers: ["Mohamed Salah", "Omar Marmoush"],
    trivia: "3 tidigare VM-slutspel. B\xE4st: gruppspel. F\xF6rsta afrikanska VM-laget (1934)."
  },
  irn: {
    fifaRanking: 20,
    starPlayers: ["Alireza Jahanbakhsh"],
    trivia: "6 tidigare VM-slutspel. B\xE4st: gruppspel."
  },
  nzl: {
    fifaRanking: 85,
    starPlayers: ["Chris Wood"],
    trivia: "2 tidigare VM-slutspel. B\xE4st: gruppspel (obesegrade 2010, tre kryss)."
  },
  esp: {
    fifaRanking: 2,
    starPlayers: ["Lamine Yamal", "Rodri"],
    trivia: "16 tidigare VM-slutspel. B\xE4st: VM-guld (2010), f\xF6rsta VM-titeln vunnen av ett europeiskt lag utanf\xF6r Europa."
  },
  cpv: {
    fifaRanking: 67,
    starPlayers: ["Jovane Cabral", "Garry Rodrigues"],
    trivia: "VM-debut 2026. En av de minsta nationerna n\xE5gonsin i ett VM-slutspel."
  },
  ksa: {
    fifaRanking: 61,
    starPlayers: ["Salem Al-Dawsari"],
    trivia: "6 tidigare VM-slutspel. B\xE4st: \xE5ttondelsfinal (1994). Slog Argentina i premi\xE4ren 2022."
  },
  uru: {
    fifaRanking: 16,
    starPlayers: ["Federico Valverde", "Darwin N\xFA\xF1ez"],
    trivia: "14 tidigare VM-slutspel. B\xE4st: 2 VM-titlar (1930 som v\xE4rd, 1950)."
  },
  fra: {
    fifaRanking: 3,
    starPlayers: ["Kylian Mbapp\xE9", "N'Golo Kant\xE9"],
    trivia: "16 tidigare VM-slutspel. B\xE4st: 2 VM-titlar (1998 som v\xE4rd, 2018)."
  },
  sen: {
    fifaRanking: 15,
    starPlayers: ["Sadio Man\xE9", "Idrissa Gana Gueye"],
    trivia: "3 tidigare VM-slutspel. B\xE4st: kvartsfinal (2002, i debuten)."
  },
  irq: {
    fifaRanking: 57,
    starPlayers: ["Zidane Iqbal"],
    trivia: "1 tidigare VM-slutspel (1986). B\xE4st: gruppspel."
  },
  nor: {
    fifaRanking: 31,
    starPlayers: ["Erling Haaland", "Martin \xD8degaard"],
    trivia: "3 tidigare VM-slutspel. B\xE4st: \xE5ttondelsfinal (1998). F\xF6rsta VM sedan 1998."
  },
  arg: {
    fifaRanking: 1,
    starPlayers: ["Lionel Messi", "Enzo Fern\xE1ndez"],
    trivia: "18 tidigare VM-slutspel. B\xE4st: 3 VM-titlar (1978 som v\xE4rd, 1986, 2022). Regerande m\xE4stare och FIFA:s etta inf\xF6r 2026."
  },
  alg: {
    fifaRanking: 28,
    starPlayers: ["Riyad Mahrez"],
    trivia: "4 tidigare VM-slutspel. B\xE4st: \xE5ttondelsfinal (2014)."
  },
  aut: {
    fifaRanking: 24,
    starPlayers: ["David Alaba", "Christoph Baumgartner"],
    trivia: "7 tidigare VM-slutspel. B\xE4st: tredjeplats (1954)."
  },
  jor: {
    fifaRanking: 63,
    starPlayers: ["Mousa Al-Taamari"],
    trivia: "VM-debut 2026."
  },
  por: {
    fifaRanking: 5,
    starPlayers: ["Cristiano Ronaldo", "Bruno Fernandes"],
    trivia: "8 tidigare VM-slutspel. B\xE4st: tredjeplats (1966). Ronaldo blir f\xF6rste spelaren i sex VM."
  },
  cod: {
    fifaRanking: 46,
    starPlayers: ["Aaron Wan-Bissaka"],
    trivia: "1 tidigare VM-slutspel (som Zaire 1974). B\xE4st: gruppspel."
  },
  uzb: {
    fifaRanking: 50,
    starPlayers: ["Eldor Shomurodov"],
    trivia: "VM-debut 2026."
  },
  col: {
    fifaRanking: 13,
    starPlayers: ["James Rodr\xEDguez", "Luis D\xEDaz"],
    trivia: "6 tidigare VM-slutspel. B\xE4st: kvartsfinal (2014)."
  },
  eng: {
    fifaRanking: 4,
    starPlayers: ["Harry Kane", "Jude Bellingham"],
    trivia: "16 tidigare VM-slutspel. B\xE4st: VM-guld (1966, p\xE5 hemmaplan)."
  },
  cro: {
    fifaRanking: 11,
    starPlayers: ["Luka Modri\u0107", "Mateo Kova\u010Di\u0107"],
    trivia: "6 tidigare VM-slutspel. B\xE4st: VM-final (silver 2018) och brons (2022)."
  },
  gha: {
    fifaRanking: 73,
    starPlayers: ["Thomas Partey", "Jordan Ayew"],
    trivia: "4 tidigare VM-slutspel. B\xE4st: kvartsfinal (2010)."
  },
  pan: {
    fifaRanking: 34,
    starPlayers: ["An\xEDbal Godoy"],
    trivia: "1 tidigare VM-slutspel (2018). B\xE4st: gruppspel."
  }
};

// src/data/wc2026/teams.ts
function enrichWithProfile(base) {
  const profile = WC2026_TEAM_PROFILES[base.id];
  if (profile === void 0) {
    throw new Error(
      `Lag ${base.code} (${base.id}) saknar profil i team-profiles.ts (ska aldrig h\xE4nda, 48/48-t\xE4ckning kr\xE4vs).`
    );
  }
  return {
    ...base,
    fifaRanking: profile.fifaRanking,
    starPlayers: profile.starPlayers,
    trivia: profile.trivia
  };
}
var WC2026_TEAMS = WC2026_TEAM_BASES.map(enrichWithProfile);

// src/data/wc2026/matches.ts
var WC2026_MATCHES = [
  {
    id: "g-A-1",
    stage: "group",
    groupId: "A",
    homeTeamId: "mex",
    awayTeamId: "rsa",
    kickoff: "2026-06-11T19:00:00.000Z",
    venue: "Estadio Azteca, Mexico City, Mexiko",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-A-2",
    stage: "group",
    groupId: "A",
    homeTeamId: "kor",
    awayTeamId: "cze",
    kickoff: "2026-06-12T02:00:00.000Z",
    venue: "Estadio Akron, Zapopan, Mexiko",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-B-1",
    stage: "group",
    groupId: "B",
    homeTeamId: "can",
    awayTeamId: "bih",
    kickoff: "2026-06-12T19:00:00.000Z",
    venue: "BMO Field, Toronto, Kanada",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-D-1",
    stage: "group",
    groupId: "D",
    homeTeamId: "usa",
    awayTeamId: "par",
    kickoff: "2026-06-13T01:00:00.000Z",
    venue: "SoFi Stadium, Inglewood, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-B-2",
    stage: "group",
    groupId: "B",
    homeTeamId: "qat",
    awayTeamId: "sui",
    kickoff: "2026-06-13T19:00:00.000Z",
    venue: "Levi's Stadium, Santa Clara, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-C-1",
    stage: "group",
    groupId: "C",
    homeTeamId: "bra",
    awayTeamId: "mar",
    kickoff: "2026-06-13T22:00:00.000Z",
    venue: "MetLife Stadium, East Rutherford, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-C-2",
    stage: "group",
    groupId: "C",
    homeTeamId: "hai",
    awayTeamId: "sco",
    kickoff: "2026-06-14T01:00:00.000Z",
    venue: "Gillette Stadium, Foxborough, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-D-2",
    stage: "group",
    groupId: "D",
    homeTeamId: "aus",
    awayTeamId: "tur",
    kickoff: "2026-06-14T04:00:00.000Z",
    venue: "BC Place, Vancouver, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-E-1",
    stage: "group",
    groupId: "E",
    homeTeamId: "ger",
    awayTeamId: "cuw",
    kickoff: "2026-06-14T17:00:00.000Z",
    venue: "NRG Stadium, Houston, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-F-1",
    stage: "group",
    groupId: "F",
    homeTeamId: "ned",
    awayTeamId: "jpn",
    kickoff: "2026-06-14T20:00:00.000Z",
    venue: "AT&T Stadium, Arlington, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-E-2",
    stage: "group",
    groupId: "E",
    homeTeamId: "civ",
    awayTeamId: "ecu",
    kickoff: "2026-06-14T23:00:00.000Z",
    venue: "Lincoln Financial Field, Philadelphia, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-F-2",
    stage: "group",
    groupId: "F",
    homeTeamId: "swe",
    awayTeamId: "tun",
    kickoff: "2026-06-15T02:00:00.000Z",
    venue: "Estadio BBVA, Guadalupe, Mexiko",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-H-1",
    stage: "group",
    groupId: "H",
    homeTeamId: "esp",
    awayTeamId: "cpv",
    kickoff: "2026-06-15T16:00:00.000Z",
    venue: "Mercedes-Benz Stadium, Atlanta, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-G-1",
    stage: "group",
    groupId: "G",
    homeTeamId: "bel",
    awayTeamId: "egy",
    kickoff: "2026-06-15T19:00:00.000Z",
    venue: "Lumen Field, Seattle, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-H-2",
    stage: "group",
    groupId: "H",
    homeTeamId: "ksa",
    awayTeamId: "uru",
    kickoff: "2026-06-15T22:00:00.000Z",
    venue: "Hard Rock Stadium, Miami Gardens, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-G-2",
    stage: "group",
    groupId: "G",
    homeTeamId: "irn",
    awayTeamId: "nzl",
    kickoff: "2026-06-16T01:00:00.000Z",
    venue: "SoFi Stadium, Inglewood, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-I-1",
    stage: "group",
    groupId: "I",
    homeTeamId: "fra",
    awayTeamId: "sen",
    kickoff: "2026-06-16T19:00:00.000Z",
    venue: "MetLife Stadium, East Rutherford, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-I-2",
    stage: "group",
    groupId: "I",
    homeTeamId: "irq",
    awayTeamId: "nor",
    kickoff: "2026-06-16T22:00:00.000Z",
    venue: "Gillette Stadium, Foxborough, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-J-1",
    stage: "group",
    groupId: "J",
    homeTeamId: "arg",
    awayTeamId: "alg",
    kickoff: "2026-06-17T01:00:00.000Z",
    venue: "Arrowhead Stadium, Kansas City, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-J-2",
    stage: "group",
    groupId: "J",
    homeTeamId: "aut",
    awayTeamId: "jor",
    kickoff: "2026-06-17T04:00:00.000Z",
    venue: "Levi's Stadium, Santa Clara, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-K-1",
    stage: "group",
    groupId: "K",
    homeTeamId: "por",
    awayTeamId: "cod",
    kickoff: "2026-06-17T17:00:00.000Z",
    venue: "NRG Stadium, Houston, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-L-1",
    stage: "group",
    groupId: "L",
    homeTeamId: "eng",
    awayTeamId: "cro",
    kickoff: "2026-06-17T20:00:00.000Z",
    venue: "AT&T Stadium, Arlington, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-L-2",
    stage: "group",
    groupId: "L",
    homeTeamId: "gha",
    awayTeamId: "pan",
    kickoff: "2026-06-17T23:00:00.000Z",
    venue: "BMO Field, Toronto, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-K-2",
    stage: "group",
    groupId: "K",
    homeTeamId: "uzb",
    awayTeamId: "col",
    kickoff: "2026-06-18T02:00:00.000Z",
    venue: "Estadio Azteca, Mexico City, Mexiko",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-A-3",
    stage: "group",
    groupId: "A",
    homeTeamId: "cze",
    awayTeamId: "rsa",
    kickoff: "2026-06-18T16:00:00.000Z",
    venue: "Mercedes-Benz Stadium, Atlanta, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-B-3",
    stage: "group",
    groupId: "B",
    homeTeamId: "sui",
    awayTeamId: "bih",
    kickoff: "2026-06-18T19:00:00.000Z",
    venue: "SoFi Stadium, Inglewood, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-B-4",
    stage: "group",
    groupId: "B",
    homeTeamId: "can",
    awayTeamId: "qat",
    kickoff: "2026-06-18T22:00:00.000Z",
    venue: "BC Place, Vancouver, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-A-4",
    stage: "group",
    groupId: "A",
    homeTeamId: "mex",
    awayTeamId: "kor",
    kickoff: "2026-06-19T01:00:00.000Z",
    venue: "Estadio Akron, Zapopan, Mexiko",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-D-3",
    stage: "group",
    groupId: "D",
    homeTeamId: "usa",
    awayTeamId: "aus",
    kickoff: "2026-06-19T19:00:00.000Z",
    venue: "Lumen Field, Seattle, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-C-3",
    stage: "group",
    groupId: "C",
    homeTeamId: "sco",
    awayTeamId: "mar",
    kickoff: "2026-06-19T22:00:00.000Z",
    venue: "Gillette Stadium, Foxborough, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-C-4",
    stage: "group",
    groupId: "C",
    homeTeamId: "bra",
    awayTeamId: "hai",
    kickoff: "2026-06-20T01:00:00.000Z",
    venue: "Lincoln Financial Field, Philadelphia, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-D-4",
    stage: "group",
    groupId: "D",
    homeTeamId: "tur",
    awayTeamId: "par",
    kickoff: "2026-06-20T04:00:00.000Z",
    venue: "Levi's Stadium, Santa Clara, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-F-3",
    stage: "group",
    groupId: "F",
    homeTeamId: "ned",
    awayTeamId: "swe",
    kickoff: "2026-06-20T17:00:00.000Z",
    venue: "NRG Stadium, Houston, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-E-3",
    stage: "group",
    groupId: "E",
    homeTeamId: "ger",
    awayTeamId: "civ",
    kickoff: "2026-06-20T20:00:00.000Z",
    venue: "BMO Field, Toronto, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-E-4",
    stage: "group",
    groupId: "E",
    homeTeamId: "ecu",
    awayTeamId: "cuw",
    kickoff: "2026-06-21T00:00:00.000Z",
    venue: "Arrowhead Stadium, Kansas City, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-F-4",
    stage: "group",
    groupId: "F",
    homeTeamId: "tun",
    awayTeamId: "jpn",
    kickoff: "2026-06-21T04:00:00.000Z",
    venue: "Estadio BBVA, Guadalupe, Mexiko",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-H-3",
    stage: "group",
    groupId: "H",
    homeTeamId: "esp",
    awayTeamId: "ksa",
    kickoff: "2026-06-21T16:00:00.000Z",
    venue: "Mercedes-Benz Stadium, Atlanta, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-G-3",
    stage: "group",
    groupId: "G",
    homeTeamId: "bel",
    awayTeamId: "irn",
    kickoff: "2026-06-21T19:00:00.000Z",
    venue: "SoFi Stadium, Inglewood, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-H-4",
    stage: "group",
    groupId: "H",
    homeTeamId: "uru",
    awayTeamId: "cpv",
    kickoff: "2026-06-21T22:00:00.000Z",
    venue: "Hard Rock Stadium, Miami Gardens, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-G-4",
    stage: "group",
    groupId: "G",
    homeTeamId: "nzl",
    awayTeamId: "egy",
    kickoff: "2026-06-22T01:00:00.000Z",
    venue: "BC Place, Vancouver, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-J-3",
    stage: "group",
    groupId: "J",
    homeTeamId: "arg",
    awayTeamId: "aut",
    kickoff: "2026-06-22T17:00:00.000Z",
    venue: "AT&T Stadium, Arlington, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-I-3",
    stage: "group",
    groupId: "I",
    homeTeamId: "fra",
    awayTeamId: "irq",
    kickoff: "2026-06-22T21:00:00.000Z",
    venue: "Lincoln Financial Field, Philadelphia, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-I-4",
    stage: "group",
    groupId: "I",
    homeTeamId: "nor",
    awayTeamId: "sen",
    kickoff: "2026-06-23T00:00:00.000Z",
    venue: "MetLife Stadium, East Rutherford, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-J-4",
    stage: "group",
    groupId: "J",
    homeTeamId: "jor",
    awayTeamId: "alg",
    kickoff: "2026-06-23T03:00:00.000Z",
    venue: "Levi's Stadium, Santa Clara, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-K-3",
    stage: "group",
    groupId: "K",
    homeTeamId: "por",
    awayTeamId: "uzb",
    kickoff: "2026-06-23T17:00:00.000Z",
    venue: "NRG Stadium, Houston, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-L-3",
    stage: "group",
    groupId: "L",
    homeTeamId: "eng",
    awayTeamId: "gha",
    kickoff: "2026-06-23T20:00:00.000Z",
    venue: "Gillette Stadium, Foxborough, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-L-4",
    stage: "group",
    groupId: "L",
    homeTeamId: "pan",
    awayTeamId: "cro",
    kickoff: "2026-06-23T23:00:00.000Z",
    venue: "BMO Field, Toronto, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-K-4",
    stage: "group",
    groupId: "K",
    homeTeamId: "col",
    awayTeamId: "cod",
    kickoff: "2026-06-24T02:00:00.000Z",
    venue: "Estadio Akron, Zapopan, Mexiko",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-B-5",
    stage: "group",
    groupId: "B",
    homeTeamId: "sui",
    awayTeamId: "can",
    kickoff: "2026-06-24T19:00:00.000Z",
    venue: "BC Place, Vancouver, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-B-6",
    stage: "group",
    groupId: "B",
    homeTeamId: "bih",
    awayTeamId: "qat",
    kickoff: "2026-06-24T19:00:00.000Z",
    venue: "Lumen Field, Seattle, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-C-5",
    stage: "group",
    groupId: "C",
    homeTeamId: "mar",
    awayTeamId: "hai",
    kickoff: "2026-06-24T22:00:00.000Z",
    venue: "Mercedes-Benz Stadium, Atlanta, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-C-6",
    stage: "group",
    groupId: "C",
    homeTeamId: "sco",
    awayTeamId: "bra",
    kickoff: "2026-06-24T22:00:00.000Z",
    venue: "Hard Rock Stadium, Miami Gardens, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-A-5",
    stage: "group",
    groupId: "A",
    homeTeamId: "rsa",
    awayTeamId: "kor",
    kickoff: "2026-06-25T01:00:00.000Z",
    venue: "Estadio BBVA, Guadalupe, Mexiko",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-A-6",
    stage: "group",
    groupId: "A",
    homeTeamId: "cze",
    awayTeamId: "mex",
    kickoff: "2026-06-25T01:00:00.000Z",
    venue: "Estadio Azteca, Mexico City, Mexiko",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-E-5",
    stage: "group",
    groupId: "E",
    homeTeamId: "cuw",
    awayTeamId: "civ",
    kickoff: "2026-06-25T20:00:00.000Z",
    venue: "Lincoln Financial Field, Philadelphia, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-E-6",
    stage: "group",
    groupId: "E",
    homeTeamId: "ecu",
    awayTeamId: "ger",
    kickoff: "2026-06-25T20:00:00.000Z",
    venue: "MetLife Stadium, East Rutherford, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-F-5",
    stage: "group",
    groupId: "F",
    homeTeamId: "tun",
    awayTeamId: "ned",
    kickoff: "2026-06-25T23:00:00.000Z",
    venue: "Arrowhead Stadium, Kansas City, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-F-6",
    stage: "group",
    groupId: "F",
    homeTeamId: "jpn",
    awayTeamId: "swe",
    kickoff: "2026-06-25T23:00:00.000Z",
    venue: "AT&T Stadium, Arlington, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-D-5",
    stage: "group",
    groupId: "D",
    homeTeamId: "tur",
    awayTeamId: "usa",
    kickoff: "2026-06-26T02:00:00.000Z",
    venue: "SoFi Stadium, Inglewood, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-D-6",
    stage: "group",
    groupId: "D",
    homeTeamId: "par",
    awayTeamId: "aus",
    kickoff: "2026-06-26T02:00:00.000Z",
    venue: "Levi's Stadium, Santa Clara, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-I-5",
    stage: "group",
    groupId: "I",
    homeTeamId: "nor",
    awayTeamId: "fra",
    kickoff: "2026-06-26T19:00:00.000Z",
    venue: "Gillette Stadium, Foxborough, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-I-6",
    stage: "group",
    groupId: "I",
    homeTeamId: "sen",
    awayTeamId: "irq",
    kickoff: "2026-06-26T19:00:00.000Z",
    venue: "BMO Field, Toronto, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-H-5",
    stage: "group",
    groupId: "H",
    homeTeamId: "cpv",
    awayTeamId: "ksa",
    kickoff: "2026-06-27T00:00:00.000Z",
    venue: "NRG Stadium, Houston, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-H-6",
    stage: "group",
    groupId: "H",
    homeTeamId: "uru",
    awayTeamId: "esp",
    kickoff: "2026-06-27T00:00:00.000Z",
    venue: "Estadio Akron, Zapopan, Mexiko",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-G-5",
    stage: "group",
    groupId: "G",
    homeTeamId: "nzl",
    awayTeamId: "bel",
    kickoff: "2026-06-27T03:00:00.000Z",
    venue: "BC Place, Vancouver, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-G-6",
    stage: "group",
    groupId: "G",
    homeTeamId: "egy",
    awayTeamId: "irn",
    kickoff: "2026-06-27T03:00:00.000Z",
    venue: "Lumen Field, Seattle, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-L-5",
    stage: "group",
    groupId: "L",
    homeTeamId: "pan",
    awayTeamId: "eng",
    kickoff: "2026-06-27T21:00:00.000Z",
    venue: "MetLife Stadium, East Rutherford, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-L-6",
    stage: "group",
    groupId: "L",
    homeTeamId: "cro",
    awayTeamId: "gha",
    kickoff: "2026-06-27T21:00:00.000Z",
    venue: "Lincoln Financial Field, Philadelphia, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-K-5",
    stage: "group",
    groupId: "K",
    homeTeamId: "cod",
    awayTeamId: "uzb",
    kickoff: "2026-06-27T23:30:00.000Z",
    venue: "Mercedes-Benz Stadium, Atlanta, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-K-6",
    stage: "group",
    groupId: "K",
    homeTeamId: "col",
    awayTeamId: "por",
    kickoff: "2026-06-27T23:30:00.000Z",
    venue: "Hard Rock Stadium, Miami Gardens, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-J-5",
    stage: "group",
    groupId: "J",
    homeTeamId: "alg",
    awayTeamId: "aut",
    kickoff: "2026-06-28T02:00:00.000Z",
    venue: "Arrowhead Stadium, Kansas City, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "g-J-6",
    stage: "group",
    groupId: "J",
    homeTeamId: "jor",
    awayTeamId: "arg",
    kickoff: "2026-06-28T02:00:00.000Z",
    venue: "AT&T Stadium, Arlington, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M73",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-06-28T19:00:00.000Z",
    venue: "SoFi Stadium, Inglewood, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M76",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-06-29T17:00:00.000Z",
    venue: "NRG Stadium, Houston, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M74",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-06-29T20:30:00.000Z",
    venue: "Gillette Stadium, Foxborough, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M75",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-06-30T01:00:00.000Z",
    venue: "Estadio BBVA, Guadalupe, Mexiko",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M78",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-06-30T17:00:00.000Z",
    venue: "AT&T Stadium, Arlington, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M77",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-06-30T21:00:00.000Z",
    venue: "MetLife Stadium, East Rutherford, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M79",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-01T01:00:00.000Z",
    venue: "Estadio Azteca, Mexico City, Mexiko",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M80",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-01T16:00:00.000Z",
    venue: "Mercedes-Benz Stadium, Atlanta, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M82",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-01T20:00:00.000Z",
    venue: "Lumen Field, Seattle, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M81",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-02T00:00:00.000Z",
    venue: "Levi's Stadium, Santa Clara, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M84",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-02T19:00:00.000Z",
    venue: "SoFi Stadium, Inglewood, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M83",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-02T23:00:00.000Z",
    venue: "BMO Field, Toronto, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M85",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-03T03:00:00.000Z",
    venue: "BC Place, Vancouver, Kanada",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M88",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-03T18:00:00.000Z",
    venue: "AT&T Stadium, Arlington, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M86",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-03T22:00:00.000Z",
    venue: "Hard Rock Stadium, Miami Gardens, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M87",
    stage: "round-of-32",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-04T01:30:00.000Z",
    venue: "Arrowhead Stadium, Kansas City, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M90",
    stage: "round-of-16",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-04T17:00:00.000Z",
    venue: "NRG Stadium, Houston, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M89",
    stage: "round-of-16",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-04T21:00:00.000Z",
    venue: "Lincoln Financial Field, Philadelphia, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M91",
    stage: "round-of-16",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-05T20:00:00.000Z",
    venue: "MetLife Stadium, East Rutherford, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M92",
    stage: "round-of-16",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-06T00:00:00.000Z",
    venue: "Estadio Azteca, Mexico City, Mexiko",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M93",
    stage: "round-of-16",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-06T19:00:00.000Z",
    venue: "AT&T Stadium, Arlington, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M94",
    stage: "round-of-16",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-07T00:00:00.000Z",
    venue: "Lumen Field, Seattle, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M95",
    stage: "round-of-16",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-07T16:00:00.000Z",
    venue: "Mercedes-Benz Stadium, Atlanta, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M96",
    stage: "round-of-16",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-07T20:00:00.000Z",
    venue: "BC Place, Vancouver, Kanada",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M97",
    stage: "quarter-final",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-09T20:00:00.000Z",
    venue: "Gillette Stadium, Foxborough, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M98",
    stage: "quarter-final",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-10T19:00:00.000Z",
    venue: "SoFi Stadium, Inglewood, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M99",
    stage: "quarter-final",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-11T21:00:00.000Z",
    venue: "Hard Rock Stadium, Miami Gardens, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M100",
    stage: "quarter-final",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-12T01:00:00.000Z",
    venue: "Arrowhead Stadium, Kansas City, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M101",
    stage: "semi-final",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-14T19:00:00.000Z",
    venue: "AT&T Stadium, Arlington, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M102",
    stage: "semi-final",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-15T19:00:00.000Z",
    venue: "Mercedes-Benz Stadium, Atlanta, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  },
  {
    id: "M103",
    stage: "third-place",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-18T21:00:00.000Z",
    venue: "Hard Rock Stadium, Miami Gardens, USA",
    tvChannel: "SVT",
    result: null,
    status: "scheduled"
  },
  {
    id: "M104",
    stage: "final",
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff: "2026-07-19T19:00:00.000Z",
    venue: "MetLife Stadium, East Rutherford, USA",
    tvChannel: "TV4",
    result: null,
    status: "scheduled"
  }
];

// src/domain/standings/compute-standings.ts
var POINTS_WIN = 3;
var POINTS_DRAW = 1;
var POINTS_LOSS = 0;
function emptyStanding(teamId2) {
  return {
    teamId: teamId2,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    rank: 0
  };
}
function isCounted(match) {
  return match.stage === "group" && match.groupId !== null && match.status === "finished" && match.homeTeamId !== null && match.awayTeamId !== null;
}
function applyResult(row, scored, conceded) {
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) {
    row.won += 1;
    row.points += POINTS_WIN;
  } else if (scored === conceded) {
    row.drawn += 1;
    row.points += POINTS_DRAW;
  } else {
    row.lost += 1;
    row.points += POINTS_LOSS;
  }
}
function headToHeadStats(tiedTeamIds, countedMatches) {
  const tied = new Set(tiedTeamIds);
  const stats = /* @__PURE__ */ new Map();
  for (const id of tiedTeamIds) {
    stats.set(id, { points: 0, goalDifference: 0, goalsFor: 0 });
  }
  for (const match of countedMatches) {
    if (!tied.has(match.homeTeamId) || !tied.has(match.awayTeamId)) {
      continue;
    }
    const home = stats.get(match.homeTeamId);
    const away = stats.get(match.awayTeamId);
    const { homeGoals, awayGoals } = match.result;
    home.goalsFor += homeGoals;
    home.goalDifference += homeGoals - awayGoals;
    away.goalsFor += awayGoals;
    away.goalDifference += awayGoals - homeGoals;
    if (homeGoals > awayGoals) {
      home.points += POINTS_WIN;
    } else if (homeGoals === awayGoals) {
      home.points += POINTS_DRAW;
      away.points += POINTS_DRAW;
    } else {
      away.points += POINTS_WIN;
    }
  }
  return stats;
}
function compareHeadToHead(a, b, h2h) {
  const ha = h2h.get(a.teamId);
  const hb = h2h.get(b.teamId);
  if (!ha || !hb) {
    const missing = !ha ? a.teamId : b.teamId;
    throw new Error(
      `Invariant-brott i FIFA-tiebreak: laget "${missing}" saknar en rad i inb\xF6rdes-mini-tabellen (h2h byggdes inte \xF6ver de j\xE4mf\xF6rda lagen). Detta ska aldrig h\xE4nda via resolveTiedGroup, det \xE4r ett programmeringsfel.`
    );
  }
  if (ha.points !== hb.points) {
    return hb.points - ha.points;
  }
  if (ha.goalDifference !== hb.goalDifference) {
    return hb.goalDifference - ha.goalDifference;
  }
  if (ha.goalsFor !== hb.goalsFor) {
    return hb.goalsFor - ha.goalsFor;
  }
  return 0;
}
function compareOverall(a, b) {
  if (a.goalDifference !== b.goalDifference) {
    return b.goalDifference - a.goalDifference;
  }
  if (a.goalsFor !== b.goalsFor) {
    return b.goalsFor - a.goalsFor;
  }
  return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
}
function resolveTiedGroup(tied, countedMatches) {
  if (tied.length <= 1) {
    return tied;
  }
  const h2h = headToHeadStats(
    tied.map((r) => r.teamId),
    countedMatches
  );
  const ordered = [...tied].sort((a, b) => compareHeadToHead(a, b, h2h));
  const result = [];
  let i = 0;
  while (i < ordered.length) {
    let j = i + 1;
    while (j < ordered.length && compareHeadToHead(ordered[i], ordered[j], h2h) === 0) {
      j += 1;
    }
    const subset = ordered.slice(i, j);
    if (subset.length === 1) {
      result.push(subset[0]);
    } else if (subset.length < tied.length) {
      result.push(...resolveTiedGroup(subset, countedMatches));
    } else {
      result.push(...[...subset].sort(compareOverall));
    }
    i = j;
  }
  return result;
}
function sortGroup(rows, countedMatches) {
  const byPoints = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const bucket = byPoints.get(row.points);
    if (bucket) {
      bucket.push(row);
    } else {
      byPoints.set(row.points, [row]);
    }
  }
  const sorted = [];
  const pointValues = [...byPoints.keys()].sort((x, y) => y - x);
  for (const points of pointValues) {
    const bucket = byPoints.get(points);
    sorted.push(...resolveTiedGroup(bucket, countedMatches));
  }
  return sorted;
}
function computeStandings(teamIds, matches) {
  const rowsById = /* @__PURE__ */ new Map();
  for (const teamId2 of teamIds) {
    rowsById.set(teamId2, emptyStanding(teamId2));
  }
  const countedMatches = matches.filter(isCounted);
  for (const match of countedMatches) {
    const home = rowsById.get(match.homeTeamId);
    const away = rowsById.get(match.awayTeamId);
    if (!home || !away) {
      continue;
    }
    const { homeGoals, awayGoals } = match.result;
    applyResult(home, homeGoals, awayGoals);
    applyResult(away, awayGoals, homeGoals);
  }
  const sorted = sortGroup([...rowsById.values()], countedMatches);
  sorted.forEach((row, index) => {
    row.rank = index + 1;
  });
  return sorted;
}

// src/features/groups/derive-group-tables.ts
function deriveGroupTables(groups, matches) {
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const matchesByGroup = /* @__PURE__ */ new Map();
  for (const match of matches) {
    if (match.groupId === null) {
      continue;
    }
    const bucket = matchesByGroup.get(match.groupId);
    if (bucket) {
      bucket.push(match);
    } else {
      matchesByGroup.set(match.groupId, [match]);
    }
  }
  const tables = [];
  for (const groupId of GROUP_IDS) {
    const group = groupsById.get(groupId);
    if (!group) {
      continue;
    }
    tables.push({
      groupId,
      standings: computeStandings(group.teamIds, matchesByGroup.get(groupId) ?? [])
    });
  }
  return tables;
}

// src/domain/bracket/bracket-structure.ts
var ROUND_OF_32 = [
  // M73 Runner-up A v Runner-up B
  { id: "M73", stage: "round-of-32", home: ru("A"), away: ru("B") },
  // M74 Winner E v Best 3rd of A,B,C,D,F
  { id: "M74", stage: "round-of-32", home: w("E"), away: best("A", "B", "C", "D", "F") },
  // M75 Winner F v Runner-up C
  { id: "M75", stage: "round-of-32", home: w("F"), away: ru("C") },
  // M76 Winner C v Runner-up F
  { id: "M76", stage: "round-of-32", home: w("C"), away: ru("F") },
  // M77 Winner I v Best 3rd of C,D,F,G,H
  { id: "M77", stage: "round-of-32", home: w("I"), away: best("C", "D", "F", "G", "H") },
  // M78 Runner-up E v Runner-up I
  { id: "M78", stage: "round-of-32", home: ru("E"), away: ru("I") },
  // M79 Winner A v Best 3rd of C,E,F,H,I
  { id: "M79", stage: "round-of-32", home: w("A"), away: best("C", "E", "F", "H", "I") },
  // M80 Winner L v Best 3rd of E,H,I,J,K
  { id: "M80", stage: "round-of-32", home: w("L"), away: best("E", "H", "I", "J", "K") },
  // M81 Winner D v Best 3rd of B,E,F,I,J
  { id: "M81", stage: "round-of-32", home: w("D"), away: best("B", "E", "F", "I", "J") },
  // M82 Winner G v Best 3rd of A,E,H,I,J
  { id: "M82", stage: "round-of-32", home: w("G"), away: best("A", "E", "H", "I", "J") },
  // M83 Runner-up K v Runner-up L
  { id: "M83", stage: "round-of-32", home: ru("K"), away: ru("L") },
  // M84 Winner H v Runner-up J
  { id: "M84", stage: "round-of-32", home: w("H"), away: ru("J") },
  // M85 Winner B v Best 3rd of E,F,G,I,J
  { id: "M85", stage: "round-of-32", home: w("B"), away: best("E", "F", "G", "I", "J") },
  // M86 Winner J v Runner-up H
  { id: "M86", stage: "round-of-32", home: w("J"), away: ru("H") },
  // M87 Winner K v Best 3rd of D,E,I,J,L
  { id: "M87", stage: "round-of-32", home: w("K"), away: best("D", "E", "I", "J", "L") },
  // M88 Runner-up D v Runner-up G
  { id: "M88", stage: "round-of-32", home: ru("D"), away: ru("G") }
];
var ROUND_OF_16 = [
  { id: "M89", stage: "round-of-16", home: ww("M74"), away: ww("M77") },
  { id: "M90", stage: "round-of-16", home: ww("M73"), away: ww("M75") },
  { id: "M91", stage: "round-of-16", home: ww("M76"), away: ww("M78") },
  { id: "M92", stage: "round-of-16", home: ww("M79"), away: ww("M80") },
  { id: "M93", stage: "round-of-16", home: ww("M83"), away: ww("M84") },
  { id: "M94", stage: "round-of-16", home: ww("M81"), away: ww("M82") },
  { id: "M95", stage: "round-of-16", home: ww("M86"), away: ww("M88") },
  { id: "M96", stage: "round-of-16", home: ww("M85"), away: ww("M87") }
];
var QUARTER_FINALS = [
  { id: "M97", stage: "quarter-final", home: ww("M89"), away: ww("M90") },
  { id: "M98", stage: "quarter-final", home: ww("M93"), away: ww("M94") },
  { id: "M99", stage: "quarter-final", home: ww("M91"), away: ww("M92") },
  { id: "M100", stage: "quarter-final", home: ww("M95"), away: ww("M96") }
];
var SEMI_FINALS = [
  { id: "M101", stage: "semi-final", home: ww("M97"), away: ww("M98") },
  { id: "M102", stage: "semi-final", home: ww("M99"), away: ww("M100") }
];
var THIRD_PLACE_MATCH = {
  id: "M103",
  stage: "third-place",
  home: lw("M101"),
  away: lw("M102")
};
var FINAL = {
  id: "M104",
  stage: "final",
  home: ww("M101"),
  away: ww("M102")
};
var BRACKET_MATCHES = [
  ...ROUND_OF_32,
  ...ROUND_OF_16,
  ...QUARTER_FINALS,
  ...SEMI_FINALS,
  THIRD_PLACE_MATCH,
  FINAL
];
function w(group) {
  return { kind: "group-winner", group };
}
function ru(group) {
  return { kind: "group-runner-up", group };
}
function best(...eligibleGroups) {
  return { kind: "best-third", eligibleGroups };
}
function ww(matchId) {
  return { kind: "match-winner", matchId };
}
function lw(matchId) {
  return { kind: "match-loser", matchId };
}

// src/domain/bracket/set-once.ts
function setOnce(map, key, value, label) {
  if (map.has(key)) {
    throw new Error(
      `Dubblett-mappning f\xF6r ${label} "${String(key)}": nyckeln finns redan. Detta tyder p\xE5 ett schemafel i den k\xE4llh\xE4nvisade strukturdatan (samma nyckel h\xE4rleds fr\xE5n fler \xE4n en k\xE4lla).`
    );
  }
  map.set(key, value);
}

// src/domain/bracket/build-bracket.ts
function slotId(matchId, side) {
  return `${matchId}-${side}`;
}
function buildBracket() {
  const winnerGoesTo = /* @__PURE__ */ new Map();
  for (const match of BRACKET_MATCHES) {
    for (const side of ["home", "away"]) {
      const source = side === "home" ? match.home : match.away;
      if (source.kind === "match-winner") {
        setOnce(winnerGoesTo, source.matchId, slotId(match.id, side), "match-winner-k\xE4lla");
      }
    }
  }
  const nodes = [];
  for (const match of BRACKET_MATCHES) {
    nodes.push(makeNode(match, "home", winnerGoesTo));
    nodes.push(makeNode(match, "away", winnerGoesTo));
  }
  return nodes;
}
function makeNode(match, side, winnerGoesTo) {
  const source = side === "home" ? match.home : match.away;
  return {
    id: slotId(match.id, side),
    stage: match.stage,
    source,
    resolvedTeamId: null,
    nextSlotId: winnerGoesTo.get(match.id) ?? null,
    matchId: match.id,
    side
  };
}

// src/domain/bracket/third-place-table.ts
var THIRD_PLACE_COLUMN_WINNERS = ["A", "B", "D", "E", "G", "I", "K", "L"];
var THIRD_PLACE_TABLE = [
  ["E", "J", "I", "F", "H", "G", "L", "K"],
  // 1
  ["H", "G", "I", "D", "J", "F", "L", "K"],
  // 2
  ["E", "J", "I", "D", "H", "G", "L", "K"],
  // 3
  ["E", "J", "I", "D", "H", "F", "L", "K"],
  // 4
  ["E", "G", "I", "D", "J", "F", "L", "K"],
  // 5
  ["E", "G", "J", "D", "H", "F", "L", "K"],
  // 6
  ["E", "G", "I", "D", "H", "F", "L", "K"],
  // 7
  ["E", "G", "J", "D", "H", "F", "L", "I"],
  // 8
  ["E", "G", "J", "D", "H", "F", "I", "K"],
  // 9
  ["H", "G", "I", "C", "J", "F", "L", "K"],
  // 10
  ["E", "J", "I", "C", "H", "G", "L", "K"],
  // 11
  ["E", "J", "I", "C", "H", "F", "L", "K"],
  // 12
  ["E", "G", "I", "C", "J", "F", "L", "K"],
  // 13
  ["E", "G", "J", "C", "H", "F", "L", "K"],
  // 14
  ["E", "G", "I", "C", "H", "F", "L", "K"],
  // 15
  ["E", "G", "J", "C", "H", "F", "L", "I"],
  // 16
  ["E", "G", "J", "C", "H", "F", "I", "K"],
  // 17
  ["H", "G", "I", "C", "J", "D", "L", "K"],
  // 18
  ["C", "J", "I", "D", "H", "F", "L", "K"],
  // 19
  ["C", "G", "I", "D", "J", "F", "L", "K"],
  // 20
  ["C", "G", "J", "D", "H", "F", "L", "K"],
  // 21
  ["C", "G", "I", "D", "H", "F", "L", "K"],
  // 22
  ["C", "G", "J", "D", "H", "F", "L", "I"],
  // 23
  ["C", "G", "J", "D", "H", "F", "I", "K"],
  // 24
  ["E", "J", "I", "C", "H", "D", "L", "K"],
  // 25
  ["E", "G", "I", "C", "J", "D", "L", "K"],
  // 26
  ["E", "G", "J", "C", "H", "D", "L", "K"],
  // 27
  ["E", "G", "I", "C", "H", "D", "L", "K"],
  // 28
  ["E", "G", "J", "C", "H", "D", "L", "I"],
  // 29
  ["E", "G", "J", "C", "H", "D", "I", "K"],
  // 30
  ["C", "J", "E", "D", "I", "F", "L", "K"],
  // 31
  ["C", "J", "E", "D", "H", "F", "L", "K"],
  // 32
  ["C", "E", "I", "D", "H", "F", "L", "K"],
  // 33
  ["C", "J", "E", "D", "H", "F", "L", "I"],
  // 34
  ["C", "J", "E", "D", "H", "F", "I", "K"],
  // 35
  ["C", "G", "E", "D", "J", "F", "L", "K"],
  // 36
  ["C", "G", "E", "D", "I", "F", "L", "K"],
  // 37
  ["C", "G", "E", "D", "J", "F", "L", "I"],
  // 38
  ["C", "G", "E", "D", "J", "F", "I", "K"],
  // 39
  ["C", "G", "E", "D", "H", "F", "L", "K"],
  // 40
  ["C", "G", "J", "D", "H", "F", "L", "E"],
  // 41
  ["C", "G", "J", "D", "H", "F", "E", "K"],
  // 42
  ["C", "G", "E", "D", "H", "F", "L", "I"],
  // 43
  ["C", "G", "E", "D", "H", "F", "I", "K"],
  // 44
  ["C", "G", "J", "D", "H", "F", "E", "I"],
  // 45
  ["H", "J", "B", "F", "I", "G", "L", "K"],
  // 46
  ["E", "J", "I", "B", "H", "G", "L", "K"],
  // 47
  ["E", "J", "B", "F", "I", "H", "L", "K"],
  // 48
  ["E", "J", "B", "F", "I", "G", "L", "K"],
  // 49
  ["E", "J", "B", "F", "H", "G", "L", "K"],
  // 50
  ["E", "G", "B", "F", "I", "H", "L", "K"],
  // 51
  ["E", "J", "B", "F", "H", "G", "L", "I"],
  // 52
  ["E", "J", "B", "F", "H", "G", "I", "K"],
  // 53
  ["H", "J", "B", "D", "I", "G", "L", "K"],
  // 54
  ["H", "J", "B", "D", "I", "F", "L", "K"],
  // 55
  ["I", "G", "B", "D", "J", "F", "L", "K"],
  // 56
  ["H", "G", "B", "D", "J", "F", "L", "K"],
  // 57
  ["H", "G", "B", "D", "I", "F", "L", "K"],
  // 58
  ["H", "G", "B", "D", "J", "F", "L", "I"],
  // 59
  ["H", "G", "B", "D", "J", "F", "I", "K"],
  // 60
  ["E", "J", "B", "D", "I", "H", "L", "K"],
  // 61
  ["E", "J", "B", "D", "I", "G", "L", "K"],
  // 62
  ["E", "J", "B", "D", "H", "G", "L", "K"],
  // 63
  ["E", "G", "B", "D", "I", "H", "L", "K"],
  // 64
  ["E", "J", "B", "D", "H", "G", "L", "I"],
  // 65
  ["E", "J", "B", "D", "H", "G", "I", "K"],
  // 66
  ["E", "J", "B", "D", "I", "F", "L", "K"],
  // 67
  ["E", "J", "B", "D", "H", "F", "L", "K"],
  // 68
  ["E", "I", "B", "D", "H", "F", "L", "K"],
  // 69
  ["E", "J", "B", "D", "H", "F", "L", "I"],
  // 70
  ["E", "J", "B", "D", "H", "F", "I", "K"],
  // 71
  ["E", "G", "B", "D", "J", "F", "L", "K"],
  // 72
  ["E", "G", "B", "D", "I", "F", "L", "K"],
  // 73
  ["E", "G", "B", "D", "J", "F", "L", "I"],
  // 74
  ["E", "G", "B", "D", "J", "F", "I", "K"],
  // 75
  ["E", "G", "B", "D", "H", "F", "L", "K"],
  // 76
  ["H", "G", "B", "D", "J", "F", "L", "E"],
  // 77
  ["H", "G", "B", "D", "J", "F", "E", "K"],
  // 78
  ["E", "G", "B", "D", "H", "F", "L", "I"],
  // 79
  ["E", "G", "B", "D", "H", "F", "I", "K"],
  // 80
  ["H", "G", "B", "D", "J", "F", "E", "I"],
  // 81
  ["H", "J", "B", "C", "I", "G", "L", "K"],
  // 82
  ["H", "J", "B", "C", "I", "F", "L", "K"],
  // 83
  ["I", "G", "B", "C", "J", "F", "L", "K"],
  // 84
  ["H", "G", "B", "C", "J", "F", "L", "K"],
  // 85
  ["H", "G", "B", "C", "I", "F", "L", "K"],
  // 86
  ["H", "G", "B", "C", "J", "F", "L", "I"],
  // 87
  ["H", "G", "B", "C", "J", "F", "I", "K"],
  // 88
  ["E", "J", "B", "C", "I", "H", "L", "K"],
  // 89
  ["E", "J", "B", "C", "I", "G", "L", "K"],
  // 90
  ["E", "J", "B", "C", "H", "G", "L", "K"],
  // 91
  ["E", "G", "B", "C", "I", "H", "L", "K"],
  // 92
  ["E", "J", "B", "C", "H", "G", "L", "I"],
  // 93
  ["E", "J", "B", "C", "H", "G", "I", "K"],
  // 94
  ["E", "J", "B", "C", "I", "F", "L", "K"],
  // 95
  ["E", "J", "B", "C", "H", "F", "L", "K"],
  // 96
  ["E", "I", "B", "C", "H", "F", "L", "K"],
  // 97
  ["E", "J", "B", "C", "H", "F", "L", "I"],
  // 98
  ["E", "J", "B", "C", "H", "F", "I", "K"],
  // 99
  ["E", "G", "B", "C", "J", "F", "L", "K"],
  // 100
  ["E", "G", "B", "C", "I", "F", "L", "K"],
  // 101
  ["E", "G", "B", "C", "J", "F", "L", "I"],
  // 102
  ["E", "G", "B", "C", "J", "F", "I", "K"],
  // 103
  ["E", "G", "B", "C", "H", "F", "L", "K"],
  // 104
  ["H", "G", "B", "C", "J", "F", "L", "E"],
  // 105
  ["H", "G", "B", "C", "J", "F", "E", "K"],
  // 106
  ["E", "G", "B", "C", "H", "F", "L", "I"],
  // 107
  ["E", "G", "B", "C", "H", "F", "I", "K"],
  // 108
  ["H", "G", "B", "C", "J", "F", "E", "I"],
  // 109
  ["H", "J", "B", "C", "I", "D", "L", "K"],
  // 110
  ["I", "G", "B", "C", "J", "D", "L", "K"],
  // 111
  ["H", "G", "B", "C", "J", "D", "L", "K"],
  // 112
  ["H", "G", "B", "C", "I", "D", "L", "K"],
  // 113
  ["H", "G", "B", "C", "J", "D", "L", "I"],
  // 114
  ["H", "G", "B", "C", "J", "D", "I", "K"],
  // 115
  ["C", "J", "B", "D", "I", "F", "L", "K"],
  // 116
  ["C", "J", "B", "D", "H", "F", "L", "K"],
  // 117
  ["C", "I", "B", "D", "H", "F", "L", "K"],
  // 118
  ["C", "J", "B", "D", "H", "F", "L", "I"],
  // 119
  ["C", "J", "B", "D", "H", "F", "I", "K"],
  // 120
  ["C", "G", "B", "D", "J", "F", "L", "K"],
  // 121
  ["C", "G", "B", "D", "I", "F", "L", "K"],
  // 122
  ["C", "G", "B", "D", "J", "F", "L", "I"],
  // 123
  ["C", "G", "B", "D", "J", "F", "I", "K"],
  // 124
  ["C", "G", "B", "D", "H", "F", "L", "K"],
  // 125
  ["C", "G", "B", "D", "H", "F", "L", "J"],
  // 126
  ["H", "G", "B", "C", "J", "F", "D", "K"],
  // 127
  ["C", "G", "B", "D", "H", "F", "L", "I"],
  // 128
  ["C", "G", "B", "D", "H", "F", "I", "K"],
  // 129
  ["H", "G", "B", "C", "J", "F", "D", "I"],
  // 130
  ["E", "J", "B", "C", "I", "D", "L", "K"],
  // 131
  ["E", "J", "B", "C", "H", "D", "L", "K"],
  // 132
  ["E", "I", "B", "C", "H", "D", "L", "K"],
  // 133
  ["E", "J", "B", "C", "H", "D", "L", "I"],
  // 134
  ["E", "J", "B", "C", "H", "D", "I", "K"],
  // 135
  ["E", "G", "B", "C", "J", "D", "L", "K"],
  // 136
  ["E", "G", "B", "C", "I", "D", "L", "K"],
  // 137
  ["E", "G", "B", "C", "J", "D", "L", "I"],
  // 138
  ["E", "G", "B", "C", "J", "D", "I", "K"],
  // 139
  ["E", "G", "B", "C", "H", "D", "L", "K"],
  // 140
  ["H", "G", "B", "C", "J", "D", "L", "E"],
  // 141
  ["H", "G", "B", "C", "J", "D", "E", "K"],
  // 142
  ["E", "G", "B", "C", "H", "D", "L", "I"],
  // 143
  ["E", "G", "B", "C", "H", "D", "I", "K"],
  // 144
  ["H", "G", "B", "C", "J", "D", "E", "I"],
  // 145
  ["C", "J", "B", "D", "E", "F", "L", "K"],
  // 146
  ["C", "E", "B", "D", "I", "F", "L", "K"],
  // 147
  ["C", "J", "B", "D", "E", "F", "L", "I"],
  // 148
  ["C", "J", "B", "D", "E", "F", "I", "K"],
  // 149
  ["C", "E", "B", "D", "H", "F", "L", "K"],
  // 150
  ["C", "J", "B", "D", "H", "F", "L", "E"],
  // 151
  ["C", "J", "B", "D", "H", "F", "E", "K"],
  // 152
  ["C", "E", "B", "D", "H", "F", "L", "I"],
  // 153
  ["C", "E", "B", "D", "H", "F", "I", "K"],
  // 154
  ["C", "J", "B", "D", "H", "F", "E", "I"],
  // 155
  ["C", "G", "B", "D", "E", "F", "L", "K"],
  // 156
  ["C", "G", "B", "D", "J", "F", "L", "E"],
  // 157
  ["C", "G", "B", "D", "J", "F", "E", "K"],
  // 158
  ["C", "G", "B", "D", "E", "F", "L", "I"],
  // 159
  ["C", "G", "B", "D", "E", "F", "I", "K"],
  // 160
  ["C", "G", "B", "D", "J", "F", "E", "I"],
  // 161
  ["C", "G", "B", "D", "H", "F", "L", "E"],
  // 162
  ["C", "G", "B", "D", "H", "F", "E", "K"],
  // 163
  ["H", "G", "B", "C", "J", "F", "D", "E"],
  // 164
  ["C", "G", "B", "D", "H", "F", "E", "I"],
  // 165
  ["H", "J", "I", "F", "A", "G", "L", "K"],
  // 166
  ["E", "J", "I", "A", "H", "G", "L", "K"],
  // 167
  ["E", "J", "I", "F", "A", "H", "L", "K"],
  // 168
  ["E", "J", "I", "F", "A", "G", "L", "K"],
  // 169
  ["E", "G", "J", "F", "A", "H", "L", "K"],
  // 170
  ["E", "G", "I", "F", "A", "H", "L", "K"],
  // 171
  ["E", "G", "J", "F", "A", "H", "L", "I"],
  // 172
  ["E", "G", "J", "F", "A", "H", "I", "K"],
  // 173
  ["H", "J", "I", "D", "A", "G", "L", "K"],
  // 174
  ["H", "J", "I", "D", "A", "F", "L", "K"],
  // 175
  ["I", "G", "J", "D", "A", "F", "L", "K"],
  // 176
  ["H", "G", "J", "D", "A", "F", "L", "K"],
  // 177
  ["H", "G", "I", "D", "A", "F", "L", "K"],
  // 178
  ["H", "G", "J", "D", "A", "F", "L", "I"],
  // 179
  ["H", "G", "J", "D", "A", "F", "I", "K"],
  // 180
  ["E", "J", "I", "D", "A", "H", "L", "K"],
  // 181
  ["E", "J", "I", "D", "A", "G", "L", "K"],
  // 182
  ["E", "G", "J", "D", "A", "H", "L", "K"],
  // 183
  ["E", "G", "I", "D", "A", "H", "L", "K"],
  // 184
  ["E", "G", "J", "D", "A", "H", "L", "I"],
  // 185
  ["E", "G", "J", "D", "A", "H", "I", "K"],
  // 186
  ["E", "J", "I", "D", "A", "F", "L", "K"],
  // 187
  ["H", "J", "E", "D", "A", "F", "L", "K"],
  // 188
  ["H", "E", "I", "D", "A", "F", "L", "K"],
  // 189
  ["H", "J", "E", "D", "A", "F", "L", "I"],
  // 190
  ["H", "J", "E", "D", "A", "F", "I", "K"],
  // 191
  ["E", "G", "J", "D", "A", "F", "L", "K"],
  // 192
  ["E", "G", "I", "D", "A", "F", "L", "K"],
  // 193
  ["E", "G", "J", "D", "A", "F", "L", "I"],
  // 194
  ["E", "G", "J", "D", "A", "F", "I", "K"],
  // 195
  ["H", "G", "E", "D", "A", "F", "L", "K"],
  // 196
  ["H", "G", "J", "D", "A", "F", "L", "E"],
  // 197
  ["H", "G", "J", "D", "A", "F", "E", "K"],
  // 198
  ["H", "G", "E", "D", "A", "F", "L", "I"],
  // 199
  ["H", "G", "E", "D", "A", "F", "I", "K"],
  // 200
  ["H", "G", "J", "D", "A", "F", "E", "I"],
  // 201
  ["H", "J", "I", "C", "A", "G", "L", "K"],
  // 202
  ["H", "J", "I", "C", "A", "F", "L", "K"],
  // 203
  ["I", "G", "J", "C", "A", "F", "L", "K"],
  // 204
  ["H", "G", "J", "C", "A", "F", "L", "K"],
  // 205
  ["H", "G", "I", "C", "A", "F", "L", "K"],
  // 206
  ["H", "G", "J", "C", "A", "F", "L", "I"],
  // 207
  ["H", "G", "J", "C", "A", "F", "I", "K"],
  // 208
  ["E", "J", "I", "C", "A", "H", "L", "K"],
  // 209
  ["E", "J", "I", "C", "A", "G", "L", "K"],
  // 210
  ["E", "G", "J", "C", "A", "H", "L", "K"],
  // 211
  ["E", "G", "I", "C", "A", "H", "L", "K"],
  // 212
  ["E", "G", "J", "C", "A", "H", "L", "I"],
  // 213
  ["E", "G", "J", "C", "A", "H", "I", "K"],
  // 214
  ["E", "J", "I", "C", "A", "F", "L", "K"],
  // 215
  ["H", "J", "E", "C", "A", "F", "L", "K"],
  // 216
  ["H", "E", "I", "C", "A", "F", "L", "K"],
  // 217
  ["H", "J", "E", "C", "A", "F", "L", "I"],
  // 218
  ["H", "J", "E", "C", "A", "F", "I", "K"],
  // 219
  ["E", "G", "J", "C", "A", "F", "L", "K"],
  // 220
  ["E", "G", "I", "C", "A", "F", "L", "K"],
  // 221
  ["E", "G", "J", "C", "A", "F", "L", "I"],
  // 222
  ["E", "G", "J", "C", "A", "F", "I", "K"],
  // 223
  ["H", "G", "E", "C", "A", "F", "L", "K"],
  // 224
  ["H", "G", "J", "C", "A", "F", "L", "E"],
  // 225
  ["H", "G", "J", "C", "A", "F", "E", "K"],
  // 226
  ["H", "G", "E", "C", "A", "F", "L", "I"],
  // 227
  ["H", "G", "E", "C", "A", "F", "I", "K"],
  // 228
  ["H", "G", "J", "C", "A", "F", "E", "I"],
  // 229
  ["H", "J", "I", "C", "A", "D", "L", "K"],
  // 230
  ["I", "G", "J", "C", "A", "D", "L", "K"],
  // 231
  ["H", "G", "J", "C", "A", "D", "L", "K"],
  // 232
  ["H", "G", "I", "C", "A", "D", "L", "K"],
  // 233
  ["H", "G", "J", "C", "A", "D", "L", "I"],
  // 234
  ["H", "G", "J", "C", "A", "D", "I", "K"],
  // 235
  ["C", "J", "I", "D", "A", "F", "L", "K"],
  // 236
  ["H", "J", "F", "C", "A", "D", "L", "K"],
  // 237
  ["H", "F", "I", "C", "A", "D", "L", "K"],
  // 238
  ["H", "J", "F", "C", "A", "D", "L", "I"],
  // 239
  ["H", "J", "F", "C", "A", "D", "I", "K"],
  // 240
  ["C", "G", "J", "D", "A", "F", "L", "K"],
  // 241
  ["C", "G", "I", "D", "A", "F", "L", "K"],
  // 242
  ["C", "G", "J", "D", "A", "F", "L", "I"],
  // 243
  ["C", "G", "J", "D", "A", "F", "I", "K"],
  // 244
  ["H", "G", "F", "C", "A", "D", "L", "K"],
  // 245
  ["C", "G", "J", "D", "A", "F", "L", "H"],
  // 246
  ["H", "G", "J", "C", "A", "F", "D", "K"],
  // 247
  ["H", "G", "F", "C", "A", "D", "L", "I"],
  // 248
  ["H", "G", "F", "C", "A", "D", "I", "K"],
  // 249
  ["H", "G", "J", "C", "A", "F", "D", "I"],
  // 250
  ["E", "J", "I", "C", "A", "D", "L", "K"],
  // 251
  ["H", "J", "E", "C", "A", "D", "L", "K"],
  // 252
  ["H", "E", "I", "C", "A", "D", "L", "K"],
  // 253
  ["H", "J", "E", "C", "A", "D", "L", "I"],
  // 254
  ["H", "J", "E", "C", "A", "D", "I", "K"],
  // 255
  ["E", "G", "J", "C", "A", "D", "L", "K"],
  // 256
  ["E", "G", "I", "C", "A", "D", "L", "K"],
  // 257
  ["E", "G", "J", "C", "A", "D", "L", "I"],
  // 258
  ["E", "G", "J", "C", "A", "D", "I", "K"],
  // 259
  ["H", "G", "E", "C", "A", "D", "L", "K"],
  // 260
  ["H", "G", "J", "C", "A", "D", "L", "E"],
  // 261
  ["H", "G", "J", "C", "A", "D", "E", "K"],
  // 262
  ["H", "G", "E", "C", "A", "D", "L", "I"],
  // 263
  ["H", "G", "E", "C", "A", "D", "I", "K"],
  // 264
  ["H", "G", "J", "C", "A", "D", "E", "I"],
  // 265
  ["C", "J", "E", "D", "A", "F", "L", "K"],
  // 266
  ["C", "E", "I", "D", "A", "F", "L", "K"],
  // 267
  ["C", "J", "E", "D", "A", "F", "L", "I"],
  // 268
  ["C", "J", "E", "D", "A", "F", "I", "K"],
  // 269
  ["H", "E", "F", "C", "A", "D", "L", "K"],
  // 270
  ["H", "J", "F", "C", "A", "D", "L", "E"],
  // 271
  ["H", "J", "E", "C", "A", "F", "D", "K"],
  // 272
  ["H", "E", "F", "C", "A", "D", "L", "I"],
  // 273
  ["H", "E", "F", "C", "A", "D", "I", "K"],
  // 274
  ["H", "J", "E", "C", "A", "F", "D", "I"],
  // 275
  ["C", "G", "E", "D", "A", "F", "L", "K"],
  // 276
  ["C", "G", "J", "D", "A", "F", "L", "E"],
  // 277
  ["C", "G", "J", "D", "A", "F", "E", "K"],
  // 278
  ["C", "G", "E", "D", "A", "F", "L", "I"],
  // 279
  ["C", "G", "E", "D", "A", "F", "I", "K"],
  // 280
  ["C", "G", "J", "D", "A", "F", "E", "I"],
  // 281
  ["H", "G", "F", "C", "A", "D", "L", "E"],
  // 282
  ["H", "G", "E", "C", "A", "F", "D", "K"],
  // 283
  ["H", "G", "J", "C", "A", "F", "D", "E"],
  // 284
  ["H", "G", "E", "C", "A", "F", "D", "I"],
  // 285
  ["H", "J", "B", "A", "I", "G", "L", "K"],
  // 286
  ["H", "J", "B", "A", "I", "F", "L", "K"],
  // 287
  ["I", "J", "B", "F", "A", "G", "L", "K"],
  // 288
  ["H", "J", "B", "F", "A", "G", "L", "K"],
  // 289
  ["H", "G", "B", "A", "I", "F", "L", "K"],
  // 290
  ["H", "J", "B", "F", "A", "G", "L", "I"],
  // 291
  ["H", "J", "B", "F", "A", "G", "I", "K"],
  // 292
  ["E", "J", "B", "A", "I", "H", "L", "K"],
  // 293
  ["E", "J", "B", "A", "I", "G", "L", "K"],
  // 294
  ["E", "J", "B", "A", "H", "G", "L", "K"],
  // 295
  ["E", "G", "B", "A", "I", "H", "L", "K"],
  // 296
  ["E", "J", "B", "A", "H", "G", "L", "I"],
  // 297
  ["E", "J", "B", "A", "H", "G", "I", "K"],
  // 298
  ["E", "J", "B", "A", "I", "F", "L", "K"],
  // 299
  ["E", "J", "B", "F", "A", "H", "L", "K"],
  // 300
  ["E", "I", "B", "F", "A", "H", "L", "K"],
  // 301
  ["E", "J", "B", "F", "A", "H", "L", "I"],
  // 302
  ["E", "J", "B", "F", "A", "H", "I", "K"],
  // 303
  ["E", "J", "B", "F", "A", "G", "L", "K"],
  // 304
  ["E", "G", "B", "A", "I", "F", "L", "K"],
  // 305
  ["E", "J", "B", "F", "A", "G", "L", "I"],
  // 306
  ["E", "J", "B", "F", "A", "G", "I", "K"],
  // 307
  ["E", "G", "B", "F", "A", "H", "L", "K"],
  // 308
  ["H", "J", "B", "F", "A", "G", "L", "E"],
  // 309
  ["H", "J", "B", "F", "A", "G", "E", "K"],
  // 310
  ["E", "G", "B", "F", "A", "H", "L", "I"],
  // 311
  ["E", "G", "B", "F", "A", "H", "I", "K"],
  // 312
  ["H", "J", "B", "F", "A", "G", "E", "I"],
  // 313
  ["I", "J", "B", "D", "A", "H", "L", "K"],
  // 314
  ["I", "J", "B", "D", "A", "G", "L", "K"],
  // 315
  ["H", "J", "B", "D", "A", "G", "L", "K"],
  // 316
  ["I", "G", "B", "D", "A", "H", "L", "K"],
  // 317
  ["H", "J", "B", "D", "A", "G", "L", "I"],
  // 318
  ["H", "J", "B", "D", "A", "G", "I", "K"],
  // 319
  ["I", "J", "B", "D", "A", "F", "L", "K"],
  // 320
  ["H", "J", "B", "D", "A", "F", "L", "K"],
  // 321
  ["H", "I", "B", "D", "A", "F", "L", "K"],
  // 322
  ["H", "J", "B", "D", "A", "F", "L", "I"],
  // 323
  ["H", "J", "B", "D", "A", "F", "I", "K"],
  // 324
  ["F", "J", "B", "D", "A", "G", "L", "K"],
  // 325
  ["I", "G", "B", "D", "A", "F", "L", "K"],
  // 326
  ["F", "J", "B", "D", "A", "G", "L", "I"],
  // 327
  ["F", "J", "B", "D", "A", "G", "I", "K"],
  // 328
  ["H", "G", "B", "D", "A", "F", "L", "K"],
  // 329
  ["H", "G", "B", "D", "A", "F", "L", "J"],
  // 330
  ["H", "G", "B", "D", "A", "F", "J", "K"],
  // 331
  ["H", "G", "B", "D", "A", "F", "L", "I"],
  // 332
  ["H", "G", "B", "D", "A", "F", "I", "K"],
  // 333
  ["H", "G", "B", "D", "A", "F", "I", "J"],
  // 334
  ["E", "J", "B", "A", "I", "D", "L", "K"],
  // 335
  ["E", "J", "B", "D", "A", "H", "L", "K"],
  // 336
  ["E", "I", "B", "D", "A", "H", "L", "K"],
  // 337
  ["E", "J", "B", "D", "A", "H", "L", "I"],
  // 338
  ["E", "J", "B", "D", "A", "H", "I", "K"],
  // 339
  ["E", "J", "B", "D", "A", "G", "L", "K"],
  // 340
  ["E", "G", "B", "A", "I", "D", "L", "K"],
  // 341
  ["E", "J", "B", "D", "A", "G", "L", "I"],
  // 342
  ["E", "J", "B", "D", "A", "G", "I", "K"],
  // 343
  ["E", "G", "B", "D", "A", "H", "L", "K"],
  // 344
  ["H", "J", "B", "D", "A", "G", "L", "E"],
  // 345
  ["H", "J", "B", "D", "A", "G", "E", "K"],
  // 346
  ["E", "G", "B", "D", "A", "H", "L", "I"],
  // 347
  ["E", "G", "B", "D", "A", "H", "I", "K"],
  // 348
  ["H", "J", "B", "D", "A", "G", "E", "I"],
  // 349
  ["E", "J", "B", "D", "A", "F", "L", "K"],
  // 350
  ["E", "I", "B", "D", "A", "F", "L", "K"],
  // 351
  ["E", "J", "B", "D", "A", "F", "L", "I"],
  // 352
  ["E", "J", "B", "D", "A", "F", "I", "K"],
  // 353
  ["H", "E", "B", "D", "A", "F", "L", "K"],
  // 354
  ["H", "J", "B", "D", "A", "F", "L", "E"],
  // 355
  ["H", "J", "B", "D", "A", "F", "E", "K"],
  // 356
  ["H", "E", "B", "D", "A", "F", "L", "I"],
  // 357
  ["H", "E", "B", "D", "A", "F", "I", "K"],
  // 358
  ["H", "J", "B", "D", "A", "F", "E", "I"],
  // 359
  ["E", "G", "B", "D", "A", "F", "L", "K"],
  // 360
  ["E", "G", "B", "D", "A", "F", "L", "J"],
  // 361
  ["E", "G", "B", "D", "A", "F", "J", "K"],
  // 362
  ["E", "G", "B", "D", "A", "F", "L", "I"],
  // 363
  ["E", "G", "B", "D", "A", "F", "I", "K"],
  // 364
  ["E", "G", "B", "D", "A", "F", "I", "J"],
  // 365
  ["H", "G", "B", "D", "A", "F", "L", "E"],
  // 366
  ["H", "G", "B", "D", "A", "F", "E", "K"],
  // 367
  ["H", "G", "B", "D", "A", "F", "E", "J"],
  // 368
  ["H", "G", "B", "D", "A", "F", "E", "I"],
  // 369
  ["I", "J", "B", "C", "A", "H", "L", "K"],
  // 370
  ["I", "J", "B", "C", "A", "G", "L", "K"],
  // 371
  ["H", "J", "B", "C", "A", "G", "L", "K"],
  // 372
  ["I", "G", "B", "C", "A", "H", "L", "K"],
  // 373
  ["H", "J", "B", "C", "A", "G", "L", "I"],
  // 374
  ["H", "J", "B", "C", "A", "G", "I", "K"],
  // 375
  ["I", "J", "B", "C", "A", "F", "L", "K"],
  // 376
  ["H", "J", "B", "C", "A", "F", "L", "K"],
  // 377
  ["H", "I", "B", "C", "A", "F", "L", "K"],
  // 378
  ["H", "J", "B", "C", "A", "F", "L", "I"],
  // 379
  ["H", "J", "B", "C", "A", "F", "I", "K"],
  // 380
  ["C", "J", "B", "F", "A", "G", "L", "K"],
  // 381
  ["I", "G", "B", "C", "A", "F", "L", "K"],
  // 382
  ["C", "J", "B", "F", "A", "G", "L", "I"],
  // 383
  ["C", "J", "B", "F", "A", "G", "I", "K"],
  // 384
  ["H", "G", "B", "C", "A", "F", "L", "K"],
  // 385
  ["H", "G", "B", "C", "A", "F", "L", "J"],
  // 386
  ["H", "G", "B", "C", "A", "F", "J", "K"],
  // 387
  ["H", "G", "B", "C", "A", "F", "L", "I"],
  // 388
  ["H", "G", "B", "C", "A", "F", "I", "K"],
  // 389
  ["H", "G", "B", "C", "A", "F", "I", "J"],
  // 390
  ["E", "J", "B", "A", "I", "C", "L", "K"],
  // 391
  ["E", "J", "B", "C", "A", "H", "L", "K"],
  // 392
  ["E", "I", "B", "C", "A", "H", "L", "K"],
  // 393
  ["E", "J", "B", "C", "A", "H", "L", "I"],
  // 394
  ["E", "J", "B", "C", "A", "H", "I", "K"],
  // 395
  ["E", "J", "B", "C", "A", "G", "L", "K"],
  // 396
  ["E", "G", "B", "A", "I", "C", "L", "K"],
  // 397
  ["E", "J", "B", "C", "A", "G", "L", "I"],
  // 398
  ["E", "J", "B", "C", "A", "G", "I", "K"],
  // 399
  ["E", "G", "B", "C", "A", "H", "L", "K"],
  // 400
  ["H", "J", "B", "C", "A", "G", "L", "E"],
  // 401
  ["H", "J", "B", "C", "A", "G", "E", "K"],
  // 402
  ["E", "G", "B", "C", "A", "H", "L", "I"],
  // 403
  ["E", "G", "B", "C", "A", "H", "I", "K"],
  // 404
  ["H", "J", "B", "C", "A", "G", "E", "I"],
  // 405
  ["E", "J", "B", "C", "A", "F", "L", "K"],
  // 406
  ["E", "I", "B", "C", "A", "F", "L", "K"],
  // 407
  ["E", "J", "B", "C", "A", "F", "L", "I"],
  // 408
  ["E", "J", "B", "C", "A", "F", "I", "K"],
  // 409
  ["H", "E", "B", "C", "A", "F", "L", "K"],
  // 410
  ["H", "J", "B", "C", "A", "F", "L", "E"],
  // 411
  ["H", "J", "B", "C", "A", "F", "E", "K"],
  // 412
  ["H", "E", "B", "C", "A", "F", "L", "I"],
  // 413
  ["H", "E", "B", "C", "A", "F", "I", "K"],
  // 414
  ["H", "J", "B", "C", "A", "F", "E", "I"],
  // 415
  ["E", "G", "B", "C", "A", "F", "L", "K"],
  // 416
  ["E", "G", "B", "C", "A", "F", "L", "J"],
  // 417
  ["E", "G", "B", "C", "A", "F", "J", "K"],
  // 418
  ["E", "G", "B", "C", "A", "F", "L", "I"],
  // 419
  ["E", "G", "B", "C", "A", "F", "I", "K"],
  // 420
  ["E", "G", "B", "C", "A", "F", "I", "J"],
  // 421
  ["H", "G", "B", "C", "A", "F", "L", "E"],
  // 422
  ["H", "G", "B", "C", "A", "F", "E", "K"],
  // 423
  ["H", "G", "B", "C", "A", "F", "E", "J"],
  // 424
  ["H", "G", "B", "C", "A", "F", "E", "I"],
  // 425
  ["I", "J", "B", "C", "A", "D", "L", "K"],
  // 426
  ["H", "J", "B", "C", "A", "D", "L", "K"],
  // 427
  ["H", "I", "B", "C", "A", "D", "L", "K"],
  // 428
  ["H", "J", "B", "C", "A", "D", "L", "I"],
  // 429
  ["H", "J", "B", "C", "A", "D", "I", "K"],
  // 430
  ["C", "J", "B", "D", "A", "G", "L", "K"],
  // 431
  ["I", "G", "B", "C", "A", "D", "L", "K"],
  // 432
  ["C", "J", "B", "D", "A", "G", "L", "I"],
  // 433
  ["C", "J", "B", "D", "A", "G", "I", "K"],
  // 434
  ["H", "G", "B", "C", "A", "D", "L", "K"],
  // 435
  ["H", "G", "B", "C", "A", "D", "L", "J"],
  // 436
  ["H", "G", "B", "C", "A", "D", "J", "K"],
  // 437
  ["H", "G", "B", "C", "A", "D", "L", "I"],
  // 438
  ["H", "G", "B", "C", "A", "D", "I", "K"],
  // 439
  ["H", "G", "B", "C", "A", "D", "I", "J"],
  // 440
  ["C", "J", "B", "D", "A", "F", "L", "K"],
  // 441
  ["C", "I", "B", "D", "A", "F", "L", "K"],
  // 442
  ["C", "J", "B", "D", "A", "F", "L", "I"],
  // 443
  ["C", "J", "B", "D", "A", "F", "I", "K"],
  // 444
  ["H", "F", "B", "C", "A", "D", "L", "K"],
  // 445
  ["C", "J", "B", "D", "A", "F", "L", "H"],
  // 446
  ["H", "J", "B", "C", "A", "F", "D", "K"],
  // 447
  ["H", "F", "B", "C", "A", "D", "L", "I"],
  // 448
  ["H", "F", "B", "C", "A", "D", "I", "K"],
  // 449
  ["H", "J", "B", "C", "A", "F", "D", "I"],
  // 450
  ["C", "G", "B", "D", "A", "F", "L", "K"],
  // 451
  ["C", "G", "B", "D", "A", "F", "L", "J"],
  // 452
  ["C", "G", "B", "D", "A", "F", "J", "K"],
  // 453
  ["C", "G", "B", "D", "A", "F", "L", "I"],
  // 454
  ["C", "G", "B", "D", "A", "F", "I", "K"],
  // 455
  ["C", "G", "B", "D", "A", "F", "I", "J"],
  // 456
  ["C", "G", "B", "D", "A", "F", "L", "H"],
  // 457
  ["H", "G", "B", "C", "A", "F", "D", "K"],
  // 458
  ["H", "G", "B", "C", "A", "F", "D", "J"],
  // 459
  ["H", "G", "B", "C", "A", "F", "D", "I"],
  // 460
  ["E", "J", "B", "C", "A", "D", "L", "K"],
  // 461
  ["E", "I", "B", "C", "A", "D", "L", "K"],
  // 462
  ["E", "J", "B", "C", "A", "D", "L", "I"],
  // 463
  ["E", "J", "B", "C", "A", "D", "I", "K"],
  // 464
  ["H", "E", "B", "C", "A", "D", "L", "K"],
  // 465
  ["H", "J", "B", "C", "A", "D", "L", "E"],
  // 466
  ["H", "J", "B", "C", "A", "D", "E", "K"],
  // 467
  ["H", "E", "B", "C", "A", "D", "L", "I"],
  // 468
  ["H", "E", "B", "C", "A", "D", "I", "K"],
  // 469
  ["H", "J", "B", "C", "A", "D", "E", "I"],
  // 470
  ["E", "G", "B", "C", "A", "D", "L", "K"],
  // 471
  ["E", "G", "B", "C", "A", "D", "L", "J"],
  // 472
  ["E", "G", "B", "C", "A", "D", "J", "K"],
  // 473
  ["E", "G", "B", "C", "A", "D", "L", "I"],
  // 474
  ["E", "G", "B", "C", "A", "D", "I", "K"],
  // 475
  ["E", "G", "B", "C", "A", "D", "I", "J"],
  // 476
  ["H", "G", "B", "C", "A", "D", "L", "E"],
  // 477
  ["H", "G", "B", "C", "A", "D", "E", "K"],
  // 478
  ["H", "G", "B", "C", "A", "D", "E", "J"],
  // 479
  ["H", "G", "B", "C", "A", "D", "E", "I"],
  // 480
  ["C", "E", "B", "D", "A", "F", "L", "K"],
  // 481
  ["C", "J", "B", "D", "A", "F", "L", "E"],
  // 482
  ["C", "J", "B", "D", "A", "F", "E", "K"],
  // 483
  ["C", "E", "B", "D", "A", "F", "L", "I"],
  // 484
  ["C", "E", "B", "D", "A", "F", "I", "K"],
  // 485
  ["C", "J", "B", "D", "A", "F", "E", "I"],
  // 486
  ["H", "F", "B", "C", "A", "D", "L", "E"],
  // 487
  ["H", "E", "B", "C", "A", "F", "D", "K"],
  // 488
  ["H", "J", "B", "C", "A", "F", "D", "E"],
  // 489
  ["H", "E", "B", "C", "A", "F", "D", "I"],
  // 490
  ["C", "G", "B", "D", "A", "F", "L", "E"],
  // 491
  ["C", "G", "B", "D", "A", "F", "E", "K"],
  // 492
  ["C", "G", "B", "D", "A", "F", "E", "J"],
  // 493
  ["C", "G", "B", "D", "A", "F", "E", "I"],
  // 494
  ["H", "G", "B", "C", "A", "F", "D", "E"]
  // 495
];

// src/domain/bracket/seed-third-places.ts
var QUALIFYING_THIRDS = 8;
var COLUMN_MATCH_IDS = ["M79", "M85", "M81", "M74", "M82", "M77", "M87", "M80"];
function groupSetKey(groups) {
  return [...groups].sort().join("");
}
var TABLE_INDEX = buildTableIndex();
function buildTableIndex() {
  const index = /* @__PURE__ */ new Map();
  for (const row of THIRD_PLACE_TABLE) {
    setOnce(index, groupSetKey(row), row, "Annexe C-kombination");
  }
  return index;
}
function validateQualifyingGroups(qualifyingThirds) {
  if (qualifyingThirds.length !== QUALIFYING_THIRDS) {
    throw new Error(
      `Seedning av b\xE4sta treor kr\xE4ver exakt ${QUALIFYING_THIRDS} grupper, fick ${qualifyingThirds.length}.`
    );
  }
  const valid = new Set(GROUP_IDS);
  const unique = /* @__PURE__ */ new Set();
  for (const group of qualifyingThirds) {
    if (!valid.has(group)) {
      throw new Error(`Ogiltigt grupp-id i seedningen: "${group}" (giltiga \xE4r A-L).`);
    }
    if (unique.has(group)) {
      throw new Error(`Dubblerad grupp i seedningen: "${group}".`);
    }
    unique.add(group);
  }
  return qualifyingThirds;
}
function seedThirdPlaces(qualifyingThirds) {
  const groups = validateQualifyingGroups(qualifyingThirds);
  const row = TABLE_INDEX.get(groupSetKey(groups));
  if (!row) {
    throw new Error(
      `Kombinationen ${groupSetKey(groups)} saknas i FIFA:s Annexe C-tabell (ov\xE4ntat).`
    );
  }
  return THIRD_PLACE_COLUMN_WINNERS.map((winnerGroup, i) => ({
    matchId: COLUMN_MATCH_IDS[i],
    winnerGroup,
    thirdPlaceGroup: row[i]
  }));
}

// src/domain/bracket/rank-third-places.ts
function compareThirds(a, b) {
  const sa = a.standing;
  const sb = b.standing;
  if (sa.points !== sb.points) {
    return sb.points - sa.points;
  }
  if (sa.goalDifference !== sb.goalDifference) {
    return sb.goalDifference - sa.goalDifference;
  }
  if (sa.goalsFor !== sb.goalsFor) {
    return sb.goalsFor - sa.goalsFor;
  }
  return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
}
function rankThirdPlaces(tables) {
  const thirds = [];
  for (const table of tables) {
    const third = table.standings.find((row) => row.rank === 3);
    if (third) {
      thirds.push({ group: table.groupId, standing: third });
    }
  }
  return [...thirds].sort(compareThirds);
}
function computeThirdPlaceRanking(tables) {
  const ranked = rankThirdPlaces(tables);
  const qualified = ranked.slice(0, QUALIFYING_THIRDS);
  const rankedGroups = new Set(ranked.map((t) => t.group));
  const allGroupsPresent = GROUP_IDS.every((g) => rankedGroups.has(g));
  const qualifyingGroups = allGroupsPresent ? [...qualified.map((t) => t.group)].sort() : null;
  return { ranked, qualified, qualifyingGroups };
}

// src/domain/bracket/preliminary-third-seeding.ts
function preliminaryThirdSeeding(tables) {
  const ranked = rankThirdPlaces(tables);
  const rankedGroups = new Set(ranked.map((t) => t.group));
  const allGroupsPresent = GROUP_IDS.every((g) => rankedGroups.has(g));
  if (!allGroupsPresent) {
    return /* @__PURE__ */ new Map();
  }
  const qualifyingGroups = [...ranked.slice(0, QUALIFYING_THIRDS).map((t) => t.group)].sort();
  const byMatchId = /* @__PURE__ */ new Map();
  for (const assignment of seedThirdPlaces(qualifyingGroups)) {
    byMatchId.set(assignment.matchId, assignment.thirdPlaceGroup);
  }
  return byMatchId;
}

// src/features/bracket/derive-bracket.ts
function winnerLabel(group) {
  return `1:a grupp ${group}`;
}
function runnerUpLabel(group) {
  return `2:a grupp ${group}`;
}
function bestThirdLabel(groups) {
  return `3:a ${groups.join("/")}`;
}
function matchWinnerLabel(matchId) {
  return `Vinnare ${matchId}`;
}
function matchLoserLabel(matchId) {
  return `F\xF6rlorare ${matchId}`;
}
var MATCHES_PER_TEAM = 3;
function isGroupStageComplete(tables) {
  const presentGroups = new Set(tables.map((t) => t.groupId));
  if (!GROUP_IDS.every((g) => presentGroups.has(g))) {
    return false;
  }
  return tables.every(
    (t) => t.standings.length > 0 && t.standings.every((row) => row.played >= MATCHES_PER_TEAM)
  );
}
function tableOf(tablesByGroup, group) {
  return tablesByGroup.get(group);
}
function teamAtRank(table, rank) {
  return table?.standings.find((r) => r.rank === rank)?.teamId ?? null;
}
function resolveGroupSlot(table, rank, label, groupComplete) {
  if (groupComplete) {
    const teamId2 = teamAtRank(table, rank);
    return { resolution: "resolved", label, teamId: teamId2, candidateTeamIds: [] };
  }
  const candidateTeamIds = table ? table.standings.map((r) => r.teamId) : [];
  const preliminaryTeamId = teamAtRank(table, rank);
  if (preliminaryTeamId !== null) {
    return { resolution: "preliminary", label, teamId: preliminaryTeamId, candidateTeamIds };
  }
  return { resolution: "possible", label, teamId: null, candidateTeamIds };
}
function resolveBestThirdSlot(eligibleGroups, seededTeamId, preliminaryThirdTeamId, tablesByGroup, groupComplete) {
  const label = bestThirdLabel(eligibleGroups);
  if (groupComplete && seededTeamId !== null) {
    return { resolution: "resolved", label, teamId: seededTeamId, candidateTeamIds: [] };
  }
  const candidateTeamIds = [];
  for (const group of eligibleGroups) {
    const third = teamAtRank(tableOf(tablesByGroup, group), 3);
    if (third !== null) {
      candidateTeamIds.push(third);
    }
  }
  if (preliminaryThirdTeamId !== null) {
    return {
      resolution: "preliminary",
      label,
      teamId: preliminaryThirdTeamId,
      candidateTeamIds
    };
  }
  return { resolution: "possible", label, teamId: null, candidateTeamIds };
}
function resolveMatchProgressionSlot(feederMatchId, wantWinner, outcomeByMatchId, slotStateById, label) {
  const outcome = outcomeByMatchId.get(feederMatchId);
  if (outcome) {
    const teamId2 = wantWinner ? outcome.winnerTeamId : outcome.loserTeamId;
    return { resolution: "resolved", label, teamId: teamId2, candidateTeamIds: [] };
  }
  const home = slotStateById.get(`${feederMatchId}-home`);
  const away = slotStateById.get(`${feederMatchId}-away`);
  const candidateTeamIds = [home?.teamId, away?.teamId].filter((id) => id != null);
  return {
    resolution: candidateTeamIds.length > 0 ? "possible" : "tbd",
    label,
    teamId: null,
    candidateTeamIds
  };
}
function outcomeOf(match, homeTeamId, awayTeamId) {
  if (match.status !== "finished" || homeTeamId === null || awayTeamId === null) {
    return null;
  }
  const { homeGoals, awayGoals, penalties } = match.result;
  if (homeGoals > awayGoals) {
    return { winnerTeamId: homeTeamId, loserTeamId: awayTeamId };
  }
  if (awayGoals > homeGoals) {
    return { winnerTeamId: awayTeamId, loserTeamId: homeTeamId };
  }
  if (penalties && penalties.homeGoals !== penalties.awayGoals) {
    return penalties.homeGoals > penalties.awayGoals ? { winnerTeamId: homeTeamId, loserTeamId: awayTeamId } : { winnerTeamId: awayTeamId, loserTeamId: homeTeamId };
  }
  return null;
}
function deriveBracket(tables, matches) {
  const nodes = buildBracket();
  const tablesByGroup = new Map(tables.map((t) => [t.groupId, t]));
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const groupComplete = isGroupStageComplete(tables);
  const thirdByMatchId = /* @__PURE__ */ new Map();
  if (groupComplete) {
    const { qualifyingGroups } = computeThirdPlaceRanking(tables);
    if (qualifyingGroups) {
      for (const assignment of seedThirdPlaces(qualifyingGroups)) {
        const teamId2 = teamAtRank(tableOf(tablesByGroup, assignment.thirdPlaceGroup), 3);
        if (teamId2 !== null) {
          thirdByMatchId.set(assignment.matchId, teamId2);
        }
      }
    }
  }
  const preliminaryThirdByMatchId = /* @__PURE__ */ new Map();
  if (!groupComplete) {
    for (const [matchId, group] of preliminaryThirdSeeding(tables)) {
      const teamId2 = teamAtRank(tableOf(tablesByGroup, group), 3);
      if (teamId2 !== null) {
        preliminaryThirdByMatchId.set(matchId, teamId2);
      }
    }
  }
  const slotStateById = /* @__PURE__ */ new Map();
  const outcomeByMatchId = /* @__PURE__ */ new Map();
  const matchStates = [];
  const nodesByMatch = /* @__PURE__ */ new Map();
  const matchOrder = [];
  for (const node of nodes) {
    let pair = nodesByMatch.get(node.matchId);
    if (!pair) {
      pair = {};
      nodesByMatch.set(node.matchId, pair);
      matchOrder.push(node.matchId);
    }
    pair[node.side] = node;
  }
  for (const matchId of matchOrder) {
    const pair = nodesByMatch.get(matchId);
    const homeNode = pair.home;
    const awayNode = pair.away;
    const homeState = buildSlotState(
      homeNode,
      thirdByMatchId,
      preliminaryThirdByMatchId,
      tablesByGroup,
      outcomeByMatchId,
      slotStateById,
      groupComplete
    );
    const awayState = buildSlotState(
      awayNode,
      thirdByMatchId,
      preliminaryThirdByMatchId,
      tablesByGroup,
      outcomeByMatchId,
      slotStateById,
      groupComplete
    );
    slotStateById.set(homeState.id, homeState);
    slotStateById.set(awayState.id, awayState);
    const match = matchById.get(matchId);
    let winnerSlotId = null;
    if (match) {
      const outcome = outcomeOf(match, homeState.teamId, awayState.teamId);
      if (outcome) {
        outcomeByMatchId.set(matchId, outcome);
        winnerSlotId = outcome.winnerTeamId === homeState.teamId ? homeState.id : awayState.id;
      }
    }
    matchStates.push({
      matchId,
      stage: homeNode.stage,
      home: homeState,
      away: awayState,
      winnerSlotId
    });
  }
  const preliminary = !groupComplete && matchStates.some(
    (m) => m.home.resolution === "preliminary" || m.away.resolution === "preliminary"
  );
  return { matches: matchStates, locked: groupComplete, preliminary };
}
function buildSlotState(node, thirdByMatchId, preliminaryThirdByMatchId, tablesByGroup, outcomeByMatchId, slotStateById, groupComplete) {
  const base = {
    id: node.id,
    matchId: node.matchId,
    side: node.side,
    stage: node.stage,
    nextSlotId: node.nextSlotId
  };
  const source = node.source;
  let resolved;
  switch (source.kind) {
    case "group-winner":
      resolved = resolveGroupSlot(
        tableOf(tablesByGroup, source.group),
        1,
        winnerLabel(source.group),
        groupComplete
      );
      break;
    case "group-runner-up":
      resolved = resolveGroupSlot(
        tableOf(tablesByGroup, source.group),
        2,
        runnerUpLabel(source.group),
        groupComplete
      );
      break;
    case "best-third":
      resolved = resolveBestThirdSlot(
        source.eligibleGroups,
        thirdByMatchId.get(node.matchId) ?? null,
        preliminaryThirdByMatchId.get(node.matchId) ?? null,
        tablesByGroup,
        groupComplete
      );
      break;
    case "match-winner":
      resolved = resolveMatchProgressionSlot(
        source.matchId,
        true,
        outcomeByMatchId,
        slotStateById,
        matchWinnerLabel(source.matchId)
      );
      break;
    case "match-loser":
      resolved = resolveMatchProgressionSlot(
        source.matchId,
        false,
        outcomeByMatchId,
        slotStateById,
        matchLoserLabel(source.matchId)
      );
      break;
  }
  return { ...base, ...resolved };
}

// src/features/results/validate-result.ts
var ALLOWED_TRANSITIONS = {
  scheduled: ["scheduled", "live", "finished"],
  live: ["scheduled", "live", "finished"],
  finished: ["scheduled", "live", "finished"]
};
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}
function isKnockoutStage(stage) {
  return stage !== "group";
}
function validatePenaltiesRequired(entry, errors) {
  const p = entry.penalties;
  if (!p || p.homeGoals === null || p.awayGoals === null) {
    errors.push({
      code: "knockout-tie-needs-penalties",
      field: "penalties",
      message: "Slutspelsmatch med lika st\xE4llning m\xE5ste avg\xF6ras p\xE5 straffar, ange straffm\xE5l f\xF6r b\xE5da lagen."
    });
    return;
  }
  if (!isNonNegativeInteger(p.homeGoals)) {
    errors.push({
      code: "penalties-home-not-integer",
      field: "penalties",
      message: "Hemmalagets straffm\xE5l m\xE5ste vara ett heltal som \xE4r noll eller st\xF6rre."
    });
  }
  if (!isNonNegativeInteger(p.awayGoals)) {
    errors.push({
      code: "penalties-away-not-integer",
      field: "penalties",
      message: "Bortalagets straffm\xE5l m\xE5ste vara ett heltal som \xE4r noll eller st\xF6rre."
    });
  }
  if (isNonNegativeInteger(p.homeGoals) && isNonNegativeInteger(p.awayGoals) && p.homeGoals === p.awayGoals) {
    errors.push({
      code: "knockout-tie-needs-penalties",
      field: "penalties",
      message: "Straffarna m\xE5ste utse en vinnare, de kan inte sluta lika."
    });
  }
}
function validateResultEntry(current, entry, stage = "group") {
  const errors = [];
  if (!ALLOWED_TRANSITIONS[current].includes(entry.status)) {
    errors.push({
      code: "invalid-status-transition",
      field: "status",
      message: `Ogiltig status\xF6verg\xE5ng: en match kan inte g\xE5 fr\xE5n ${current} till ${entry.status}.`
    });
  }
  if (entry.homeGoals !== null && !isNonNegativeInteger(entry.homeGoals)) {
    errors.push({
      code: entry.homeGoals < 0 ? "home-negative" : "home-not-integer",
      field: "home",
      message: "Hemmam\xE5l m\xE5ste vara ett heltal som \xE4r noll eller st\xF6rre."
    });
  }
  if (entry.awayGoals !== null && !isNonNegativeInteger(entry.awayGoals)) {
    errors.push({
      code: entry.awayGoals < 0 ? "away-negative" : "away-not-integer",
      field: "away",
      message: "Bortam\xE5l m\xE5ste vara ett heltal som \xE4r noll eller st\xF6rre."
    });
  }
  const hasAnyGoal = entry.homeGoals !== null || entry.awayGoals !== null;
  const hasBothGoals = entry.homeGoals !== null && entry.awayGoals !== null;
  if (entry.status === "finished" && !hasBothGoals) {
    errors.push({
      code: "finished-without-result",
      field: "result",
      message: "En spelad match kr\xE4ver b\xE5de hemma- och bortam\xE5l."
    });
  }
  if (entry.status !== "finished" && hasAnyGoal) {
    errors.push({
      code: "result-without-finished",
      field: "result",
      message: "Bara en spelad (finished) match f\xE5r ha ett resultat. S\xE4tt status till spelad f\xF6rst."
    });
  }
  const penaltiesProvided = entry.penalties != null && (entry.penalties.homeGoals !== null || entry.penalties.awayGoals !== null);
  const ordinaryGoalsValid = hasBothGoals && isNonNegativeInteger(entry.homeGoals) && isNonNegativeInteger(entry.awayGoals);
  const isLevelOrdinary = ordinaryGoalsValid && entry.homeGoals === entry.awayGoals;
  const penaltiesRequired = isKnockoutStage(stage) && entry.status === "finished" && isLevelOrdinary;
  const penaltiesDefinitelyNotApplicable = !isKnockoutStage(stage) || ordinaryGoalsValid && !isLevelOrdinary;
  if (penaltiesRequired) {
    validatePenaltiesRequired(entry, errors);
  } else if (penaltiesProvided && penaltiesDefinitelyNotApplicable) {
    errors.push({
      code: "penalties-not-applicable",
      field: "penalties",
      message: "Straffar g\xE4ller bara en slutspelsmatch som slutat lika i ordinarie tid. Ta bort straffm\xE5len."
    });
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
function toMatchResult(entry) {
  if (entry.homeGoals === null || entry.awayGoals === null) {
    throw new Error(
      "toMatchResult anropad utan b\xE4gge m\xE5ltal, validera med validateResultEntry f\xF6rst."
    );
  }
  const result = { homeGoals: entry.homeGoals, awayGoals: entry.awayGoals };
  const p = entry.penalties;
  if (p != null && p.homeGoals !== null && p.awayGoals !== null) {
    result.penalties = { homeGoals: p.homeGoals, awayGoals: p.awayGoals };
  }
  return result;
}

// src/features/results/apply-match-result.ts
function toCommon(match) {
  return {
    id: match.id,
    stage: match.stage,
    groupId: match.groupId,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    kickoff: match.kickoff,
    venue: match.venue,
    tvChannel: match.tvChannel,
    trivia: match.trivia
  };
}
function buildMatch(common, entry) {
  if (entry.status === "finished") {
    return { ...common, status: "finished", result: toMatchResult(entry) };
  }
  if (entry.status === "live") {
    return { ...common, status: "live", result: null };
  }
  return { ...common, status: "scheduled", result: null };
}
function applyMatchResult(matches, matchId, entry) {
  const target = matches.find((m) => m.id === matchId);
  if (!target) {
    throw new Error(`applyMatchResult: ingen match med id "${matchId}" finns i listan.`);
  }
  const validation = validateResultEntry(target.status, entry, target.stage);
  if (!validation.ok) {
    const codes = validation.errors.map((e) => e.code).join(", ");
    throw new Error(`applyMatchResult: ogiltig inmatning f\xF6r match "${matchId}" (${codes}).`);
  }
  const common = toCommon(target);
  const updated = buildMatch(common, entry);
  return matches.map((m) => m.id === matchId ? updated : m);
}

// src/features/results/apply-room-results.ts
function toEntry(result) {
  if (result.status !== "finished") {
    return { homeGoals: null, awayGoals: null, status: result.status, penalties: null };
  }
  return {
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    status: "finished",
    penalties: result.penalties ? { homeGoals: result.penalties.homeGoals, awayGoals: result.penalties.awayGoals } : null
  };
}
function applyRoomResults(matches, roomResults) {
  if (roomResults.length === 0) {
    return matches;
  }
  const knownIds = new Set(matches.map((m) => m.id));
  let next = matches;
  for (const result of roomResults) {
    if (!knownIds.has(result.matchId)) {
      continue;
    }
    try {
      next = applyMatchResult(next, result.matchId, toEntry(result));
    } catch {
    }
  }
  return next;
}

// src/domain/team-code.ts
var TEAM_CODE_PATTERN = /^[A-Z]{3}$/;
function teamCode(value) {
  if (!TEAM_CODE_PATTERN.test(value)) {
    throw new Error(
      `[VM2026] Ogiltig lag-code "${value}": m\xE5ste vara en versal FIFA-trebokstavskod (^[A-Z]{3}$, t.ex. "BRA").`
    );
  }
  return value;
}

// src/data/bots/prng.ts
function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = state + 1831565813 >>> 0;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// src/data/bots/seed-bracket-slots.ts
var DEFAULT_SEED_BRACKET_CONFIG = {
  favoriteCap: 0.85,
  replaceInvalid: true
};
function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
function pickAdvancingTeam(slot, skillTier, rng, config) {
  const pFavorite = 0.5 + clamp01(skillTier) * (config.favoriteCap - 0.5);
  return rng() < pFavorite ? slot.favorite : slot.underdog;
}
function validateConfig(config) {
  if (!(config.favoriteCap > 0.5 && config.favoriteCap < 1)) {
    throw new Error(
      `[VM2026] favoriteCap (${config.favoriteCap}) m\xE5ste ligga i intervallet (0.5, 1): > 0.5 s\xE5 favoriten faktiskt favoriseras, < 1 s\xE5 ingen bot blir perfekt.`
    );
  }
}
function selectSeedableSlots(bracket, teams, matches, now) {
  const nowMs = now.getTime();
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const kickoffById = new Map(matches.map((m) => [m.id, m.kickoff]));
  const out = [];
  for (const match of bracket.matches) {
    const homeKnown = match.home.resolution === "resolved" && match.home.teamId !== null;
    const awayKnown = match.away.resolution === "resolved" && match.away.teamId !== null;
    if (!homeKnown || !awayKnown) {
      continue;
    }
    const kickoff = kickoffById.get(match.matchId);
    const locked = kickoff === void 0 || nowMs >= new Date(kickoff).getTime();
    if (locked) {
      continue;
    }
    const home = teamById.get(match.home.teamId);
    const away = teamById.get(match.away.teamId);
    if (home === void 0 || away === void 0) {
      continue;
    }
    const [favorite, underdog] = rankByStrength(home, away);
    out.push({
      slotId: match.matchId,
      stage: match.stage,
      favorite: teamCode(favorite.code),
      underdog: teamCode(underdog.code)
    });
  }
  return out;
}
function rankByStrength(a, b) {
  const ra = a.fifaRanking ?? Number.POSITIVE_INFINITY;
  const rb = b.fifaRanking ?? Number.POSITIVE_INFINITY;
  if (ra < rb) return [a, b];
  if (rb < ra) return [b, a];
  return a.code <= b.code ? [a, b] : [b, a];
}
function rowKey(roomId, slotId2, userId) {
  return `${roomId}\0${slotId2}\0${userId}`;
}
function botSlotSeed(seedKey, slotId2) {
  let hash = 2166136261;
  const value = `${seedKey}#${slotId2}`;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function planBotBracketSeeding(input) {
  const config = input.config ?? DEFAULT_SEED_BRACKET_CONFIG;
  validateConfig(config);
  const botUserIds = new Set(input.bots.map((b) => b.userId));
  const existingByKey = /* @__PURE__ */ new Map();
  let nonBotExistingCount = 0;
  for (const row of input.existingBracket) {
    if (!botUserIds.has(row.userId)) {
      nonBotExistingCount += 1;
      continue;
    }
    existingByKey.set(rowKey(row.roomId, row.slotId, row.userId), row.advancingTeamId);
  }
  const rows = [];
  const bySlot = {};
  let missingFilled = 0;
  let invalidReplaced = 0;
  let alreadyValid = 0;
  let invalidLeft = 0;
  for (const bot of input.bots) {
    for (const slot of input.seedableSlots) {
      const key = rowKey(bot.roomId, slot.slotId, bot.userId);
      const existing = existingByKey.get(key);
      const valid = existing !== void 0 && (existing === slot.favorite || existing === slot.underdog);
      if (valid) {
        alreadyValid += 1;
        continue;
      }
      if (existing !== void 0 && !config.replaceInvalid) {
        invalidLeft += 1;
        continue;
      }
      const advancingTeamId = pickAdvancingTeam(
        slot,
        bot.skillTier,
        createRng(botSlotSeed(bot.seedKey, slot.slotId)),
        config
      );
      rows.push({ roomId: bot.roomId, slotId: slot.slotId, userId: bot.userId, advancingTeamId });
      bySlot[slot.slotId] = (bySlot[slot.slotId] ?? 0) + 1;
      if (existing === void 0) {
        missingFilled += 1;
      } else {
        invalidReplaced += 1;
      }
    }
  }
  for (const row of rows) {
    if (!botUserIds.has(row.userId)) {
      throw new Error(
        `[VM2026] AVBRYTER: seed-planen pekar p\xE5 ett icke-bot-id (${row.userId}). Bot-seedning f\xE5r ALDRIG r\xF6ra riktiga spelares rader.`
      );
    }
  }
  return {
    rows,
    seedableSlots: [...input.seedableSlots],
    nonBotExistingCount,
    summary: {
      seedableSlots: input.seedableSlots.length,
      bots: input.bots.length,
      rowsToWrite: rows.length,
      missingFilled,
      invalidReplaced,
      alreadyValid,
      invalidLeft,
      bySlot
    }
  };
}

// src/data/select-all-pages.ts
var DEFAULT_PAGE_SIZE = 1e3;
async function selectAllPages(fetchPage, label, pageSize = DEFAULT_PAGE_SIZE) {
  if (pageSize <= 0) {
    throw new Error(`selectAllPages(${label}): sidstorlek m\xE5ste vara > 0 (fick ${pageSize}).`);
  }
  const rows = [];
  let from = 0;
  let expectedTotal = null;
  for (; ; ) {
    const { rows: page, total } = await fetchPage({ from, to: from + pageSize - 1 });
    if (expectedTotal === null) {
      expectedTotal = total;
    }
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
    from += pageSize;
    if (rows.length > expectedTotal) {
      throw new Error(
        `selectAllPages(${label}): l\xE4ste ${rows.length} rader men k\xE4llan rapporterade ${expectedTotal} (over-read , trolig instabil ordning utan stabil ORDER BY). Avbryter hellre \xE4n att bygga en topplista p\xE5 dubblerad data.`
      );
    }
  }
  if (expectedTotal !== null && rows.length !== expectedTotal) {
    throw new Error(
      `selectAllPages(${label}): h\xE4mtade ${rows.length} rader men k\xE4llan rapporterade ${expectedTotal} (ofullst\xE4ndig/dubblerad l\xE4sning). Avbryter hellre \xE4n att returnera en felaktig topplista.`
    );
  }
  return rows;
}

// src/data/bots/bracket-seed-edge-entry.ts
var EMBEDDED_BRACKET_PLAN = {
  teams: WC2026_TEAMS,
  groups: WC2026_GROUPS,
  matches: WC2026_MATCHES
};
function planBotBracketSeedingFromDb(input) {
  const matches = applyRoomResults(EMBEDDED_BRACKET_PLAN.matches, [...input.officialResults]);
  const tables = deriveGroupTables(EMBEDDED_BRACKET_PLAN.groups, matches);
  const bracket = deriveBracket(tables, matches);
  const seedableSlots = selectSeedableSlots(
    bracket,
    EMBEDDED_BRACKET_PLAN.teams,
    matches,
    new Date(input.nowIso)
  );
  return planBotBracketSeeding({
    bots: input.bots,
    seedableSlots,
    existingBracket: input.existingBracket,
    config: input.config
  });
}
export {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SEED_BRACKET_CONFIG,
  EMBEDDED_BRACKET_PLAN,
  planBotBracketSeedingFromDb,
  selectAllPages
};
