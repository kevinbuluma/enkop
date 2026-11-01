import { useId, type CSSProperties } from 'react';

/**
 * A small sculpted snowman: three packed-snow spheres with roughened edges and grain, coal eyes and buttons,
 * a carrot nose, twig arms and a scarf in ENKOP royal blue or gold. Colours come from design tokens.
 * Variants change scarf, hat and pose.
 */
export function MiniSnowman({ variant, style }: { variant: number; style?: CSSProperties }) {
  const id = useId().replace(/:/g, '');
  const v = variant % 4;
  const scarf = v === 1 || v === 3 ? 'var(--gold)' : 'var(--royal)';
  const stripe = v === 1 || v === 3 ? 'var(--royal)' : 'var(--gold)';
  const snow = `url(#${id}-snow)`;
  return <div className={`mini-snowman mini-snowman--${v}`} style={style}>
    <svg className="mini-snowman-figure" viewBox="0 0 60 84" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-snow`} cx="0.36" cy="0.3" r="0.78">
          <stop offset="0" stopColor="var(--snow-highlight)" />
          <stop offset="0.5" stopColor="var(--snow-body)" />
          <stop offset="0.82" stopColor="var(--snow-shade)" />
          <stop offset="1" stopColor="var(--snow-deep)" />
        </radialGradient>
        <linearGradient id={`${id}-carrot`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--carrot)" />
          <stop offset="1" stopColor="var(--carrot-tip)" />
        </linearGradient>
        <filter id={`${id}-rough`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed={3 + v} result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="shape" />
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed={9 + v} result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.52  0 0 0 0 0.66  0 0 0 -1.6 1.05" result="speck" />
          <feComposite in="speck" in2="shape" operator="in" result="specks" />
          <feMerge><feMergeNode in="shape" /><feMergeNode in="specks" /></feMerge>
        </filter>
        <filter id={`${id}-shadow`} x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="1.6" /></filter>
      </defs>
      <ellipse cx="31" cy="80.5" rx="19" ry="3.2" fill="var(--snow-contact)" filter={`url(#${id}-shadow)`} />
      {/* Twig arms */}
      <g className="mini-snowman-arms" stroke="var(--twig)" strokeLinecap="round" fill="none">
        {v === 3 ? null : v === 2
          ? <><path d="M19 42 L8 52 M11 49 L7 47" strokeWidth="1.3" /><path d="M41 42 L52 52 M49 49 L53 47" strokeWidth="1.3" /></>
          : <><path d="M19 40 L6 30 M9 32 L6 35 M10 33 L9 28" strokeWidth="1.3" /><path d="M41 40 L53 33 M50 35 L54 37" strokeWidth="1.3" /></>}
      </g>
      <g filter={`url(#${id}-rough)`}>
        <circle cx="30" cy="63" r="17" fill={snow} />
        <circle cx="30" cy="39.5" r="12.5" fill={snow} />
        <circle cx="30" cy="20.5" r="9.2" fill={snow} />
      </g>
      {/* Settled snow shadow where the spheres meet */}
      <ellipse cx="31" cy="47.5" rx="9" ry="1.6" fill="var(--snow-deep)" opacity="0.35" />
      <ellipse cx="31" cy="28.5" rx="6.5" ry="1.2" fill="var(--snow-deep)" opacity="0.3" />
      {/* Scarf */}
      <path d="M21.5 28.5 Q30 33.5 38.5 28.5 L39 31.6 Q30 36.8 21 31.6 Z" fill={scarf} />
      <path d="M22 30.6 Q30 35.2 38.2 30.6" stroke={stripe} strokeWidth="0.7" fill="none" opacity="0.9" />
      <path className="mini-snowman-scarf-tail" d="M34.5 32.5 L37.8 44 L34.3 44.6 L32 33.4 Z" fill={scarf} />
      <path d="M34.3 43.2 L37.6 42.6 M34.6 44.6 L35 46 M36.4 44.2 L37 45.6" stroke={stripe} strokeWidth="0.6" />
      {/* Face */}
      <circle cx="26.8" cy="18.6" r="1.25" fill="var(--coal)" />
      <circle cx="33" cy="18.4" r="1.25" fill="var(--coal)" />
      <circle cx="26.5" cy="18.2" r="0.35" fill="var(--snow-highlight)" />
      <circle cx="32.7" cy="18" r="0.35" fill="var(--snow-highlight)" />
      <path d="M30.2 21 L40 23.4 L30.4 23.6 Z" fill={`url(#${id}-carrot)`} />
      {[0, 1, 2].map(i => <circle key={i} cx="30.2" cy={36 + i * 4.6} r="1.05" fill="var(--coal)" />)}
      {/* Hats */}
      {v === 1 && <g><path d="M21.6 15.5 Q30 4 38.6 15.5 Z" fill="var(--midnight)" /><rect x="21" y="14.2" width="18" height="3" rx="1.4" fill={stripe} /><circle cx="30" cy="6.4" r="2.2" fill="var(--snow-body)" /></g>}
      {v === 2 && <g><rect x="22" y="12.8" width="16" height="2.2" rx="1" fill="var(--midnight)" /><rect x="24.6" y="3.6" width="10.8" height="9.6" rx="1" fill="var(--midnight)" /><rect x="24.6" y="10.6" width="10.8" height="1.4" fill="var(--gold)" /></g>}
    </svg>
  </div>;
}
