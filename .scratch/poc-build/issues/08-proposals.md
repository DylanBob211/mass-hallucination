# 08: Proposals

**What to build:** At Propose Autonomy, a passing change becomes a Proposal the human sees inline and accepts, accepts & plays, or rejects from the keyboard; if the code moved underneath it, it goes Stale instead of landing. See [spec §6.2, §10](../../ai-live-coding-poc/spec.md), ADR 0003, ADR 0007.

**Blocked by:** 07 (`change_parts` pipeline, landing by Write and Apply).

**Status:** ready-for-agent

- [x] Propose Autonomy lands as an open Proposal in the view model; a new Proposal replaces the open one
- [x] Inline diff under the Part: old lines struck through, new text beneath; new Parts shown at the end
- [x] Alt-A accept (writes), Alt-P accept & play (writes and Applies immediately, human), Alt-R reject; façade `accept/acceptAndPlay/reject`
- [x] Accept re-runs the Rev and Unapplied checks; failure marks the Proposal Stale, which can only be dismissed
- [x] Node tests for accept, accept & play, reject, replacement and Stale

## Comments

**Implemented (2026-09-30).**

- `ProposalStore` (`src/core/ProposalStore.ts`) holds the one open Proposal: the `change_parts` changes as asked, each with the rev it was checked at, and a `stale` flag. `propose(onto, changes)` opens it, replacing the open one, only if the Source is still the one the pipeline checked (else `SourceMoved`, and the pipeline goes round again, as a write does).
- `change_parts` at Propose now lands as `proposed`: nothing is written, evaluated or made Live code.
- `accept` re-runs the shape, Rev and Unapplied checks (`refusalOf`, moved to `src/core/checks.ts`) on the Source as it is now. If they pass, it writes the texts as one agent write (as a Write landing does) and closes the Proposal. If not, the Proposal becomes Stale and stays open. `acceptAndPlay` then Applies the touched Parts at once through `LiveCodeStore.apply(scope, written)`: the human times it, so there is no cycle-boundary wait. It starts the transport like Ctrl-Enter. `reject` closes the Proposal, Stale or not. All three are on the façade, and `Alt-A`/`Alt-P`/`Alt-R` call them.
- The view model gains `proposal: { changes: [{ part, text, added }], stale }`.
- `src/ui/proposal.ts` draws the inline diff as CodeMirror decorations: the Part's current text struck through, and its new text in a solid block beneath it. A new Part's block goes at the end of the Source, and a Preamble change's block goes under its first segment. The last block carries focus-safe buttons. A Stale Proposal is greyed out and offers only "Alt-R dismiss". The façade exports the pure `locateUnits` so the UI can find the Parts without importing the core.

Decisions beyond the spec:

- **Stale is found as the human types, not only at accept.** A fiber marks the Proposal Stale as soon as its Parts are edited, so it greys out before the human tries to accept it. The accept-time check still runs, which covers keystrokes the fiber hasn't seen yet.
- **Once Stale, always Stale.** Undoing the edit doesn't bring it back. CONTEXT.md says "edited since it was made", and a Proposal that greys out and then comes back would be confusing.
- **Accept & play's Scope is the Parts the Proposal touched**, not every Part, so it never plays the human's Unapplied edits elsewhere (ADR 0003's rule). An evaluation error leaves what played playing, and the error slot shows it.
- A Proposal stays open when the Autonomy changes. A later Write or Apply landing on its Parts makes it Stale.

Known limits:

- No façade test opens a Proposal, because nothing can open one through the façade until `instruct` exists (ticket 10). The behaviour is tested in the core (`changeParts.test.ts`, `ViewModelStore.test.ts`), and the widget and keys in `src/ui/editor.browser.test.ts`.
- Dry-run warnings from a proposed change reach the agent but are not kept on the Proposal. The status line has no warnings slot yet.
- `locateUnits` widens the façade beyond spec §10's list. The diff's positions must follow the document on every keystroke, and the view model doesn't carry positions.
- Alt-A/P/R are always consumed, even with no Proposal open, as the keymap can't see the view model.
- `land` re-checks the Source before it opens a Proposal, but not the Live code. This is the same as a Write landing, and ADR 0003's rule still holds.
- Alt-H revealing hidden code for a Proposal, and the focus band, are ticket 18's.
