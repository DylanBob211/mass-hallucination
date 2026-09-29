# pair-formance

A browser live-coding environment where a human codes music and visuals, and an AI pair-programmer inspects and modifies the live-coding state alongside them.

## Language

### What the agent perceives

**Performance**:
The whole live-coding state a human and an agent work on together: its source, the Parts projected from it, transport, and the last error. Its Parts may be audio or visual.
_Avoid_: Session, Patch, Sketch, "the buffer"

**Source**:
The verbatim text of a Performance, exactly as the human typed it. The single truth; everything else about a Performance is derived from it.
_Avoid_: Buffer, document, script

**Part**:
One separately addressable named unit of a Performance, identified by its label in the Source. A projection over the Source, never a fragment that stands alone.
_Avoid_: Slot, track, voice, block, snippet

**Preamble**:
Top-level code in a Performance that belongs to no Part — shared helpers, whole-Performance transforms, settings.
_Avoid_: Header, globals, setup

**Surface**:
The medium a Part produces output on: **Audio** or **Visual**. Read from the Part's code, never
declared separately: a Part written in the visual language is Visual, any other Part is Audio.
_Avoid_: Target, output, channel, backend, layer

**Visual Part**:
A Part on the Visual Surface. It follows the music only by reading it through its code (the cycle,
another Part's events or values, or another Part's loudness); nothing outside the code records the
link.
_Avoid_: Visualiser, scene, shader, sketch

**Transport**:
Whether a Performance is running, and at what tempo. Excludes position within the cycle, which is machinery rather than something the agent perceives.
_Avoid_: Clock, playback state

### How a Part relates to what is heard

**Live code**:
The text of a Part as of the last successful evaluation — what is actually running. Distinct from the Part's current text, which may not have been applied yet.
_Avoid_: Active code, compiled code, sounding code

**Unapplied edits**:
The condition of a Part whose text has diverged from its Live code: written but not yet running. A normal state, not a fault.
_Avoid_: Dirty, staged, pending, uncommitted

**Apply**:
The act of making some Parts' current text the Live code — what turns written text into sounding
text. Out-of-scope Parts keep their Live code, so an Apply is never hostage to work in progress
elsewhere in the Performance. Deleting a Part is an Unapplied edit too: it keeps sounding until
an Apply whose Scope is every Part.
_Avoid_: Evaluate, run, commit, deploy

**Scope**:
The set of Parts an Apply intends to make live. The widest Scope is every Part; a narrow Scope is
how one voice changes while the rest keep sounding exactly as they are.
_Avoid_: Selection, target, range

**Rev**:
A short fingerprint of a Part's exact current text, by which an agent states which text it read.
Derived from the Source, never stored: the same text always has the same Rev.
_Avoid_: Version, revision number, etag

**Muted / soloed**:
Conditions of a Part, read from its label rather than held anywhere. A Part is muted or soloed only because its Source says so. A muted Visual Part is not drawn. Soloing works within one Surface: soloing an Audio Part silences the other Audio Parts and leaves the Visual Parts showing, and the other way round.

### How the agent's changes land

**Autonomy**:
How far an agent's change goes without the human: **Propose**, **Write** or **Apply**. Set only by
the human, at any moment; the agent's request is the same at every level.
_Avoid_: Mode, trust level, yolo mode, permissions

**Propose**:
The Autonomy at which an agent's change becomes a Proposal and nothing else. The default.

**Write**:
The Autonomy at which an agent's change goes into the Source as Unapplied edits, for the human
to Apply.

**Apply** (as an Autonomy):
The Autonomy at which the agent's change goes into the Source and is Applied by the agent itself.
The same act as any other Apply; only who triggers it differs.

**Proposal**:
An agent's change offered for the human to review, changing neither the Source nor what is heard
until accepted. A Performance has at most one open Proposal; asking again replaces it.
_Avoid_: Suggestion, diff, draft, pull request

**Stale**:
The condition of a Proposal whose Parts the human has edited since it was made. A stale Proposal
cannot be accepted.
_Avoid_: Outdated, conflicted, invalid

### How the human and the agent talk

**Instruction**:
What the human asks of the agent, in their own words. Every Instruction reaches the agent together
with the Performance as it is at that moment. It may be aimed at one Part, as a hint and never a
restriction: the agent may still change any Part.
_Avoid_: Prompt, message, command, request

**Turn**:
The agent's work on one Instruction. It ends when a change lands, when the agent answers without
changing anything, or when a newer Instruction supersedes it. Ending a Turn never undoes a change
that has already landed.
_Avoid_: Run, step, session, request
