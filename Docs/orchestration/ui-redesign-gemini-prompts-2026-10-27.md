# Gemini prompts, 27 Oct 2026 (second batch)
Paste one prompt per Gemini (Antigravity) window. Each window opens its own folder; commands run in WSL. When Gemini's report comes back, paste it to the orchestrator. MF-B's prompt is added at the end when its packet is verified (see the handoff).

## SYNC FIRST (owner runs this once per worktree, before pasting any prompt below; Gemini must not run it)
The second-batch Gemini output (PL-B, IF-B1, PR-B, MF-B) is now committed and pushed on each feature branch, but the manager machine's worktrees still hold those files as **uncommitted loose files**. Each worktree must drop the loose files and take the pushed branch, or the next packet's Step 0 (`git status --short` must be empty) fails and the new red tests are missing. Run in WSL for each row (`wsl.exe -d Ubuntu`):

| Worktree | Branch | Expected commit after sync |
|---|---|---|
| `/home/ayush/wt/mf-fe` | `feat/mf-frontend` | MF-B green `d64b437b`, then the MF-C red commit |
| `/home/ayush/wt/profile-fe` | `feat/profile` | PR-B green `3e505216`, then the PR-C red commit |
| `/home/ayush/wt/if-fe` | `feat/individual-fund-frontend` | IF-B1 green `215077c5`, then the IF-B2 red commit |
| `/home/ayush/wt/planning-fe` | `feat/planning-frontend` | PL-B green `36a1824c` |

```
cd /home/ayush/wt/<name>
git fetch origin
git log --oneline -1 origin/<branch>        # must show the commit in the table (or a later red commit)
git status --short                          # only the old Gemini files may be listed; anything else: stop and ask the orchestrator
git reset --hard                            # drops the loose edits (they are already committed on origin)
git clean -fd frontend/src                  # drops the loose new files (same reason)
git checkout <branch>
git reset --hard origin/<branch>
git status --short                          # must now print nothing
git log --oneline -3                        # top must be the commit in the table
```
Only do this after the orchestrator says the red commit is pushed. Never run it in a worktree whose uncommitted files are NOT already on origin.

**Guard line every Gemini prompt below carries:** "Before anything else run `git status --short` and `git log --oneline -3`; the first must print nothing and the top commit must be the red-test commit the packet names. If not, STOP and report; do not fix it yourself."

## PL-B: Planning page assembly (folder `W:\home\ayush\wt\planning-fe`)
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\planning-fe (WSL path /home/ayush/wt/planning-fe, branch feat/planning-frontend). Read, completely and in order, Docs/orchestration/ui-redesign-PL-B-planning-packet.md in the repo (also readable at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-PL-B-planning-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests are already written and red; you write only the files the packet's file map names. Never edit a test, fixture or types.ts, never run npm install, never commit. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/planning-fe ...). If the portedFlow test "records Analytics and Planning URLs" times out in a full shell run, rerun that run once. When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```

## IF-B1: Individual Fund, rest of the Overview tab (folder `W:\home\ayush\wt\if-fe`)
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\if-fe (WSL path /home/ayush/wt/if-fe, branch feat/individual-fund-frontend). Read, completely and in order, Docs/orchestration/ui-redesign-IF-B1-individual-fund-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-IF-B1-individual-fund-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests are already written and red; you write only the files the packet's file map names (the packet also names the one-line ReturnsTable edit and the additive types.ts/schema change if it says so; do exactly that and no more). Never edit a test or fixture, never run npm install, never commit. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/if-fe ...). If tests time out under load, use the packet's rule 13 (--maxWorkers=4). When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```

## PR-B: Profile pages part 1 (folder `W:\home\ayush\wt\profile-fe`)
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\profile-fe (WSL path /home/ayush/wt/profile-fe, branch feat/profile). Read, completely and in order, Docs/orchestration/ui-redesign-PR-B-profile-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-PR-B-profile-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests are already written and red; you write only the fourteen implementation files and change only the `page` line in the four route files the packet names. Never edit a test, fixture or types.ts, never run npm install, never commit. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/profile-fe ...). When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```

## MF-B: Mutual Funds Performance benchmark block, Allocation, Holdings, Transactions (folder `W:\home\ayush\wt\mf-fe`)
```
You are the front-end builder for the Unifolio UI redesign. Open the folder W:\home\ayush\wt\mf-fe (WSL path /home/ayush/wt/mf-fe, branch feat/mf-frontend). Read, completely and in order, Docs/orchestration/ui-redesign-MF-B-mutual-funds-packet.md (also at W:\home\ayush\wt\docs\Docs\orchestration\ui-redesign-MF-B-mutual-funds-packet.md). It is the whole truth for this run: do Step 0 first and report its outputs, then follow every step, rule and checkpoint exactly. The tests are already written and red (the legacy-component move to components/mf is already committed); you create the 20 implementation files and edit only the 5 files the packet names. Never edit a test, fixture or types.ts, never run npm install, never commit. Run every command inside WSL (wsl.exe -d Ubuntu --cd /home/ayush/wt/mf-fe ...). When done, send the report in the packet's report template with real command outputs. If anything differs from the packet, stop and report it.
```
