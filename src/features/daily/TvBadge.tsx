// TV-kanal-badge (PRESENTATIONS-komponent, ren): visar den svenska TV-kanalen
// som ett litet, kännbart märke i stället för en lös textrad.
//
// DESIGN (design-frontend, T7): en match ska gå att skumma. Kanalen är en av de
// första sakerna en tittare letar efter ("var ser jag den?"), så den får ett
// eget, igenkännbart märke med en liten "live-prick" och kanalens egen ton i
// stället för att gömmas i metadata-raden. Tonerna är MEDVETET dämpade
// färg-accenter: kanalens hue (en hex-literal, kanalens egen signaturfärg) bakas
// alltid ihop med en semantisk yt-token via color-mix (14 % mot --color-surface
// i bakgrunden, 38 % i kanten), så den RENDERADE färgen alltid är dämpad och
// följer temat, hex:en lyser aldrig rå rakt ut. Kontrasten hålls på fg-nivå så
// texten är AA i båda teman, kanalfärgen lever i kant + bakgrund + prick, aldrig
// i själva texten.
//
// A11y: matchkortets aria-label bär redan kanalnamnet i sin sammanfattning, så
// badgen är ett rent visuellt komplement. Den lilla pricken är aria-hidden.

import type { CSSProperties } from 'react';

/**
 * Kanal-ton per känd svensk kanal (SPEC §4: SVT + TV4). Returnerar en HUE: för
 * de kända kanalerna en hex-literal (kanalens egen signaturfärg), för okänt en
 * semantisk token (--color-fg). Hue:n används ALDRIG rakt av som färg, den bakas
 * alltid ihop med en semantisk yt-token via color-mix i TvBadge (se där), så den
 * RENDERADE färgen är dämpad och följer temat även om hue:n är en rå hex. Den
 * neutrala fallbacken gör att en framtida kanal (t.ex. en strömningstjänst) ändå
 * ser prydlig ut.
 */
function channelTone(channel: string): { hue: string } {
  const normalized = channel.toLowerCase();
  if (normalized.includes('svt')) {
    // SVT: en lugn blå-ton (public service-känsla), distinkt mot turnerings-grönt.
    return { hue: '#3f9ad6' };
  }
  if (normalized.includes('tv4')) {
    // TV4: en varm röd-ton (kanalens egen signal), distinkt mot SVT-blått.
    return { hue: '#e0564f' };
  }
  // Neutral fallback: bär fg-tonen, ingen kanalfärg.
  return { hue: 'var(--color-fg)' };
}

export interface TvBadgeProps {
  channel: string;
}

/**
 * Ett litet kanal-märke: "prick + kanalnamn" i en dämpad kanal-ton. Ren
 * presentation, ingen logik utöver ton-uppslaget ovan.
 */
export function TvBadge({ channel }: TvBadgeProps) {
  const { hue } = channelTone(channel);
  // Ton-stilen: hue:n lever i en svag bakgrunds-tvätt + kant + prick, men
  // TEXTEN hålls på full fg-kontrast (AA i båda teman, oavsett hue). Så märket
  // läses skarpt även när kanaltonen är ljus eller mörk.
  const style: CSSProperties = {
    backgroundColor: `color-mix(in srgb, ${hue} 14%, var(--color-surface))`,
    borderColor: `color-mix(in srgb, ${hue} 38%, transparent)`,
    color: 'var(--color-fg)',
  };
  const dotStyle: CSSProperties = {
    backgroundColor: hue,
  };

  return (
    <span
      data-tv-badge=""
      className="inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[0.6875rem] font-semibold leading-none"
      style={style}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-pill" style={dotStyle} />
      {channel}
    </span>
  );
}
