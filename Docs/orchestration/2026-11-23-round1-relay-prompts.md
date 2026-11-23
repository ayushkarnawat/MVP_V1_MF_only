# M3 round 1: the six prompts the owner relays (copy-paste), 23 Nov 2026

Status when written: **none of these has been relayed yet.** Each is identical to the "Paste-ready prompt" at the bottom of its packet or handoff. Before relaying, make sure the worker's branch contains the documents (merge `leapswitch-redesign` into the batch branch and refresh the clone). Four Antigravity lanes run in their own clones; two Codex tasks run in their own worktrees. Reports come back as one block each.

## Antigravity (Gemini), four at once

### 1. Search matching logic (`C:\Users\Ayush\ag-k1`, branch `ag/k1-search`)
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-search-fe-1-packet.md (your task: search-fe-1)
Open Docs/orchestration/2026-11-09-search-bar-planning.html, the matching rules and the result-row table, for the detail. Work only in C:\Users\Ayush\ag-k1 on branch ag/k1-search. Pure logic: tests first (show them fail), then make them pass. Create only the files the packet lists; do not edit searchTypes.ts. Nothing under components/search may import from frontend/src/features. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```

### 2. Search index request, store and recents (`C:\Users\Ayush\ag-k2`, branch `ag/k2-search`)
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-search-fe-2-packet.md (your task: search-fe-2)
Work only in C:\Users\Ayush\ag-k2 on branch ag/k2-search. Tests first (show them fail), then make them pass. Create only the files the packet lists; do not edit searchTypes.ts or AuthContext.tsx. The only import from frontend/src/features that anything under components/search may use is getToken from features/auth/session. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```

### 3. Date module and label component (`C:\Users\Ayush\ag-e3`, branch `ag/ag-e3`)
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-e3-date-module-packet.md (your task: E-3)
Work only in C:\Users\Ayush\ag-e3 on branch ag/ag-e3. New files only: tests first (show them fail), then make them pass. The pending scan test is it.skip by design. Never run a git command that changes anything. Touch only the four files the packet lists. Reply with the report block from the packet, nothing else.
```

### 4. Section list and anchors (`C:\Users\Ayush\ag-f34`, branch `ag/ag-f34`)
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-section-audit.md
4. Docs/orchestration/2026-11-20-f34-section-list-and-anchors-packet.md (your task: F-3 then F-4)
Work only in C:\Users\Ayush\ag-f34 on branch ag/ag-f34. Part 1 (the list) first, then part 2 (the anchors and the guard test). Tests first: show them fail, then make them pass. The pages must look and behave exactly as today: only an id and a scroll-margin class per section. Never run a git command that changes anything. Touch only the files the packet lists. Reply with the report block from the packet, nothing else.
```

## Codex, two at once

### A. Search endpoint (worktree `D:\unifolio-k-be`, branch `batch/k-be`)
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-search-be-1-handoff.md (your task: search-be-1, owner-approved)
Open Docs/orchestration/2026-11-09-search-bar-planning.html, section 3, for the endpoint and the test list. Work only in D:\unifolio-k-be on branch batch/k-be. Git is read-only. No deletion flags or recursive deletes. Write the failing tests first, run them, then make the change in the files the handoff names only. The endpoint is a plain def, whole household only, no pricing, no commit. If the sandbox cannot run the tests, reply BLOCKED with the exact error and still write the tests and the code.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>
Reply with the CODEX REPORT block from the handoff, nothing else.
```

### B. Red tests for the section rail (worktree `D:\unifolio-f-nav`, branch `batch/f-nav`, new test files only)
```
Front-end test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-section-audit.md
4. Docs/orchestration/2026-11-20-f5-rail-red-tests-handoff.md (your task: F-5, owner-approved)
Work only in D:\unifolio-f-nav on branch batch/f-nav. Git is read-only. No deletion flags or recursive deletes. Write only the five new test files the handoff names, exactly against the interfaces it fixes; touch nothing else. You cannot run the front-end checks: do not try, report BLOCKED on running.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
