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

- ENKOP property records and enquiries live in Lovable Cloud; public catalogue reads published records and enquiries are written through validated server functions so the presentation stays separate from data access.
- Property imagery is mapped from local editorial assets by image key; illustrative listings are explicitly labelled until genuine inventory is supplied.
- The homepage hero video files live in public/videos/scenes (MP4, WebM and a poster per scene) because the site is also deployed to Vercel, where Lovable's /__l5e asset URLs return 404; never point hero media at /__l5e or .asset.json URLs.
- Property tour videos are generated server-side via AI Gateway /v1/videos, polled by the admin client, and copied into the private property-media bucket on completion because gateway downloads expire.
- Homepage hero scenes come from the homepage_slides table; the public loader signs only active slide paths server-side, and the three built-in scenes in public/videos/scenes are the fallback when no scenes are active or the loader can't reach storage.
- Matching homepage fallback images use a browser-captured video frame and an admin-verified streaming AI Gateway image-edit route; only an explicitly approved final image is stored and assigned to the scene.
- Page transitions use a persistent root-level curtain with an in-memory public-navigation counter alternating seasonal effects and page flips; router lifecycle events drive the non-blocking reveal, native snapshot transitions stay disabled, and reduced motion, same-page and admin navigation bypass without advancing the counter.
- Page flips capture an inert, transient outgoing-page DOM image across curved CSS-3D strips; remove snapshots on completion and keep all snapshot work browser-only to preserve navigation and SSR safety.
- Autumn navigation uses a preloaded photographic botanical sprite atlas, cached soft-focus variants and deterministic canvas wind paths; skip the effect if textures are unavailable rather than rendering illustrated substitutes, keeping navigation immediate and per-frame rendering filter-free.
- Homepage playback uses path-keyed MP4/WebM variants from public/videos/scenes for existing footage, preloads only the current and next scenes, and reveals videos only after playback starts; changed upload paths keep their own footage.
- Built-in footage offers restrained denoise/sharpened upscaled exports: wide screens select 4K and phones select HD via media-qualified sources, retaining original codec fallbacks and never substituting enhanced built-ins for new uploads.
- Phone layouts use bounded grid tracks, readable form fields and safe-area-aware scrollable overlays; pointer-driven tilt is reserved for fine hover-capable pointers to keep touch scrolling stable.
