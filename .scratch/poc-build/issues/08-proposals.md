# 08: Proposals

**What to build:** At Propose Autonomy, a passing change becomes a Proposal the human sees inline and accepts, accepts & plays, or rejects from the keyboard; if the code moved underneath it, it goes Stale instead of landing. See [spec §6.2, §10](../../ai-live-coding-poc/spec.md), ADR 0003, ADR 0007.

**Blocked by:** 07 (`change_parts` pipeline, landing by Write and Apply).

**Status:** ready-for-agent

- [ ] Propose Autonomy lands as an open Proposal in the view model; a new Proposal replaces the open one
- [ ] Inline diff under the Part: old lines struck through, new text beneath; new Parts shown at the end
- [ ] Alt-A accept (writes), Alt-P accept & play (writes and Applies immediately, human), Alt-R reject; façade `accept/acceptAndPlay/reject`
- [ ] Accept re-runs the Rev and Unapplied checks; failure marks the Proposal Stale, which can only be dismissed
- [ ] Node tests for accept, accept & play, reject, replacement and Stale
