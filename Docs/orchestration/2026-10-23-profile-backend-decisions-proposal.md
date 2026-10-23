# Profile: backend decisions (proposal, not appended to `decisions.md`)

**Status:** proposal, 2026-10-23. Document 9. Append to `decisions.md` only on the owner's go. Format: decision, why, reuse alternative.

| # | Decision | Why | Reuse alternative / note |
|---|---|---|---|
| PD1 | (Withdrawn, L49) No `GET /household-members/{id}/pan` endpoint: the PAN is always masked | your 23 Oct instruction | ADR-004 is unaffected; no conflict remains |
| PD2 (Withdrawn, L49: no PAN endpoint) | n/a | n/a |
| PD3 (Withdrawn, L49: no PAN endpoint) | n/a | n/a |
| PD4 (Withdrawn, L49: no PAN endpoint) | n/a | n/a |
| PD5 | Add `created_at` to `GET /auth/me` (Q2, decided) | "Member since" in the header | none |
| PD6 | No schema change, no migration, no new job | L31 removed the only option that needed columns | n/a |
| PD7 (Withdrawn, L49: no PAN endpoint) | n/a | n/a |
| PD8 | No backend change for editing goals and investor type: the existing `PATCH /auth/me` is used (L43) | same call onboarding uses | verify its behaviour for an empty goals list (spec item 7) |
| PD9 | The old Profile is deleted after the new one is accepted (L42); reused components stay | A3 B kept it reachable only as a fallback | needs your explicit go at that time |

## Contract appendix: proposed wording for shell contract v1.2 (not applied)

- **O10** now reads "Profile sections as routes later, not in v1". Proposed: "Profile sections are routes from the Profile release (after the shell lands)."
- **Section 4 URL map and section 5 registry rows:** replace the reserved `/profile/:section` list with: `/profile` (redirects to `/profile/personal`), `/profile/personal`, `/profile/family`, `/profile/connected-accounts`, `/profile/settings`, `/profile/settings/notifications`, `/profile/settings/preferences`, `/profile/settings/security`, `/profile/settings/import-history`, `/profile/subscription`, `/profile/tax`, `/profile/data-privacy`, `/profile/legacy` (hidden), and the existing `/profile/import-health`. Scope for all: `none`.
- **Row `profile` (footer 1):** unchanged id, path, label, icon; its page becomes a redirect.
- Files: one route file per path (list in `2026-10-23-profile-architecture.md` section 2).
