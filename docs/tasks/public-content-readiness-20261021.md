# Public content readiness (2026-10-21)

Goal: make the existing public tools understandable in the initial HTML and declare approved content use preferences. The user authorized verification and production deployment while preserving existing access restrictions.

Scope: the existing 14 sitemap routes only (home, about, 12 tools). Use the current Chinese catalog and descriptions for initial HTML; preserve client language selection, interactive tools, theme initialization, API behavior, sharing privacy, PWA/offline navigation and Cloudflare bindings. No paid plan, Markdown conversion, new API, database migration or dependency update.

Risk: R1, bounded and reversible static build output. API router, permission code, Worker/DO/D1 bindings and WAF remain unchanged. Static generation keeps public requests on Static Assets. No request input, room identifier or stored user content enters generated pages.

Implementation: scripts/public-pages.mjs derives metadata and readable noscript content from the existing catalog/translations, marks initial metadata for retirement when React 19 client metadata takes over, emits individual extensionless-route .html assets during generateBundle before PWA precaching, and uses VITE_SITE_URL for canonical/OG/schema origins. Public robots retains Allow /, Disallow /api/ and the original sitemap, adding search=yes, ai-input=yes, ai-train=no.

Platform evidence: [Cloudflare HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/) was checked on 2026-10-21. Default auto-trailing-slash serves /path from path.html, preserving existing extensionless canonical URLs; no routing configuration change is needed. [Content signals](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/) express use preferences, not access enforcement or guaranteed indexing.

Verification: lint and 102 tests passed, including 3 new initial-HTML/emission/failure tests plus a TOML date/64-bit conversion case. Full Vite/PWA build and Worker dry run passed. Local runtime verification passed for all 14 routes: GET and browser-navigation requests match the exact final HTML; HEAD is empty; 26 slash/.html aliases redirect to the existing canonical paths. Robots GET/HEAD is plain text with the original Allow/Disallow/sitemap directives. All 14 HTML MD5 values match PWA precache revisions. Existing local Worker smoke passed (DO rooms/WebSocket/conflicts/expiry/destruction, D1 Mock API, DNS/HTTP/network identity, SPA/API separation), with created local fixtures cleaned up. The first smoke run omitted the project's local-upstream setting and rejected a generated internal URL; rerunning in fresh local state with that setting passed, without business-code changes. Production smoke remains read-only.

Baseline: origin/main 3844824f7df71a83762eec8ba166fbe0edef2a62. Isolated candidate avoids original working-tree changes. Cloudflare flaretools production before publishing: version 8b7b0b0b at 100%, source main 3844824, build 504ebc99-9a28-46d4-9d6b-83052ada8001, read from existing dashboard on 2026-10-21. Roll back to that version or revert this scoped commit and rebuild; do not migrate or reset data.

Known baseline: npm ci reported 7 dependency advisories (2 moderate, 5 high); versions and lockfile are unchanged. Existing TOML stream/eval and chunk-size warnings remain. These checks do not claim a dependency/security audit or all-browser validation.

Release status: not yet pushed or deployed at this record's creation.

Browser verification found an existing production defect: @iarna/toml accesses Node global.Date at module load, crashing the data-transformer page. Independent read-only investigation confirmed the production chunk matches the baseline and reproduced the same ReferenceError. The narrow repair maps the Vite global identifier to standard globalThis, without adding a window property, dependencies or polyfills. Date and 64-bit TOML branches are included in verification; JSON BigInt behavior stays unchanged. Vite define semantics were checked against the [current official documentation](https://vite.dev/config/shared-options).

Final Edge local checks: the data-transformer route loads in English; TOML dates convert to JSON and a signed 64-bit integer retains its exact value when formatted as TOML. A unique description/canonical/OG locale remains after React 19 takes over; initial static tags are retired only on page SEO mount. Old console errors belong to the pre-fix 8803 origin, not the final 8805 build.
