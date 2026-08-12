# No-Codex Fallback

Loaded on demand from `SKILL.md` on the first delegation attempt in a
session where Codex isn't ready.

## Detecting the situation

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" setup --json`
(same check `/codex:setup` uses). If `ready` is `false` — no CLI, or not
authenticated — this fallback applies.

## The ask (once per session, not once per delegation attempt)

Ask exactly once, offering three options, before attempting any
delegation:

1. **Run this session Claude-only via subagents** — same
   `delegation-rules.md` classification table, but the Claude-subagent
   fallback lane (`Explore`, `general-purpose`) becomes the only worker,
   not just the rare-case fallback.
2. **Name a different tool already configured** (e.g. Gemini CLI) if the
   user wants this skill's workflow adapted around it instead of Codex.
   Adapting the skill itself is a separate follow-up, not something to
   improvise silently in the moment.
3. **Skip this skill entirely for the session** — offered explicitly,
   not just implied. A teammate who doesn't have or want this workflow
   should be able to opt out cleanly rather than have it forced on them.

Whichever is chosen, remember it for the rest of the session. Do not
re-ask on the next delegable subtask.
