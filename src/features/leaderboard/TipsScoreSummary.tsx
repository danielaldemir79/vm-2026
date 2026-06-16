// POÄNG-SUMMERING + KÄLL-DETALJ ÖVERST I TIPS-VYN (T58, #99). FUNKTIONELLT + a11y-lager
// (senior-dev); PREMIUM-FINISH (design-frontend) ovanpå data-attribut-seamen, ett lager.
//
// VARFÖR (Daniels live-feedback 2026-06-12): under "Tippa matcherna" syntes inga poäng
// och ingen summering, fast matcher avgjorts. Denna panel ger, ÖVERST i tips-sektionen:
//   1. Användarens TOTALA poäng + PLACERING (samma härledning som topplistan,
//      deriveSelfSummary, INGEN dubbelräkning).
//   2. En DETALJ-sektion: var totalpoängen kommer ifrån per källa (matchtips,
//      grupptippning, slutspelsträd, VM-vinnare), härledd ur SAMMA scoreMember-väg
//      (store.selfBreakdown -> buildSourceBreakdownRows), inte en omräkning.
//
// EN POÄNG-KÄLLA, INGEN DUBBELHÄMTNING: vyn LÄSER leaderboard-storen (samma
// LeaderboardProvider som topplistan, hoistad i App så tips-sektionen når den). Den
// hämtar inget eget, så summeringen här och topplistan längre ner kan aldrig drifta,
// och vi öppnar ingen andra fetch mot Supabase (HARD, #99).
//
// GATAR tyst: utan en egen rad (deriveSelfSummary null: ingen identitet / inte medlem)
// renderar panelen inget, hellre tyst än en gissad/fel rad (samma fail-safe som
// LeaderboardSummary, T46). Käll-detaljen visas bara när vi har en känd egen total.
//
// DESIGN ("skyltfönstret", design-frontend): panelen är Daniels skyltfönster, så den
// lyfts till en STOLT liten hero-panel i appens "arena i kvällsljus"-språk (SPEC §7).
// Totalen bärs av en SOLID guld-bricka med mörk ink (den färg-oberoende, AA-säkra
// solid-bricka-formen som .vm-coupon-mine/.vm-reveal-actual använder), placeringen av
// en lugn "#N"-bricka, och käll-raderna är lugna + skanbara. Hela utseendet bor i
// tokens.css §20 (.vm-tips-score-summary + syskon); strukturen här bär bara hakarna +
// semantiken. AA-mätt i båda teman (scripts/contrast-t58.mjs, decisions.md T58-visuellt).

import { useMemo } from 'react';
import { useLeaderboardStore } from './leaderboard-context';
import { deriveSelfSummary } from './self-summary';
import { buildSourceBreakdownRows } from './source-breakdown-rows';
import { buildBadgeRow } from './badge-row';

/** Formatera ett poängvärde med svensk "p"-enhet ("3 p"). EN formatering, stadiga tal. */
function formatPoints(points: number): string {
  return `${points} p`;
}

