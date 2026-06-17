// KURERADE kommentar-pooler för bot-liv-lagret (T82 del 2, #173). REN data, inget I/O.
//
// VARFÖR EGEN FIL: poolerna är ren kurerad copy (en sanning, lätt att läsa/justera) och
// hålls SKILDA från genererings-logiken (comment.ts), så texten kan finjusteras utan att
// röra logiken (PRINCIPLES §2, en fil ett ansvar).
//
// DESIGN (ägarens regel, HARD): naturliga, KORTA svenska fraser som beror på matchens
// UTFALL (mood) OCH personans TON , INTE mekaniska mallar som upprepas identiskt (det
// skulle se botigt/spammigt ut). Varje (mood, tone) har FLERA varianter, och boten väljer
// deterministiskt EN ur sin (mood, tone)-pool, så två botar i olika ton om samma match
// säger olika saker, och samma bot inte säger samma sak om varje match.
//
// SVENSKA (befordrad regel "Diakritik i svensk text"): korrekta å/ä/ö, naturligt talspråk.
// Inga em-dash i copy (global regel), komma eller punkt i stället.
//
// FÖLJD-FRASER (svar-approximation): room_comments har INGEN tråd-/svars-koppling (ingen
// parent_id, bekräftat i migrationen 20260612103836_t66 + 20260613144345_t77: bara en
// nullable match_id som delar in i match-trådar, ingen rad-till-rad-referens). En bot kan
// alltså inte peka ett "svar" på en SPECIFIK kommentar. Vi approximerar därför "svarar på
// varandra" som en kort FÖLJD-fras i SAMMA match-tråd (samma match_id), som läses som ett
// medhåll/replik i konversationen. Ärligt dokumenterat i decisions.md (T82 del 2).

import type { MatchMood } from './match-mood';
import type { BotTone } from './personas';

/** En (mood, tone)-uppslagstabell: flera korta varianter per kombination (variation). */
type MoodTonePools = Record<MatchMood, Record<BotTone, readonly string[]>>;

/**
 * Huvud-kommentarer: en bots FÖRSTA reaktion i en match-tråd, vald på (mood, tone). Korta,
 * vardagliga, varierade. Källa: kurerad copy (T82-designval, decisions.md), inte en extern
 * regel , det finns ingen "rätt" formulering att källåkra, så detta är ett medvetet val.
 */
export const COMMENT_POOLS: MoodTonePools = {
  goalfest: {
    peppig: ['Vilken målfest! 🤩', 'Sjukt roligt att titta på!', 'Mål i parti och minut!'],
    analytisk: [
      'Båda lagen släppte ytorna helt bakåt.',
      'Försvarsspel? Vad är det?',
      'Hög målproduktion, lågt försvarsfokus.',
    ],
    skämtsam: ['Målvakterna tog en fika va?', 'Någon glömde försvaret hemma.', 'Tennismatch typ.'],
    lugn: ['Mycket mål i den.', 'Underhållande match.', 'Det rullade in idag.'],
  },
  goalless: {
    peppig: ['Taktiskt och tight ändå!', 'Nollan höll, snyggt jobbat bak!'],
    analytisk: ['Bra defensiv struktur av båda.', 'Avgjordes i mittfältet, inte i boxen.'],
    skämtsam: ['Spännande som att se färg torka.', 'Nån som vaknade på slutet?'],
    lugn: ['Mållöst, men ok.', 'Tight match utan mål.'],
  },
  draw: {
    peppig: ['Rättvis poäng till båda!', 'Bra kämpat av båda lagen!'],
    analytisk: ['Jämn match, oavgjort var nog rätt.', 'Lika på mål och chanser.'],
    skämtsam: ['Alla nöjda, ingen nöjd.', 'En poäng var, dela snällt.'],
    lugn: ['Oavgjort kändes rimligt.', 'Jämnt skildes de åt.'],
  },
  thriller: {
    peppig: ['Vilken rysare!! 🔥', 'Hjärtat i halsgropen hela matchen!', 'Det var drama!'],
    analytisk: ['Avgjordes på marginaler.', 'Små detaljer skilde lagen åt.'],
    skämtsam: ['Jag höll på att tappa kaffet.', 'Nästan hjärtinfarkt här.'],
    lugn: ['Jämnt och nervöst in i slutet.', 'Spännande match.'],
  },
  comfortable: {
    peppig: ['Stabil seger, bra gjort!', 'Klassisk klasskillnad idag!'],
    analytisk: ['Övertygande, kontrollerade matchen.', 'Marginalen säger allt.'],
    skämtsam: ['Lite väl enkelt det där.', 'Den ena ville mer typ.'],
    lugn: ['Klar seger.', 'Det var aldrig nervöst.'],
  },
  narrow: {
    peppig: ['Vann ändå, det räknas!', 'Tre sköna poäng!'],
    analytisk: ['En chans avgjorde.', 'Effektivt, tog vara på sitt läge.'],
    skämtsam: ['1-0 till de tråkiga.', 'Fult men funkar.'],
    lugn: ['Knapp men klar.', 'Tog hem den till slut.'],
  },
};

/**
 * FÖLJD-fraser (svar-approximation, se modul-doc): korta medhålls-/repliker i samma
 * match-tråd. Tonade men mood-OBEROENDE (en replik håller med stämningen utan att upprepa
 * den), och medvetet GENERISKA + korta så de läses som "instämmer i tråden", inte som ett
 * eget påstående. Få varianter (de ska vara sällsynta).
 */
export const REPLY_POOLS: Record<BotTone, readonly string[]> = {
  peppig: ['Precis det jag tänkte! 🙌', 'Håller med fullständigt!', 'Ja precis!'],
  analytisk: ['Bra poäng faktiskt.', 'Ja, det stämmer.', 'Samma analys här.'],
  skämtsam: ['Haha precis.', 'Sant sant.', 'Du sa det.'],
  lugn: ['Instämmer.', 'Ja, så var det.', 'Mm, håller med.'],
};
