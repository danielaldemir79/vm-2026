// EN sanning för vilket lag-NAMN som visas i ett TRÅNGT sammanhang (T50, #86).
//
// BAKGRUND (varför denna fil finns): de flesta lagnamn ryms i appens trånga ytor
// (grupptabellens lag-kolumn, matchkortets mitt-rad, slutspelsträdets celler), men
// några är för långa, framför allt "Bosnien och Hercegovina", som tryckte ihop
// grupptabellens övriga kolumner (Daniels live-feedback). Lösningen är ett VALFRITT
// `shortName`-fält på Team (domain/types.ts): det fulla namnet står kvar där det finns
// plats (lagprofilen), och de trånga ytorna visar det korta.
//
// Fallback-regeln (kort namn om satt, annars det vanliga namnet) bor HÄR, på ETT ställe,
// så varje trång yta kan importera samma regel i stället för att upprepa `?? name`-uttrycket
// (DRY). Då kan ett nytt långt lagnamn lösas genom att bara sätta `shortName` i lag-datan,
// utan att röra någon vy.

import type { Team } from './types';

/**
 * Det effektiva korta visningsnamnet för ett lag: `shortName` om laget satt ett
 * (för långa namn som "Bosnien och Hercegovina" -> "Bosnien"), annars det vanliga
 * `name`. Använd i TRÅNGA sammanhang (grupptabell, matchkort, slutspelsträd). Det
 * FULLA `name` visas där utrymme finns (lagprofilen), inte detta.
 *
 * Tar bara de fält som behövs (`Pick`), så även en mager lag-vy (t.ex. ett objekt
 * utan profil-fält) kan slå upp namnet utan att uppfylla hela Team.
 */
export function teamShortName(team: Pick<Team, 'name' | 'shortName'>): string {
  return team.shortName ?? team.name;
}
