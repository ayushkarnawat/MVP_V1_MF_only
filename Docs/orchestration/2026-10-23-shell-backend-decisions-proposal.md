# Navigation shell: backend decisions (proposal, not appended to `decisions.md`)

**Status:** proposal, 2026-10-23. Doc 9. Append to `decisions.md` only on the owner's go. Format: decision, why, reuse alternative.

| # | Decision | Why | Reuse alternative / note |
|---|---|---|---|
| SB1 | The shell adds no backend endpoint, table, migration, job or setting | it reads existing calls only (`getHouseholdMembers`, auth calls, the wrapped screens' calls) | none needed |
| SB2 | Navigation state (Back target, Equity open state, scope pick) lives in `sessionStorage`, never on the server | state is per browser tab and short-lived (B4); no cross-device need | a user preference table would only be needed if the owner wants these remembered across sessions |
| SB3 | The scope is not in the URL; only `/import` carries `?member=<id>` | contract O4 | scope in the URL would let a link share a member view; rejected for now |
| SB4 | No event tracking is added for navigation | the app has no event tracking today (**unverified** beyond the earlier note) | adding it needs an owner decision and a privacy review |
| SB5 | Hosting needs no change: Caddy `try_files {path} /index.html` and the CloudFront 403/404 mapping already serve real URLs | verified by the earlier session | add a one-line note to the deploy guides |
| SB6 | The router must never intercept `/print/analytics`, the legal pages or `/mobile` | they bypass or precede the shell | covered by a boundary test |
| SB7 | A `CODEOWNERS` file requires both owners for `frontend/src/shell/` (D2) | the shell is shared | a repository setting is outside the code; handles given 23 Oct: `@ayushkarnawat` and `@aditi-unifolio` (SD1); the file is `.github/CODEOWNERS`, created in PR 1; enforcing it through branch protection is a repository setting outside the code |
| SB8 | A dependency is added: `react-router ^7.18.4` | no router exists; v8.5 needs Node 22.22 and CI and `deploy.sh` use Node 20 | a v8 and Node 22 upgrade is a later task |

Nothing here conflicts with ADR-001 to 006 (stack unchanged: React + Vite, FastAPI). No schema impact; `Database-Schema-Unifolio.md` is untouched.
