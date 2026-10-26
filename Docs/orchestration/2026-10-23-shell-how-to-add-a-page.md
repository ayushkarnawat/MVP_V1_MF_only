# How to add a page to the shell

The shell (`frontend/src/shell/`) builds the sidebar, routes, titles and links from one registry. A page is one file.

1. **Copy a route file** from `frontend/src/shell/routes/` (for example `home.route.tsx`). The file name stem equals the `id` (kebab-case). The route list is fixed by the contract (`2026-10-22-nav-shell-contract-v1.md`, section 4); adding or renaming a route is a contract change and needs the shell reviewers' approval.
2. **Flip it live:** set `status: "live"` and replace `page` with your page: `page: () => import("../../features/<your-page>/<YourPage>")` (a default export). Nothing else changes: the sidebar row, `AppLink` and `useAppNavigate` start treating it as a link automatically.
3. **Link to it with `paths`** (`shell/nav/paths.ts`) through `AppLink` or `useAppNavigate`. Never write a path string by hand. Placeholder destinations (also through a redirect) render as "Coming soon" and cannot be navigated to.
4. **Scope:** `scope: "family-or-member"` shows the family selector in the top bar; `"none"` hides it and never resets the selection.
5. **Colours** come only from `var(--shell-*)` tokens (`shell/theme/shell-tokens.css`); no raw hex.
6. **Test with `renderInShell`** (`shell/testing.tsx`): `renderInShell(ui, { path, scope, routes })` wraps a `MemoryRouter`, a test scope provider and the registry. Pass `routes` to flip a route to live inside one test without editing its file.
7. The only per-page file you edit is your route file and your own page folder. Files in `frontend/src/shell/` outside `routes/` are shell-owned (CODEOWNERS).
