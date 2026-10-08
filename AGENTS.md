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
- The homepage hero uses a silent CDN-hosted motion reel with a local editorial still as its poster and reduced-motion fallback, keeping video weight out of the repository.
- Property tour videos are generated server-side via AI Gateway /v1/videos, polled by the admin client, and copied into the private property-media bucket on completion because gateway downloads expire.
- Homepage hero scenes come from the homepage_slides table; the public loader signs only active slide paths server-side, and the bundled reel is the fallback when no scenes are active.
