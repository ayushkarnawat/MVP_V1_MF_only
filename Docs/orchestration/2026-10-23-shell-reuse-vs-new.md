# Navigation shell: reuse versus new, and how each new piece is built (draft v1)

**Status:** draft, 2026-10-23. Doc 4. Companion to docs 1 to 3. Reuse first; every new piece says why reuse does not cover it. Code facts were read on 23 Oct (**verified**) unless marked.

## 1. What moves out of the current shell, and what stays

| Current file | Lines | What it does today | Fate |
|---|---|---|---|
| `features/dashboard/MainDashboardFlow.tsx` | 307 | tab state and `history.state`, members and scope, import mode, banners, the five screens | **Retired in PR 2.** Logic is moved, not rewritten: scope to `ScopeProvider`, banners to `MemberBanners`, import to `useImport` and the focus layout, tab switch to the router |
| `features/dashboard/NavigationShell.tsx` (+ `.module.css`) | 206 | top navigation bar, Family/Per Member switch, member select, Add Data, theme toggle, profile button | **Retired in PR 2.** Replaced by `Sidebar` and `TopBar` |
| `features/dashboard/DashboardPlaceholder.tsx` | 4 | renders `MainDashboardFlow` | **Retired in PR 2** (replaced by `ShellRoot`) |
| `App.tsx` | n/a | gates, mobile branch, `DashboardPlaceholder` in the desktop branch | **Edited in PR 2**: one component swap in the desktop branch; gates and mobile untouched |
| `main.tsx` | 17 | print and legal routes around `App` | untouched |
| Tests `App.test.tsx` (8 `it`), `MainDashboardFlow.test.tsx` (15), `NavigationShell.test.tsx` (about 7) | n/a | only tests that reference the shell (**verified**: 7 files mention the three components, 3 are tests) | ported first in PR 2, then updated |
| `DashboardView`, `HistoryView`, `AnalyticsView`, `ScenariosScreen`, `ProfileView`, `ImportFlow`, `ImportHealth`, members dialogs and banners | n/a | the screens | **Unchanged.** Wrapped by thin route files; banners and dialogs reused as they are |
| `mobile/**`, auth, onboarding, legal, print route, theme tokens | n/a | n/a | untouched |

## 2. Frontend pieces

| Need | Reuse | New | How built |
|---|---|---|---|
| Router | none installed | `react-router ^7.18.4` (one dependency) | declarative mode inside `ShellRoot`; `Routes` generated from the registry |
| Route registry | none | `shell/registry/` (types, `buildRegistry.ts`, contract test) | `import.meta.glob` eager; sort by section and order; validation (spec 2.2); pure functions, unit-testable |
| Sidebar | `UnifolioLogo`, `ThemeToggle` (in top bar), `cn`, lucide icons, `@radix-ui/react-tooltip` (installed) for "Coming soon" | `layout/Sidebar.tsx`, `SidebarItem.tsx`, `SidebarGroup.tsx` | tree from registry by `parentId`; active row from the URL; Equity open state in `sessionStorage`; disabled rows through `AppLink`'s rule |
| Top bar | `ThemeToggle`, `components/ui` `Select` (the existing Radix select), `Button` | `layout/TopBar.tsx` (frame with four slots) | search slot renders a placeholder input that opens the Mira popup; family selector reads `useScope()` |
| Layouts | tokens, `Skeleton` | `AppLayout.tsx`, `FocusLayout.tsx` | `AppLayout` = sidebar + top bar + banners + `Outlet`; `FocusLayout` reproduces the header of today's Add Data screen |
| Scope | logic in `MainDashboardFlow` (lines 41 to 80, 110 to 123) | `scope/ScopeProvider.tsx`, `useScope.ts` | same fetch and defaults; setters renamed; reset rule and `sessionStorage` persistence added |
| Banners and dialog | `PanConflictBanner`, `ProfileNudge`, `CompleteProfileDialog` (unchanged) | `scope/MemberBanners.tsx` | the JSX from `MainDashboardFlow` lines 142 to 159 and 250 to 265 moved as is |
| Back memory | none | `nav/modeMemory.ts` | `sessionStorage` key; rules in spec section 6 |
| Links | none | `nav/paths.ts`, `AppLink.tsx`, `useAppNavigate.ts` | typed builders; `AppLink` renders a disabled span for placeholder routes |
| Import entry | `ImportFlow`, `clearCasResumeStep2`, member select | `nav/useImport.ts`, wrapper `import.route.tsx` | wrapper holds the `isAddingData` branch's logic: member choice, `onDone` navigation with notice |
| States | `Skeleton`, `EmptyState` | `PageLayout.tsx`, `PageState.tsx`, `PlaceholderPage.tsx` | thin compositions |
| Mira popup | `Modal` (existing) or the installed Radix dialog | `mira/MiraComingSoonDialog.tsx` | one shared component; text only |
| Test helper | `@testing-library/react`, vitest | `shell/testing.tsx` (`renderInShell`) | wraps `MemoryRouter` + providers |
| Tokens | `tokens.css` (not edited) | `shell/theme/shell-tokens.css` | `--shell-*` from the palette, light and dark (doc 3) |
| Temporary tab strip (SF2) | `AppLink`, registry | `shell/nav/TemporaryMfTabs.tsx`, drawn by three wrapper files | removed when the Mutual Funds owner ships the in-page menu |
| Temporary "+ Add data" button (SF3) | `Button` (existing), `useImport` | one element in `TopBar.tsx` | removed when the Investments page ships its own control |
| Family selector (SF4, SF5) | existing `Select` (Radix) | `layout/FamilySelector.tsx` | one dropdown listing Family Combined then members; hidden when the active route's scope is `none` |
| Review rule (D2, SD1) | none | `.github/CODEOWNERS` | lines for `frontend/src/shell/` naming `@ayushkarnawat` and `@aditi-unifolio` |

## 3. Wrapper route files (props from today's `MainDashboardFlow`, **verified**)

| Wrapper | Component (unchanged) | Props and where they come from |
|---|---|---|
| `portfolio-mutual-funds` | `DashboardView` | `importNotice` (router location state), `onDismissImportNotice`, `viewMode`, `memberId` (scope), `onAddDataForMember` (`useImport`), `onOpenHistory` (navigate to the History route) |
| `portfolio-mutual-funds-history` | `HistoryView` | `viewMode`, `memberId`, `memberName` (scope) |
| `portfolio-mutual-funds-analytics` | `AnalyticsView` | `viewMode`, `memberId`, `onAddDataForMember`, `activeMemberName` |
| `planning-scenarios` | `ScenariosScreen` | none |
| `profile` | `ProfileView` | `onOpenImportHealth` (navigate), `name`, `email`, `phoneNumber`, `logout`, `requestAccountDeletion`, `requestContactChange`, `verifyContactChange` (from `useAuth`), `onMembersChanged` (`invalidateApiCache` + `refreshMembers`) |
| `profile-import-health` | `ImportHealth` | `memberId` (scope, member mode only), `onBack` (navigate back) |
| `import` | `ImportFlow` | `householdMemberId` from `?member=`, `onDone(notice)` |

## 4. Backend

Nothing new (spec section 9). No reuse question arises.

## 5. Dependency and effort summary

One dependency (`react-router ^7.18.4`). New files about 35 to 45 (31 route files, about 12 shell components and hooks, tests; **estimate**). Plan sum is in doc 5 and the combined artifact.
