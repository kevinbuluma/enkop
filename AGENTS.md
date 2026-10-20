<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- The ENKOP master backend runs on Cloudflare (Worker `enkop`: D1 `enkop-db`, media in R2/KV) and is the single source of truth; Lovable Cloud is a mirror kept in sync automatically. Public catalogue reads published records and enquiries are written through validated server functions so the presentation stays separate from data access.
- Property imagery is mapped from local editorial assets by image key; illustrative listings are explicitly labelled until genuine inventory is supplied.
- The homepage hero video files live in public/videos/scenes (MP4, WebM and a poster per scene) because the site is also deployed to Vercel, where Lovable's /__l5e asset URLs return 404; never point hero media at /__l5e or .asset.json URLs.
- Property tour videos are generated server-side via AI Gateway /v1/videos, polled by the admin client, and copied into the private property-media bucket on completion because gateway downloads expire.
- Homepage hero scenes come from the homepage_slides table; the public loader signs only active slide paths server-side, and the three built-in scenes in public/videos/scenes are the fallback when no scenes are active or the loader can't reach storage.
- Matching homepage fallback images use a browser-captured video frame and an admin-verified streaming AI Gateway image-edit route; only an explicitly approved final image is stored and assigned to the scene.
- Page transitions use a persistent root-level curtain with an in-memory public-navigation counter alternating seasonal effects and page flips; router lifecycle events drive the non-blocking reveal, native snapshot transitions stay disabled, and reduced motion, same-page and admin navigation bypass without advancing the counter.
- Page flips capture an inert, transient outgoing-page DOM image across curved CSS-3D strips; remove snapshots on completion and keep all snapshot work browser-only to preserve navigation and SSR safety.
- Autumn navigation uses a preloaded photographic botanical sprite atlas, cached soft-focus variants and deterministic canvas wind paths; skip the effect if textures are unavailable rather than rendering illustrated substitutes, keeping navigation immediate and per-frame rendering filter-free.
- Homepage playback uses path-keyed MP4/WebM variants from public/videos/scenes for existing footage, preloads only the current and next scenes, and reveals videos only after playback starts; changed upload paths keep their own footage.
- Built-in footage preserves source texture without denoising, with restrained sharpening and bounded compression: wide screens select upscaled 4K and phones select HD via media-qualified sources, retaining original codec fallbacks and never substituting enhanced built-ins for new uploads.
- Phone layouts use bounded grid tracks, readable form fields and safe-area-aware scrollable overlays; pointer-driven tilt is reserved for fine hover-capable pointers to keep touch scrolling stable.
- Privileged work (media signing, enquiry insert + WhatsApp alert, AI Gateway) goes through src/integrations/supabase/privileged.server.ts: direct when managed keys exist, otherwise via the secret-authenticated /api/public/enkop-bridge route on Lovable hosting (ENKOP_BRIDGE_SECRET, optional ENKOP_BRIDGE_URL) so non-Lovable hosts work without holding managed keys.
- Data access goes through `getBackend()` (public reads, media signing, enquiries) and `getMaster()` / the `requireAdmin` middleware in src/lib/require-admin.ts (admin reads and writes) from src/server/backend. Never query Supabase directly from route or `*.functions.ts` code: on the master those calls would read the stale mirror.
- Every master write goes through `MasterStore` (`upsert`/`update`/`remove`/`run`), which records the change in the D1 `outbox` in the same batch; the outbox is drained to the mirror via the bridge `mirror/*` routes after each write, on traffic, and by the Lovable Cloud pg_cron job `enkop-master-drain`. Do not write to D1 tables with raw SQL that bypasses the outbox.
- Schema changes must be made in both places: a Supabase migration and a matching D1 migration in cloudflare/migrations (applied with `npx wrangler d1 migrations apply enkop-db -c cloudflare/wrangler.jsonc --remote`), plus the column list in src/server/backend/tables.ts.
- Admin sign-in is ENKOP's own (D1 `admins`/`sessions`, HttpOnly `enkop_admin` cookie, PBKDF2) and lives only on the master; /admin on Lovable hosting redirects there. Admin uploads go to `/api/admin/media`, not Supabase storage. New admins get a one-time link from cloudflare/scripts/admin-setup-link.mjs.
- Deploying the master: `npm run deploy:cloudflare` (build, install `cloudflare/entry.mjs` as the Worker entry, `wrangler deploy --keep-vars`). The entry serves `/videos/*` with byte ranges because Workers Static Assets ignores Range and Safari needs 206 for video. Lovable's generated .output/server/wrangler.json is not used for the master.
- Homepage hero is a tour: HeroReel owns its parallax wrapper, a CSS push-in camera per scene, a walk-through leaving layer and accessible chapter/pause/next controls outside the aria-hidden media, so motion stays CSS-driven and controllable.
- Brand: the ENKOP logo lives in public/brand (original JPG plus transparent cut-outs). Use the BrandLockup (building mark + ENKOP, auto-switching white/navy on dark/light headers) and BrandLogo (full stacked logo) components from src/components/enkop/BrandLogo.tsx instead of a text wordmark; favicon.ico, favicon-32.png, apple-touch-icon.png and brand/enkop-og.jpg are generated from the same artwork.
