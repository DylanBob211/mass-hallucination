# 18: Code readable over visuals

**What to build:** Code, drafts and Proposals stay readable over any visuals without dimming the canvas, and the performer can hide code to show visuals alone. See [spec §10 "Over visuals"](../../ai-live-coding-poc/spec.md), ADR 0007 with map ticket 17's amendment.

**Blocked by:** 08 (Proposals), 11 (Seeing the agent work), 13 (Hydra canvas and the `hydra` tag).

**Status:** ready-for-agent

- [ ] The Part in focus (agent's target while a Turn runs or a Proposal is open, else the cursor's Part) sits on a solid full-width band
- [ ] Other lines on lighter boxes as wide as their text; agent widgets on solid panels; the canvas is never dimmed or blurred
- [ ] A Visual Part's error is a badge on its label line, or a corner chip when code is hidden
- [ ] Alt-H cycles all code → Part in focus only → no code → all; a Proposal reveals itself, only as far as the Part in focus
- [ ] Manually verified over the busy-colour and white-strobe prototype presets
