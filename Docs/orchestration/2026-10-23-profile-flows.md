# Profile: user flows and request flows (draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 8. Facts about existing calls verified in code on 23 Oct 2026.

## 1. Entering Profile

```mermaid
flowchart LR
  SB["Sidebar footer: Profile"] --> P["/profile"] --> PI["/profile/personal"]
  DL["Deep link /profile/family"] --> F["Family page"]
  OLD["/profile/legacy"] --> LV["old ProfileView (hidden)"]
```

A deep link to any valid Profile path opens that page once the existing gates pass (authentication, onboarding, consent, pending-deletion).

## 2. Moving between sections

Click a left-list item: the URL changes, the content swaps, the list highlights the new item. Browser Back and Forward move through the pages visited. Settings stays highlighted on its four child pages; each child has a "Settings" back link.

## 3. PAN

Always masked; there is nothing to click (L49).

## 4. Change email or mobile (existing flow, new dialog)

```mermaid
flowchart TD
  A["Click Change"] --> B["Enter new email or phone"] --> C["POST /auth/contact-change/request"]
  C -->|ok| D["Enter the code"] --> E["POST /auth/contact-change/verify"] --> F["/auth/me reloads; dialog closes"]
  C -->|error| X["Message; stay on step"]
  E -->|error| X2["Message; stay on step"]
```

Closing the dialog cancels any in-flight request's effect (the stale-request guard from the old dialog is kept).

## 5. Add a member and the other family actions

- **Add Member:** dialog (name, relationship, "other" label when relationship is other) -> `POST /household-members` -> list reloads. 409 (a self member exists) and 422 (invalid name) show messages.
- **Edit:** `CompleteProfileDialog` -> `PUT /household-members/{id}/profile`; possible duplicate and other-account prompts are the dialog's own.
- **Merge:** no standalone action (Q1). Merge happens only inside Edit's possible-duplicate prompt (`POST /household-members/{id}/merge-into/{target}`).
- **Delete all funds:** `DeletePortfolioDialog` -> `DELETE /household-members/{id}/portfolio` (option to remove the member) -> list reloads. The existing queue work after a delete (cache clear, snapshot and Analytics refresh) is unchanged; Profile does not start any compute of its own.

## 6. Import History (Settings)

Settings -> Import History -> the existing list. Delete an import -> existing delete call with its confirmation -> the list reloads. The same background work as today follows; Profile adds none.

## 7. Delete account

```mermaid
flowchart TD
  A["Data & Privacy: Delete account"] --> B["Choose a reason (+ optional note)"] --> C["Confirm"] --> D["POST /auth/account-deletion"]
  D -->|ok| E["Account marked pending; the shell's pending-deletion gate takes over"]
  D -->|error| F["'Could not schedule account deletion. Please try again.'"]
```

The 30-day grace period and the reactivate flow are unchanged.

## 8. Logout

Click Logout in the list footer -> confirmation dialog -> `logout()` from `useAuth()` -> the existing authentication screen.

## 9. What is computed when

Nothing on Profile computes portfolio data. Page loads make small reads (`/auth/me`, `/household-members`, import history, `/legal/consents/me`, `/legal/documents`). The only write paths are the existing ones above.

## 10. Added 23 Oct, later

**Add statement**
```mermaid
flowchart TD
  A["Family Members: Add statement tile"] -->|has members| B["Add statement for whom? (list of members)"]
  A -->|no members| C["/import (no member chosen)"]
  B -->|pick a person| D["/import?member=ID: upload options (shell focus layout)"]
  D -->|Back or done| E["/profile/family or the Mutual Funds page, as the import flow decides"]
```

**Edit goals or investor type**
```mermaid
flowchart TD
  A["Financial Details: Edit, a goal chip, or Investor type"] --> B["Dialog with the stored selection"]
  B -->|Save| C["PATCH /auth/me (primary_goals or investor_type)"] --> D["Card shows the new answers"]
  B -->|Cancel| E["No change"]
```
