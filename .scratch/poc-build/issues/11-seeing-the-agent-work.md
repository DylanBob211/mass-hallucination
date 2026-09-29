# 11: Seeing the agent work

**What to build:** The performer can watch the agent working in the code and review what happened: a streamed draft under its Part, a badge, tinted agent text, ghosts of deleted-but-sounding Parts, and the peek with this session's Turns. See [spec §10](../../ai-live-coding-poc/spec.md), ADR 0007.

**Blocked by:** 10 (Agent loop over the real model).

**Status:** ready-for-agent

- [ ] Tool input streams as a dashed block under its Part (new Parts at the end), from the view model's streamed draft
- [ ] "Agent at work" badge on the target Part's label line while a Turn runs
- [ ] Agent-written text stays tinted until the human edits that Part
- [ ] A deleted Part still sounding shows as a struck-through ghost at the end
- [ ] Ctrl-J toggles the peek without taking focus; it lists this session's Instructions and outcomes and opens itself on a word answer
