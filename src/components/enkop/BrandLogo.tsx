// Cut-outs of the ENKOP logo in public/brand. "light" keeps the white parts white for dark
// backgrounds; "dark" paints them brand navy for light backgrounds. The gold is identical in both.
const SIZES = {
  mark: { w: 222, h: 353 },
  name: { w: 566, h: 126 },
  logo: { w: 574, h: 566 },
} as const;

type Tone = 'light' | 'dark';

function Art({ part, tone, className }: { part: keyof typeof SIZES; tone: Tone; className?: string }) {
  const { w, h } = SIZES[part];
  return <img src={`/brand/enkop-${part}-${tone}.png`} alt="" width={w} height={h} className={className} decoding="async" draggable={false} />;
}

/** Horizontal lockup (building mark + ENKOP) for headers. With tone "auto" the parent's .brand--on-dark class picks the variant. */
export function BrandLockup({ tone = 'auto', className = '' }: { tone?: Tone | 'auto'; className?: string }) {
  if (tone !== 'auto') {
    return <span className={`brand-lockup ${className}`}><Art part="mark" tone={tone} className="brand-mark" /><Art part="name" tone={tone} className="brand-name" /></span>;
  }
  return <span className={`brand-lockup brand-lockup--auto ${className}`}>
    <span className="brand-tone brand-tone--dark"><Art part="mark" tone="dark" className="brand-mark" /><Art part="name" tone="dark" className="brand-name" /></span>
    <span className="brand-tone brand-tone--light"><Art part="mark" tone="light" className="brand-mark" /><Art part="name" tone="light" className="brand-name" /></span>
  </span>;
}

/** The full stacked logo: building mark, ENKOP and "Real Estate". */
export function BrandLogo({ tone, className = '' }: { tone: Tone; className?: string }) {
  return <Art part="logo" tone={tone} className={`brand-logo ${className}`} />;
}
