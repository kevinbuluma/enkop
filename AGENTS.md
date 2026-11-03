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

Subdirectories have their own `AGENTS.md` (src/server, master-db, cloudflare, src/components/enkop); read it before changing files there.

- The ENKOP master is the Cloudflare Worker `enkop` with ENKOP's own Postgres and private `property-media` Storage; it is the single source of truth and Lovable Cloud is an automatically synced mirror and fallback, never a second writer (details in src/server/AGENTS.md).
- Data access goes through `getBackend()` and `getMaster()` / `requireAdmin` from src/server/backend; never query Supabase directly from route or `*.functions.ts` code, because on the master that reads the stale mirror.
- Privileged work (media signing, enquiries + alerts, AI Gateway) goes through src/integrations/supabase/privileged.server.ts, so hosts without managed keys use the secret-authenticated bridge.
- Schema changes go in both supabase/migrations (idempotent) and master-db/migrations, plus src/server/backend/tables.ts; content tables stay column-for-column identical (see master-db/AGENTS.md).
- Dependencies install with bun (Lovable builds from bun.lock): change versions with `npx bun@1.4.4 install`, check with `npx bun@1.4.4 audit` (package-lock.json is local only). Keep Vite on a release that accepts the pinned `rolldown` override.
- Browser storage goes through src/lib/safe-storage.ts (`readStored`/`writeStored`), never `localStorage` directly: it throws when visitors block site data.
- Company facts and positioning come from the ENKOP Real Estate company profile and live in src/lib/enkop.ts (`company`, `services`, `values`, `reasons`, `contact`, `enquiryInterests`); pages read from there rather than restating them. Copy stays confident and factual: no superlatives, rankings or claims the profile does not make. Enquiry links preselect the form topic with `/contact?interest=<one of enquiryInterests>`.
- Brand tokens, contrast rules and button variants live at the top of the ENKOP section of src/styles.css; seasons never override `--royal`, `--gold` or `--accent` (full rules in src/components/enkop/AGENTS.md).
- Seasonal atmospheres and page transitions are root-mounted systems with pure, unit-tested models in src/lib (storm, winter, paper-turn, leaf-motion); they never run on /admin and always respect reduced motion (see src/components/enkop/AGENTS.md).
