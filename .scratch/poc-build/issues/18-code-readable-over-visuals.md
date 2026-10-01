# 18: Code readable over visuals

**What to build:** Code, drafts and Proposals stay readable over any visuals without dimming the canvas, and the performer can hide code to show visuals alone. See [spec §10 "Over visuals"](../../ai-live-coding-poc/spec.md), ADR 0007 with map ticket 17's amendment.

**Blocked by:** 08 (Proposals), 11 (Seeing the agent work), 13 (Hydra canvas and the `hydra` tag).

**Status:** ready-for-agent

- [x] The Part in focus (agent's target while a Turn runs or a Proposal is open, else the cursor's Part) sits on a solid full-width band
- [x] Other lines on lighter boxes as wide as their text; agent widgets on solid panels; the canvas is never dimmed or blurred
- [x] A Visual Part's error is a badge on its label line, or a corner chip when code is hidden
- [x] Alt-H cycles all code → Part in focus only → no code → all; a Proposal reveals itself, only as far as the Part in focus
- [x] Manually verified over the busy-colour and white-strobe prototype presets

## Comments

**Implemented (2026-10-01).**

- **`src/ui/overVisuals.ts`**, a CodeMirror extension. Every `.cm-line` has a lighter box as wide as its text (`fit-content`, `rgb(12 12 16 / .6)`). The lines of the units in focus have the full-width band (`.cm-focus-line`, `/ .88`), as in the prototype's variant D. Nothing touches the canvas. The selection layer is raised above the line boxes, which would otherwise cover it.
  - **In focus (`inFocus`):** while a Turn runs, the Parts its draft changes, or else the Part it was asked at. Then the Parts an open Proposal changes. Otherwise the Part the cursor is in. The field listens to the existing `showAgentWork` and `showProposal` effects, so nothing new is dispatched for it. The located units are cached per document, so a cursor move doesn't re-parse.
  - **A Visual Part's error** is a badge on its label line (`✕ eval` / `✕ playing`, as the status line words it). `labelLine` moved from `agentWork.ts` to `place.ts` so both share it.
- **`src/ui/codeView.svelte.ts`:** `CodeViewState` holds the view Alt-H chose (UI state, like `PeekState`). `shownCodeView` reveals a Proposal: with no code, it shows the focus view. `visualErrorOf` picks the error slot when it holds a non-deleted Visual Part's error.
- **The views** are classes on the editor (`cm-code-all|focus|none`). They hide with `visibility` on the lines, widgets and layers, never on `.cm-content`, so focus and every key keep working. The Instruction input stays visible in every view.
- **`App.svelte`:** the corner chip (`✕ viz`, with the message as its title) shows while code is hidden. **`StatusLine.svelte`:** a panel under the status line, thinned to 80% with no border while the code is hidden. It also shows `focus only` / `code hidden`.
- **Agent widgets** (draft, Proposal, ghost, badges, Instruction input) were already on solid `--color-panel` backgrounds, so they are unchanged.
- **Tests:** in Node, the Alt-H cycle, the reveal, `inFocus` and `visualErrorOf`. In the browser editor tests, the band follows the cursor and the agent, the band is full-width while the other boxes hug their text, Alt-H keeps focus, each view hides what it should while keys still work, and the badge. I broke the CSS rules and the Proposal wiring in turn to confirm that each test fails.
- **Manual check:** Playwright screenshots of the running app (headless Chromium, SwiftShader) over the busy-colour preset and a white frame (the strobe's bright phase), in all three views, plus the badge, the chip and the peek over white. The presets' `pulse()` was replaced with `time`, since ticket 14 isn't built. On `main` the code is unreadable over white; with this change it reads in every view.

Decisions beyond the spec:

- **The focus can be several units.** A Proposal or draft that changes several Parts, or the Preamble, bands all of them. Otherwise the focus view would hide half the diff the Proposal reveal exists for. The cursor alone never bands the Preamble.
- **The ghost is hidden in the focus view.** It is never in focus.
- **The chip also shows in the focus view.** The broken Part's label line may be hidden there. When the broken Part is in focus, the badge and the chip both show.
- **The status line is 95% opaque, not 100%.** Over a fully opaque element, headless Chromium culled the WebGL canvas at the wrong edge, so a strip at the top of the screen showed the page background. I haven't checked whether a real GPU does the same. 95% looks the same.

Known limits:

- **Alt-H does nothing while the Instruction input has focus.** CodeMirror's keymap doesn't reach the widget's `<input>`.
- **The visuals canvas's drawing buffer stayed 300×150** in the headless runs: Hydra's `width`/`height` options didn't size it, so the picture is upscaled. This dates from ticket 13 and is worth checking on a real laptop. Ticket 19's frame-time work is a natural place to fix it.
- **Not checked on a laptop GPU or with a real strobe at speed.** The screenshots are software-rendered stills.
