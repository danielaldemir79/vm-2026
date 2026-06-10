// GENERERAD FIL, redigera inte för hand. Se scripts/generate-team-profiles.ts.
//
// VM 2026:s lag-profiler: FIFA-ranking, stjärnspelare och kuriosa per lag (48 lag).
// GENERERAD ur det committade källutdraget (team-profiles-source.txt) via den rena
// parsern (team-profiles-parser.ts), och VÄRDE-LÅST mot källan i CI
// (team-profiles-source.test.ts: regenerera-och-diffa + mutationstest + 48/48-täckning).
//
// KÄLLOR (gissas ALDRIG), hämtade 2026-06-10 (se preambeln i team-profiles-source.txt):
//   - FIFA-ranking: FIFA/Coca-Cola Men's World Ranking, OFFICIELLA aprilutgåvan
//     (publicerad 2026-04-01), verifierad mot ESPN + Wikipedia + whereig.com.
//   - Stjärnspelare: VM 2026:s slutgiltiga 26-mannatrupper (offentliggjorda 2026-06-02),
//     redaktionellt urval, men varje spelare bevisligen i truppen enligt källa.
//   - Kuriosa: verifierbara VM-fakta (antal tidigare slutspel + bästa placering),
//     ur Wikipedia "FIFA World Cup records and statistics".
//
// "BÄSTA SPELDRAGET" finns medvetet INTE här: subjektivt utan källa, utelämnat
// (Team.bestPlay förblir undefined). Profil-vyn använder FIFA-rankingen som
// styrke-signal i stället. Se docs/decisions.md (T10).
//
// Nyckeln är lag-ID (gemen FIFA-kod, samma id som teams.ts/matcher refererar).

import type { TeamProfileTable } from './team-profiles-parser';

