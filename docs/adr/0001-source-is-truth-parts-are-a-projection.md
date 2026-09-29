# Source is truth; Parts are a parsed projection

_Amended by ticket 16 (visual Parts): a Part's Surface is derived from the Source too. See the amendment at the end._

A Performance needs separately addressable Parts so an agent can change the hats without touching the bassline, but the human must keep live-coding in ordinary text. We therefore treat the **Source as the single truth** and **derive Parts from it by parsing top-level labels** — rather than holding a structured Part list and serialising it into text, which is the shape Strudel's own granularity story pushes toward.

## Considered options

- **Source generated from a Part list.** The structured model is truth and the editor edits one Part at a time. Rejected: it puts a structure between the human and their text, and the POC's premise is that the human keeps live-coding normally.
- **Two-way binding.** Rejected outright — the expensive option, buying nothing here.

## Consequences

- Parts are a **projection, not a partition**: the agent perceives the verbatim Source *and* the Part index over it, so nothing is ever visible only as a fragment.
- Parsing yields the label-to-character-range map as a byproduct — which is the only route to attributing a sounding event back to a Part, since Strudel's per-Part `id` reaches nothing.
- Whether an agent change is applied by re-evaluating the whole Source or one block becomes a pure apply-strategy choice, invisible to the model. That keeps the published-Strudel vs `main` question independent of the domain model.
- Text that belongs to no label must be modelled explicitly (the Preamble) so a Part splice can never silently clobber it.

## Amendment: visual Parts (ticket 16)

A Part's **Surface** (Audio or Visual) is read from its code like its mute and solo, and never
stored. A Part whose expression is a host `hydra` tagged template (``viz: hydra`osc().out()` ``) is
Visual; every other Part is Audio. The label stays the only identity, so "Parts are top-level
labels" holds unchanged across Surfaces. The template body is not transpiled by Strudel and sees
only Hydra's names plus the host's link helpers (`cycle`, `pulse`, `value`, `level`), so the two
languages never share a namespace. A link between a Visual Part and an Audio Part is only code (a
helper naming a label); the model stores no link.
