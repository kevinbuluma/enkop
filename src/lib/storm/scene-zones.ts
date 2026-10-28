// What lies behind each point of the glass, so the rain can protect the interface and favour imagery.
//   quiet: text, prices, specs, forms, buttons and navigation. No persistent droplets; rain is faint.
//   media: photography and video. Droplets refract it; atmosphere is a little stronger.
//   dark / light: other surfaces, used to tint rain streaks so they read on either.
export type ZoneKind = 'quiet' | 'media' | 'dark' | 'light';
export type ZoneRect = { x: number; y: number; w: number; h: number; kind: ZoneKind; el?: HTMLImageElement | HTMLVideoElement };

const QUIET = [
  '.site-header', '.section-navigator', '.mobile-menu', 'nav', 'form', 'button', 'input', 'select', 'textarea', 'label',
  'a.enkop-btn', '.inline-arrow', '.detail-facts', '.detail-heading-row', '.detail-actions', '.property-information',
  '.property-price', '.hero-content', '.hero-search', '.breadcrumbs', '.section-nav', '.result-heading', '.filters',
  '.studio', 'h1', 'h2', 'h3', 'p', 'li', '.eyebrow', '.rain-sound-toggle', '.season-preview-chip',
].join(',');
const MEDIA = 'img, video';
const SURFACES = 'main > section, main > div > section, .footer, .home-hero, .interior-hero';
const PAD = 8;

function luminance(color: string) {
  const m = color.match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (alpha < 0.5) return null;
  return (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
}

export class SceneZones {
  rects: ZoneRect[] = [];
  private surfaceTone = new WeakMap<Element, ZoneKind>();

  /** Re-reads the visible layout. Cheap enough to call on scroll (throttled) and every few hundred ms. */
  refresh(width = innerWidth, height = innerHeight) {
    const out: ZoneRect[] = [];
    const visible = (r: DOMRect) => r.width > 0 && r.height > 0 && r.bottom > -40 && r.top < height + 40 && r.right > 0 && r.left < width;
    for (const el of document.querySelectorAll<HTMLElement>(SURFACES)) {
      if (el.closest('.seasonal-page-transition')) continue;
      const r = el.getBoundingClientRect();
      if (!visible(r)) continue;
      let tone = this.surfaceTone.get(el);
      if (!tone) {
        const l = luminance(getComputedStyle(el).backgroundColor);
        tone = l !== null && l < 0.4 ? 'dark' : el.matches('.home-hero, .footer') ? 'dark' : 'light';
        this.surfaceTone.set(el, tone);
      }
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height, kind: tone });
    }
    for (const el of document.querySelectorAll<HTMLImageElement | HTMLVideoElement>(MEDIA)) {
      if (el.closest('.seasonal-page-transition, .gallery-viewer')) continue;
      const r = el.getBoundingClientRect();
      if (!visible(r) || r.width < 120 || r.height < 90) continue;
      if (el instanceof HTMLVideoElement ? getComputedStyle(el).opacity === '0' : !el.complete) continue;
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height, kind: 'media', el });
    }
    for (const el of document.querySelectorAll<HTMLElement>(QUIET)) {
      if (el.closest('.seasonal-page-transition')) continue;
      const r = el.getBoundingClientRect();
      if (!visible(r)) continue;
      out.push({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2, kind: 'quiet' });
    }
    this.rects = out;
  }

  /** Highest-priority zone at a viewport point: quiet > media > dark > light. */
  kindAt(x: number, y: number): ZoneKind {
    let kind: ZoneKind = 'light';
    for (const r of this.rects) {
      if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue;
      if (r.kind === 'quiet') return 'quiet';
      if (r.kind === 'media') kind = 'media';
      else if (kind !== 'media' && r.kind === 'dark') kind = 'dark';
    }
    return kind;
  }

  /** The (last-painted, so topmost) media element under a point. */
  mediaAt(x: number, y: number): ZoneRect | null {
    let hit: ZoneRect | null = null;
    for (const r of this.rects) if (r.kind === 'media' && x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h) hit = r;
    return hit;
  }
}
