# Source is truth; Parts are a parsed projection

A Performance needs separately addressable Parts so an agent can change the hats without touching the bassline, but the human must keep live-coding in ordinary text. We therefore treat the **Source as the single truth** and **derive Parts from it by parsing top-level labels** — rather than holding a structured Part list and serialising it into text, which is the shape Strudel's own granularity story pushes toward.

## Considered options

- **Source generated from a Part list.** The structured model is truth and the editor edits one Part at a time. Rejected: it puts a structure between the human and their text, and the POC's premise is that the human keeps live-coding normally.
- **Two-way binding.** Rejected outright — the expensive option, buying nothing here.

## Consequences

- Parts are a **projection, not a partition**: the agent perceives the verbatim Source *and* the Part index over it, so nothing is ever visible only as a fragment.
- Parsing yields the label-to-character-range map as a byproduct — which is the only route to attributing a sounding event back to a Part, since Strudel's per-Part `id` reaches nothing.
- Whether an agent change is applied by re-evaluating the whole Source or one block becomes a pure apply-strategy choice, invisible to the model. That keeps the published-Strudel vs `main` question independent of the domain model.
- Text that belongs to no label must be modelled explicitly (the Preamble) so a Part splice can never silently clobber it.
