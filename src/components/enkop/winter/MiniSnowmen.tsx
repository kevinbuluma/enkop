import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouterState } from '@tanstack/react-router';
import { readStored, writeStored } from '@/lib/safe-storage';
import { chooseSnowmen, spreadSnowmen, SNOWMAN_SPOTS, type SnowmanCandidate } from '@/lib/winter/snowman-placement';
import { MiniSnowman } from './MiniSnowman';

const SEED_KEY = 'enkop:snowman-seed';
// A snowman never stands over any of these.
const BLOCKERS = 'h1, h2, h3, h4, p, a, button, input, select, textarea, label, img, video, iframe, .property-price, .eyebrow, .property-tag, .hero-tour, .section-navigator, .card-save, .season-preview-chip, .rain-sound-toggle';

type Placed = { key: string; x: number; y: number; height: number; variant: number };

const overlaps = (a: DOMRect, b: { left: number; top: number; right: number; bottom: number }) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * Miniature snowmen in predefined safe spots (beside cards, on dividers, on the footer). Spots are chosen
 * per visit and page so they stay put while browsing; any spot touching text, controls or imagery is skipped.
 */
export function MiniSnowmen({ max }: { max: number }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const [placed, setPlaced] = useState<Placed[]>([]);

  useEffect(() => {
    let seed = readStored(SEED_KEY, 'session');
    if (!seed) { seed = Math.random().toString(36).slice(2, 10); writeStored(SEED_KEY, seed, 'session'); }
    let timer = 0;
    const place = () => {
      const candidates: SnowmanCandidate[] = [];
      const elements = new Map<string, Element>();
      SNOWMAN_SPOTS.forEach((spot, si) => document.querySelectorAll(spot.selector).forEach((el, i) => {
        if (el.closest('.seasonal-page-transition, .paper-page-snapshot')) return;
        const key = `${si}:${i}`;
        candidates.push({ key, kind: spot.kind, perches: spot.perches, chance: spot.chance });
        elements.set(key, el);
      }));
      const blockers = [...document.querySelectorAll(BLOCKERS)]
        .filter(el => !el.closest('.site-header, .mobile-menu, .seasonal-page-transition, .snowman-layer, .paper-page-snapshot'))
        .map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
      const mobile = innerWidth < 760;
      const height = mobile ? 46 : 58, width = height * 0.72;
      const out: Placed[] = [];
      for (const choice of chooseSnowmen(candidates, seed!, pathname)) {
        const r = elements.get(choice.key)?.getBoundingClientRect();
        if (!r || r.width < 140) continue;
        const x = choice.perch === 'top-right' ? r.right - width - 16 : r.left + 16;
        const y = r.top - height + 8;
        const box = { left: x - 4, top: y - 4, right: x + width + 4, bottom: y + height - 6 };
        if (box.left < 4 || box.right > innerWidth - 4) continue;
        if (blockers.some(b => overlaps(b, box))) continue;
        out.push({ key: choice.key, x: x + scrollX, y: y + scrollY, height, variant: choice.variant });
      }
      setPlaced(spreadSnowmen(out, max));
    };
    const soon = (delay = 250) => { clearTimeout(timer); timer = window.setTimeout(place, delay); };
    soon(450);
    // Again once reveals and images have settled.
    const settle = window.setTimeout(place, 1700);
    const resize = () => soon();
    addEventListener('resize', resize);
    const observer = new ResizeObserver(() => soon(400));
    observer.observe(document.body);
    return () => { clearTimeout(timer); clearTimeout(settle); removeEventListener('resize', resize); observer.disconnect(); };
  }, [pathname, max]);

  if (!placed.length) return null;
  return createPortal(<div className="snowman-layer" aria-hidden="true">
    {placed.map(p => <MiniSnowman key={`${pathname}-${p.key}`} variant={p.variant} style={{ left: p.x, top: p.y, height: p.height, width: p.height * 0.72 }} />)}
  </div>, document.body);
}
