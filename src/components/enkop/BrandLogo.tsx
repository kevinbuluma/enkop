// Cut-outs of the ENKOP logo in public/brand. "light" keeps the white parts white for dark
// backgrounds; "dark" paints them brand royal blue (#142B59) for light backgrounds. The gold (#C6A45A) is identical in both.
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

/** ENKOP with "Real Estate" set beneath it in gold, spaced to the name's width. */
function Words({ tone }: { tone: Tone }) {
  return <span className={`brand-words brand-words--${tone}`}><Art part="name" tone={tone} className="brand-name" /><span className="brand-tagline" aria-hidden="true">Real Estate</span></span>;
}

/** Horizontal lockup (building mark + ENKOP / Real Estate) for headers. With tone "auto" the header picks the variant. */
export function BrandLockup({ tone = 'auto', className = '' }: { tone?: Tone | 'auto'; className?: string }) {
  if (tone !== 'auto') {
    return <span className={`brand-lockup ${className}`}><Art part="mark" tone={tone} className="brand-mark" /><Words tone={tone} /></span>;
  }
  return <span className={`brand-lockup brand-lockup--auto ${className}`}>
    <span className="brand-tone brand-tone--dark"><Art part="mark" tone="dark" className="brand-mark" /><Words tone="dark" /></span>
    <span className="brand-tone brand-tone--light"><Art part="mark" tone="light" className="brand-mark" /><Words tone="light" /></span>
  </span>;
}

/** The full stacked logo: building mark, ENKOP and "Real Estate". */
export function BrandLogo({ tone, className = '' }: { tone: Tone; className?: string }) {
  return <Art part="logo" tone={tone} className={`brand-logo ${className}`} />;
}
