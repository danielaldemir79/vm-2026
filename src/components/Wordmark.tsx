// VM 2026-wordmark. Distinkt typografisk lockup i display-typsnittet (Space
// Grotesk), inte en generisk logga. "VM" i tight, tung vikt + "2026" i accent-
// grön, åtskilda av en tunn vertikal delare , editorial sport-känsla.
//
// Renderas som ETT tillgängligt namn: skärmläsare hör "VM 2026", de visuella
// delarna är aria-hidden så uppdelningen inte läses styckevis.

interface WordmarkProps {
  /** Render som sid-rubrik (h1) eller som vanlig märkes-text i t.ex. en header. */
  as?: 'h1' | 'span';
  className?: string;
}

export function Wordmark({ as = 'span', className = '' }: WordmarkProps) {
  const Tag = as;
  return (
    <Tag
      aria-label="VM 2026"
      className={`inline-flex items-center gap-2.5 font-display font-bold tracking-tight ${className}`}
    >
      <span aria-hidden="true">VM</span>
      <span aria-hidden="true" className="h-[0.9em] w-px bg-border" />
      <span aria-hidden="true" className="text-accent">
        2026
      </span>
    </Tag>
  );
}
