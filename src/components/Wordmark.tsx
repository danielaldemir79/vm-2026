// VM 2026-wordmark. Distinkt typografisk lockup i display-typsnittet (Space
// Grotesk), inte en generisk logga. "VM" i tight, tung vikt + "2026" i accent-
// grön, åtskilda av en tunn vertikal delare , editorial sport-känsla.
//
// Renderas som ETT tillgängligt namn: skärmläsare hör "VM 2026", de visuella
// delarna är aria-hidden så uppdelningen inte läses styckevis.
//
// A11y-ROLL (T25, axe aria-prohibited-attr): `aria-label` är BARA tillåtet på element
// som tar ett tillgängligt namn. En <h1> gör det (rubrik), men en naken <span> har den
// generiska rollen som INTE tillåter aria-label (axe flaggar det skarpt, serious). När
// vi renderar som <span> sätter vi därför `role="img"` , det är det kanoniska mönstret
// för en stiliserad text-/bild-logga: rollen "img" bär aria-label som sitt namn och
// behandlar sina (redan aria-hidden) barn som rent presentationella. h1-varianten rör
// vi inte (rubriker namnges lagligt av aria-label).

interface WordmarkProps {
  /** Render som sid-rubrik (h1) eller som vanlig märkes-text i t.ex. en header. */
  as?: 'h1' | 'span';
  className?: string;
}

export function Wordmark({ as = 'span', className = '' }: WordmarkProps) {
  const Tag = as;
  // Bara span-varianten behöver en explicit roll för att lagligt bära aria-label;
  // h1 namnges redan giltigt som rubrik. (role på en h1 skulle dessutom skriva över
  // rubrik-semantiken, så vi sätter den ENBART på span.)
  const role = as === 'span' ? 'img' : undefined;
  return (
    <Tag
      role={role}
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
