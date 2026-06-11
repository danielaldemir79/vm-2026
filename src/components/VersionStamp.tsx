// Version-stämpel (PRESENTATION, T43): en DISKRET rad som visar exakt vilket
// bygge som körs (kort commit-SHA + byggtid), så "är det live?" kan verifieras
// mot develop-HEAD i stället för att gissas (debug-agentens förbättring, #74).
//
// Värdena kommer från de bygg-injicerade konstanterna via app-version.ts (en
// sanning); utanför ett bygge (dev/test, ingen Vite define) visar den "dev".
// Diskret med flit: liten, dämpad text, monospace-känsla på SHA:n så den läses
// som en teknisk identifierare. data-app-version = stabil krok + testad semantik.

import { appCommitSha, formatBuiltAt } from '../pwa/app-version';

interface VersionStampProps {
  className?: string;
}

export function VersionStamp({ className = '' }: VersionStampProps) {
  const sha = appCommitSha();
  const builtAt = formatBuiltAt();

  return (
    <p
      data-app-version={sha}
      className={`text-xs text-fg-muted/80 ${className}`}
      // title ger hela byggtiden vid hover utan att tränga raden; värdena är
      // publika bygg-metadata (ingen hemlighet), det är hela poängen att de syns.
      title={builtAt ? `Byggd ${builtAt}` : undefined}
    >
      {/* "v" + SHA i tabular/mono-känsla så hashen är lätt att läsa av och jämföra
          mot develop. Byggtiden (om känd) följer efter en tunn separator. */}
      <span className="font-mono">v·{sha}</span>
      {builtAt ? <span className="text-fg-muted/70"> · {builtAt}</span> : null}
    </p>
  );
}