export function TipsScoreSummary() {
  const store = useLeaderboardStore();

  // Aktuell användares total + placering, plockad TROGET ur den rangordnade topplistan
  // (ingen omräkning, samma sanning som panelen vid topplistan).
  const summary = useMemo(
    () => deriveSelfSummary(store.leaderboard, store.currentUserId),
    [store.leaderboard, store.currentUserId]
  );

  // Käll-uppdelningen (match/grupp/slutspel/VM-vinnare), härledd ur SAMMA scoreMember-
  // väg (store.selfBreakdown). Raderna (ordning + etikett) bor i buildSourceBreakdownRows
  // (en sanning), och deras summa === totalen (mutations-vaktat i testet).
  const rows = useMemo(
    () => (store.selfBreakdown ? buildSourceBreakdownRows(store.selfBreakdown.bySource) : null),
    [store.selfBreakdown]
  );

  // MÄRKES-RADEN (T19, #19): streak + tjänade märken, härledda ur store.selfBadges (samma
  // tips + facit). Raderna (vilka + ordning + etikett) bor i buildBadgeRow (en sanning).
  // Tom lista = inga märken än -> hela raden utelämnas (hellre inget än en tom etikett).
  const badges = useMemo(() => buildBadgeRow(store.selfBadges), [store.selfBadges]);

  // Bara i ready-läge (samma gate som topplistan) OCH när vi kan peka ut en egen rad.
  const ready = store.enabled && store.status === 'ready';
  if (!ready || summary === null) {
    return null;
  }

  // mt-4 borttaget (Daniels spacing-feedback 2026-06-16): PredictionSection samlar nu
  // poäng-summeringen + statistik-panelen + tippnings-vyn i en `flex flex-col gap-4`,
  // så luften mot Panelens topp + nästa panel bärs av gap-behållaren (en sanning), inte
  // av ett toppmarginal-knep här. Panelen själv är oförändrad i sak.
  return (
    <div
      data-tips-score-summary=""
      data-rank={summary.rank}
      data-points={summary.points}
      className="vm-tips-score-summary flex flex-col gap-4 rounded-card p-4 sm:p-5"
    >
      {/* SKYLTFÖNSTRET: en liten eyebrow + "Dina poäng" till vänster, totalen + placeringen
          till höger , så ögat landar på "så här ligger JAG till" på en sekund. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          {/* EYEBROW: guld-TEXT-tonen (--color-warning, AA-säker per tema, ALDRIG rå
              --vm-gold som faller under AA som text på ljus yta). Dekorativ guld-glow
              lever i CSS-fonden; här bär texten läsbarhet -> warning-tonen. */}
          <p
            aria-hidden="true"
            className="font-display text-[0.625rem] font-bold uppercase leading-none tracking-[0.2em] text-warning"
          >
            Din ställning
          </p>
          <p className="m-0 font-display text-sm font-semibold leading-tight">Dina poäng</p>
        </div>

        {/* TOTAL + PLACERING. Hela meningen läses sammanhängande för skärmläsaren via
            den sr-only-texten i rank-elementet; de synliga brickorna bär samma besked
            för seende. tabular-nums så siffrorna inte hoppar när poängen tickar in. */}
        <div className="flex items-center gap-2.5">
          {/* PLACERINGS-BRICKAN. data-tips-summary-rank bär HELA meningen ("Plats N av M")
              som sr-only, så skärmläsaren får placeringen i ord och testet ser den exakta
              texten; visuellt visas "#N" som en lugn bricka + "av M" som dämpad text. */}
          <span
            data-tips-summary-rank=""
            className="inline-flex items-baseline gap-1.5 font-display text-sm font-semibold tabular-nums text-fg-muted"
          >
            <span className="sr-only">
              Plats {summary.rank} av {summary.totalMembers}
            </span>
            <span
              aria-hidden="true"
              className="vm-tips-summary-rank-badge rounded-pill px-2 py-1 text-[0.8125rem]"
            >
              #{summary.rank}
            </span>
            <span aria-hidden="true">av {summary.totalMembers}</span>
          </span>

          {/* TOTAL-BRICKAN: den STOLTA solida guld-brickan med mörk ink. Ögats första
              anhalt , "så många poäng har JAG". */}
          <span
            data-tips-summary-points=""
            className="vm-tips-summary-total rounded-pill px-3 py-1.5 text-base"
          >
            {formatPoints(summary.points)}
          </span>
        </div>
      </div>

      {/* KÄLL-DETALJ: var poängen kommer ifrån, per källa. Härledd ur selfBreakdown
          (samma scoreMember-väg), summan === totalen ovan. Renderas bara när vi har en
          uppdelning (selfBreakdown !== null); annars utelämnas detaljen (totalen kan
          ändå visas ur topplistan). Lugn och skanbar: en pyttig guld-marker + dämpad
          etikett + fg-poäng per rad. */}
      {rows !== null ? (
        <dl
          data-tips-source-breakdown=""
          className="vm-tips-source-list m-0 flex flex-col gap-2 pt-3 text-sm"
        >
          {rows.map((row) => (
            <div
              key={row.id}
              data-source-row={row.id}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="m-0 flex min-w-0 items-baseline gap-2 text-fg-muted">
                <span aria-hidden="true" className="vm-tips-source-marker translate-y-px" />
                <span className="truncate">{row.label}</span>
              </dt>
              <dd
                data-source-points=""
                className="m-0 font-display font-semibold tabular-nums text-fg"
              >
                {formatPoints(row.points)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* MÄRKES-RADEN (T19, #19): streak + tjänade märken som små brickor med titel. Bara
          när det FINNS minst ett märke (annars utelämnas raden helt, ingen tom etikett).
          Varje bricka bär sin förklaring som sr-only + title, så den är begriplig för
          både skärmläsare och vid hover. data-badge-row / data-badge = design/test-hakar. */}
      {badges.length > 0 ? (
        <ul
          data-badge-row=""
          className="vm-badge-row m-0 flex flex-wrap gap-2 p-0"
          aria-label="Dina märken"
        >
          {badges.map((badge) => (
            <li
              key={badge.id}
              data-badge={badge.id}
              title={badge.description}
              className="vm-badge inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 font-display text-[0.75rem] font-bold leading-none"
            >
              <span aria-hidden="true" className="vm-badge-marker translate-y-px" />
              <span>{badge.label}</span>
              {/* Rent kolon i sr-only (review-F1): hus-stilens mellanslag-komma är en
                  DOC-konvention, skärmläsare ska få naturlig interpunktion. */}
              <span className="sr-only">: {badge.description}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