/** Lag-profiler per lag-id (A-L-ordning), källånkrade. */
export const WC2026_TEAM_PROFILES: TeamProfileTable = {
  mex: {
    fifaRanking: 15,
    starPlayers: ['Raúl Jiménez', 'Santiago Giménez'],
    trivia:
      '17 tidigare VM-slutspel. Bäst: kvartsfinal (senast 1986, på hemmaplan). Värdnation 2026.',
  },
  rsa: {
    fifaRanking: 60,
    starPlayers: ['Evidence Makgopa', 'Lyle Foster'],
    trivia: '3 tidigare VM-slutspel. Bäst: gruppspel (värdnation 2010).',
  },
  kor: {
    fifaRanking: 25,
    starPlayers: ['Son Heung-min', 'Lee Jae-sung'],
    trivia: '11 tidigare VM-slutspel. Bäst: fjärdeplats (2002, på hemmaplan).',
  },
  cze: {
    fifaRanking: 41,
    starPlayers: ['Patrik Schick', 'Tomáš Souček'],
    trivia:
      '9 tidigare VM-slutspel (inkl. Tjeckoslovakien). Bäst: VM-final (silver 1934 och 1962).',
  },
  can: {
    fifaRanking: 30,
    starPlayers: ['Alphonso Davies', 'Jonathan David'],
    trivia: '2 tidigare VM-slutspel. Bäst: gruppspel. Värdnation 2026.',
  },
  bih: {
    fifaRanking: 65,
    starPlayers: ['Edin Džeko'],
    trivia: '1 tidigare VM-slutspel (2014). Bäst: gruppspel.',
  },
  qat: {
    fifaRanking: 55,
    starPlayers: ['Akram Afif', 'Almoez Ali'],
    trivia: '1 tidigare VM-slutspel (värdnation 2022). Bäst: gruppspel.',
  },
  sui: {
    fifaRanking: 19,
    starPlayers: ['Granit Xhaka', 'Breel Embolo'],
    trivia: '12 tidigare VM-slutspel. Bäst: kvartsfinal (1934, 1938, 1954).',
  },
  bra: {
    fifaRanking: 6,
    starPlayers: ['Neymar', 'Vinícius Júnior'],
    trivia:
      'Enda landet med i alla 22 VM-slutspel. Bäst: 5 VM-titlar (1958, 1962, 1970, 1994, 2002), flest av alla.',
  },
  mar: {
    fifaRanking: 8,
    starPlayers: ['Achraf Hakimi', 'Sofyan Amrabat'],
    trivia:
      '6 tidigare VM-slutspel. Bäst: fjärdeplats (2022), första afrikanska/arabiska semifinallag.',
  },
  hai: {
    fifaRanking: 83,
    starPlayers: ['Wilson Isidor', 'Jean-Ricner Bellegarde'],
    trivia: '1 tidigare VM-slutspel (1974). Bäst: gruppspel.',
  },
  sco: {
    fifaRanking: 43,
    starPlayers: ['Andy Robertson', 'Scott McTominay'],
    trivia: '8 tidigare VM-slutspel. Bäst: gruppspel (aldrig avancerat).',
  },
  usa: {
    fifaRanking: 16,
    starPlayers: ['Christian Pulisic'],
    trivia: '11 tidigare VM-slutspel. Bäst: tredjeplats (1930). Värdnation 2026.',
  },
  par: {
    fifaRanking: 40,
    starPlayers: ['Miguel Almirón'],
    trivia: '8 tidigare VM-slutspel. Bäst: kvartsfinal (2010).',
  },
  aus: {
    fifaRanking: 27,
    starPlayers: ['Jackson Irvine', 'Mathew Leckie'],
    trivia: '6 tidigare VM-slutspel. Bäst: åttondelsfinal (2006, 2022).',
  },
  tur: {
    fifaRanking: 22,
    starPlayers: ['Hakan Çalhanoğlu'],
    trivia: '2 tidigare VM-slutspel. Bäst: tredjeplats (2002).',
  },
  ger: {
    fifaRanking: 10,
    starPlayers: ['Florian Wirtz', 'Jamal Musiala'],
    trivia: '20 tidigare VM-slutspel. Bäst: 4 VM-titlar (1954, 1974, 1990, 2014).',
  },
  cuw: {
    fifaRanking: 82,
    starPlayers: ['Tahith Chong'],
    trivia: 'VM-debut 2026, minsta nation (i invånarantal) någonsin i ett VM-slutspel.',
  },
  civ: {
    fifaRanking: 34,
    starPlayers: ['Franck Kessié', 'Nicolas Pépé'],
    trivia: '3 tidigare VM-slutspel. Bäst: gruppspel.',
  },
  ecu: {
    fifaRanking: 23,
    starPlayers: ['Moisés Caicedo'],
    trivia: '4 tidigare VM-slutspel. Bäst: åttondelsfinal (2006).',
  },
  ned: {
    fifaRanking: 7,
    starPlayers: ['Virgil van Dijk', 'Frenkie de Jong'],
    trivia: '11 tidigare VM-slutspel. Bäst: VM-final tre gånger (silver 1974, 1978, 2010).',
  },
  jpn: {
    fifaRanking: 18,
    starPlayers: ['Takefusa Kubo', 'Wataru Endō'],
    trivia: '7 tidigare VM-slutspel. Bäst: åttondelsfinal (2002, 2010, 2018, 2022).',
  },
  swe: {
    fifaRanking: 38,
    starPlayers: ['Alexander Isak', 'Viktor Gyökeres'],
    trivia: '12 tidigare VM-slutspel. Bäst: VM-final (silver 1958, på hemmaplan).',
  },
  tun: {
    fifaRanking: 44,
    starPlayers: ['Hannibal Mejbri'],
    trivia: '6 tidigare VM-slutspel. Bäst: gruppspel.',
  },
  bel: {
    fifaRanking: 9,
    starPlayers: ['Kevin De Bruyne', 'Romelu Lukaku'],
    trivia: '14 tidigare VM-slutspel. Bäst: tredjeplats (2018).',
  },
  egy: {
    fifaRanking: 29,
    starPlayers: ['Mohamed Salah', 'Omar Marmoush'],
    trivia: '3 tidigare VM-slutspel. Bäst: gruppspel. Första afrikanska VM-laget (1934).',
  },
  irn: {
    fifaRanking: 21,
    starPlayers: ['Alireza Jahanbakhsh'],
    trivia: '6 tidigare VM-slutspel. Bäst: gruppspel.',
  },
  nzl: {
    fifaRanking: 85,
    starPlayers: ['Chris Wood'],
    trivia: '2 tidigare VM-slutspel. Bäst: gruppspel (obesegrade 2010, tre kryss).',
  },
  esp: {
    fifaRanking: 2,
    starPlayers: ['Lamine Yamal', 'Rodri'],
    trivia:
      '16 tidigare VM-slutspel. Bäst: VM-guld (2010), första VM-titeln vunnen av ett europeiskt lag utanför Europa.',
  },
  cpv: {
    fifaRanking: 69,
    starPlayers: ['Jovane Cabral', 'Garry Rodrigues'],
    trivia: 'VM-debut 2026. En av de minsta nationerna någonsin i ett VM-slutspel.',
  },
  ksa: {
    fifaRanking: 61,
    starPlayers: ['Salem Al-Dawsari'],
    trivia: '6 tidigare VM-slutspel. Bäst: åttondelsfinal (1994). Slog Argentina i premiären 2022.',
  },
  uru: {
    fifaRanking: 17,
    starPlayers: ['Federico Valverde', 'Darwin Núñez'],
    trivia: '14 tidigare VM-slutspel. Bäst: 2 VM-titlar (1930 som värd, 1950).',
  },
  fra: {
    fifaRanking: 1,
    starPlayers: ['Kylian Mbappé', "N'Golo Kanté"],
    trivia:
      '16 tidigare VM-slutspel. Bäst: 2 VM-titlar (1998 som värd, 2018). FIFA:s etta inför 2026.',
  },
  sen: {
    fifaRanking: 14,
    starPlayers: ['Sadio Mané', 'Idrissa Gana Gueye'],
    trivia: '3 tidigare VM-slutspel. Bäst: kvartsfinal (2002, i debuten).',
  },
  irq: {
    fifaRanking: 57,
    starPlayers: ['Zidane Iqbal'],
    trivia: '1 tidigare VM-slutspel (1986). Bäst: gruppspel.',
  },
  nor: {
    fifaRanking: 31,
    starPlayers: ['Erling Haaland', 'Martin Ødegaard'],
    trivia: '3 tidigare VM-slutspel. Bäst: åttondelsfinal (1998). Första VM sedan 1998.',
  },
  arg: {
    fifaRanking: 3,
    starPlayers: ['Lionel Messi', 'Enzo Fernández'],
    trivia:
      '18 tidigare VM-slutspel. Bäst: 3 VM-titlar (1978 som värd, 1986, 2022). Regerande mästare.',
  },
  alg: {
    fifaRanking: 28,
    starPlayers: ['Riyad Mahrez'],
    trivia: '4 tidigare VM-slutspel. Bäst: åttondelsfinal (2014).',
  },
  aut: {
    fifaRanking: 24,
    starPlayers: ['David Alaba', 'Christoph Baumgartner'],
    trivia: '7 tidigare VM-slutspel. Bäst: tredjeplats (1954).',
  },
  jor: {
    fifaRanking: 63,
    starPlayers: ['Mousa Al-Taamari'],
    trivia: 'VM-debut 2026.',
  },
  por: {
    fifaRanking: 5,
    starPlayers: ['Cristiano Ronaldo', 'Bruno Fernandes'],
    trivia:
      '8 tidigare VM-slutspel. Bäst: tredjeplats (1966). Ronaldo blir förste spelaren i sex VM.',
  },
  cod: {
    fifaRanking: 46,
    starPlayers: ['Aaron Wan-Bissaka'],
    trivia: '1 tidigare VM-slutspel (som Zaire 1974). Bäst: gruppspel.',
  },
  uzb: {
    fifaRanking: 50,
    starPlayers: ['Eldor Shomurodov'],
    trivia: 'VM-debut 2026.',
  },
  col: {
    fifaRanking: 13,
    starPlayers: ['James Rodríguez', 'Luis Díaz'],
    trivia: '6 tidigare VM-slutspel. Bäst: kvartsfinal (2014).',
  },
  eng: {
    fifaRanking: 4,
    starPlayers: ['Harry Kane', 'Jude Bellingham'],
    trivia: '16 tidigare VM-slutspel. Bäst: VM-guld (1966, på hemmaplan).',
  },
  cro: {
    fifaRanking: 11,
    starPlayers: ['Luka Modrić', 'Mateo Kovačić'],
    trivia: '6 tidigare VM-slutspel. Bäst: VM-final (silver 2018) och brons (2022).',
  },
  gha: {
    fifaRanking: 74,
    starPlayers: ['Thomas Partey', 'Jordan Ayew'],
    trivia: '4 tidigare VM-slutspel. Bäst: kvartsfinal (2010).',
  },
  pan: {
    fifaRanking: 33,
    starPlayers: ['Aníbal Godoy'],
    trivia: '1 tidigare VM-slutspel (2018). Bäst: gruppspel.',
  },
};
