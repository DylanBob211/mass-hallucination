# Agent changes land by Autonomy, and never on unapplied text

The agent makes one kind of request: "change these Parts to this text". Where that change goes is
decided by the host from the human's **Autonomy** setting, not by the agent. At **Propose** (the
default) it becomes a Proposal: a diff the human can accept (into the Source as Unapplied edits),
accept and play (Applied at once), or reject. At **Write** it goes into the Source as Unapplied
edits. At **Apply** it goes into the Source and is Applied. The agent cannot read or change its own
Autonomy, so it can never escalate itself.

At every level one rule holds: **the agent never touches text the human hasn't applied.** Each
request carries the text the agent read for every Part it changes (identified by its **rev**, a content hash; see ADR 0004). If any of those Parts has
changed since it was read, or holds the human's Unapplied edits, the whole request is refused
atomically and the agent is told why. Nothing is merged, and nothing is overwritten. The same check
runs again when a Proposal is accepted; a Proposal that fails it is **Stale**.

Because of that rule, nobody has to choose a Scope. An agent Apply's Scope is exactly the set of
Parts its change touched (the Preamble included, if it touched the Preamble), and none of those
Parts can be holding the human's work in progress. The Scope is never shown and there is nothing
to override.

## Considered options

- **Propose-only.** Safe, but it puts a gate in front of every interaction. It survives as the
  default, not the only level, because the human wanted to decide how independent the agent is.
- **Direct write only, or agent-owned regions, or a hybrid split by who wrote a Part.** Rejected.
  Ownership would be state stored beside the Source, which ADR 0001 rules out, and owned regions
  make *vary what I have* impossible.
- **Overwrite or merge on collision.** Rejected. In the prototype, merging the agent's edit into
  the human's half-typed `gain(.8` produced text that could not evaluate, and the human's work was
  lost as well.
- **Treat the human's cursor as a claim on a Part.** Rejected. Typing is the claim, and typing
  produces Unapplied edits, which the rule above already protects. An agent write carries the
  cursor along with the text.

## Consequences

- **Every agent request is dry-run first, at every Autonomy.** Propose and Write evaluate nothing,
  so without a dry-run the default level would hand the human code the agent never ran, and the
  agent's error-correction loop (from 06) would only exist at Apply. Evaluation errors go back to
  the agent as the tool result, and only code that validates becomes a Proposal, a write or an
  Apply. The mechanism is feasible on published Strudel 1.2.6 without disturbing playback. It
  runs the transpiler inside a stubbed sandbox and queries one cycle with `query`. It **cannot**
  catch errors that only happen at playback, such as unknown sound names. Specifying it is 05's
  job.
- **An agent-triggered Apply is quantised to the next cycle boundary; a human-triggered one is
  not.** The human times their own Ctrl-Enter or Accept-and-play, but the agent lands whenever its
  latency runs out.
- **A Part with no Live code contributes nothing to an agent Apply.** This locks the rule ADR 0002
  held provisionally.
- **Amends ADR 0002: a Part missing from the Source keeps its Live code** until an Apply whose
  Scope is every Part. Otherwise a narrow agent Apply would sound the human's unapplied deletion,
  which breaks the rule above. A rename is a deletion plus a new Part.
- **A Performance has at most one open Proposal.** Asking again replaces it.
- **For the POC, undo is the editor's single history, and it undoes text only.** An agent write or
  an accepted Proposal is one Ctrl-Z step, and undoing it changes nothing audible until the next
  Apply. This is known to feel wrong at Apply Autonomy. Whether agent-written changes deserve their
  own revert path (restoring text *and* Live code), and whether that depends on Autonomy, is left
  for the version after the POC.
- The human's only Apply gesture in the POC is Ctrl-Enter (every Part). Apply-Part-at-cursor is
  deferred, not rejected.
