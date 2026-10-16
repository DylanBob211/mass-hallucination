# Map: An autonomous agent with taste

Label: `wayfinder:map`

## Destination

A **buildable spec for the autonomous agent's structure**: an agent that pursues a **Brief** on its own initiative, deciding when to change the Performance, what to change, and whether the change was any good, built from an explicit state machine and typed decisions rather than one big system prompt. It is built so a developer can easily edit and compare its states and policies. The map closes when every decision is locked tightly enough to hand to a normal build cycle. **No code is produced on the map**; prototypes are throwaway.

## Notes

- **Domain**: browser live-coding of music (Strudel) and visuals (Hydra). Read [`CONTEXT.md`](../../CONTEXT.md) and [`docs/adr/`](../../docs/adr) first. The POC is built ([spec](../ai-live-coding-poc/spec.md)), so its decisions hold unless a ticket here reopens them.
- **Skills every session should consult**: `/grilling` and `/domain-modeling` by default; `/research` for research tickets; `/prototype` for prototype tickets.
- **Think like a DJ / VJ.** The agent reads the room, works in phrases, builds and releases tension, and knows when to leave a good thing alone. Use this as the yardstick for cadence, taste and how it looks while it plays.
- **Central hypothesis (to test, not assume):** a **state machine** owns the flow; a fast, typed **decider** (Jev, an OpenAI equivalent, or a small Claude call with structured output) answers small questions such as "act now?", "next state?" or "better or worse?"; the **writer** (Claude through `change_parts`) only writes code. xstate and Jev are candidates, not commitments: Effect may already be enough.
- **In the room (decided at charting):** design for the agent as an **autonomous co-performer** that the human can play alongside, edit around and steer; a solo run where the human only watches is the special case where they do nothing. ADR 0003 holds: the agent never touches text the human hasn't applied.
- **Initiative is a new way of using AI here, separate from Autonomy.** Autonomy keeps meaning how a change lands; whether the agent acts on its own is a separate thing.
- **Perception is reopened.** ADR 0001 and POC ticket 03 kept the agent code-only; judging taste may need more senses.
- **"Improve over time"** means developer-time (editing and comparing machines between runs) and within one Performance (the agent judging and adjusting). Cross-session learning is out of scope.
- **POC scale.** Localhost, the loop in the browser (ADR 0005), and runs bounded in time and money.
- **Four acceptance scenarios.** Every ticket is judged against all four:
  1. *Leave it alone*: Brief "something melancholic and underwater", empty Performance; it builds and evolves the piece for 10 minutes, never breaks audibly, never loops aimlessly.
  2. *Play along*: the human edits `drums` mid-run; the agent adapts around it without touching it.
  3. *Steer it*: the Instruction "less busy" changes where it's heading without restarting it.
  4. *Notice a bad change*: it makes a change, judges it worse than before, and reverts or repairs it.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [03 — What the agent can perceive](issues/03-perception.md): **host-computed text digests of about 1K tokens per snapshot, and no audio to any model.** The digests are `queryArc` events per Part over the next 8 cycles (also for a proposed change, at dry-run), loudness and spectrum for the mix and for `.analyze`d Parts, and change markers including a motion-to-audio correlation. A 2×2 strip of Hydra frames (about 450 tokens) is added only for visual work, and how well Claude judges such frames is untested. Judging a change after it lands means letting it play, which reopens ADR 0004. Research on branch `research/03-perception`.
- [01 — State machines in an Effect codebase](issues/01-state-machines-in-effect.md): **a hand-rolled machine as data (a `Data.TaggedEnum` of states and events plus a transition table) run by a small Effect interpreter, with no library.** The interpreter keeps state and history in `SubscriptionRef`, takes events through a `Queue`, interrupts each state's activity through a `FiberHandle`, gets its deciders from a `Policies` Layer, and reuses `AgentApplies` for musical time. `@effect/experimental` Machine was rejected as the wrong shape, and xstate because it runs outside the fiber; revisit xstate's pure `transition()` only if hierarchy is ever needed. Research on branch `research/01-state-machines-in-effect`.
- [02 — Typed decision APIs](issues/02-typed-decision-apis.md): **Haiku 5.5 structured output behind our own `Decider` service (predicate / choice / score, with an optional probability), no separate vendor yet.** OpenAI's equivalent is the beta Decisions API. Jev is cheapest but early access and rejects `localhost` CORS. Claude gives no real probabilities, calibration is unproven everywhere, and no candidate takes audio. A bake-off comes later, once confidence thresholds matter. Research on branch `research/02-typed-decision-apis`.

## Not yet specified

- **The run record and experiment bench.** What a run records (the Brief, every decision with its inputs, changes, judgements) so two machines can be compared on the same Brief, and whether runs replay or are scored offline. It depends on the machine's states (05) and the judgements (04). The record is in scope; a full eval suite is not.
- **Budget and stop conditions.** How a run is bounded (time, dollars, cycles), what happens at the limit, and how cost splits between decider and writer calls.
- **Reverting a bad change** (scenario 4). Whether "worse" leads to a revert to the previous Live code, a repair, or simply a next move, and how a revert lands given the Autonomy rules and Unapplied edits.
- **What becomes of the POC's Turn and the one-change rule** under self-initiated work: whether an autonomous step is a Turn, and whether "at most one landed change" still holds.

## Out of scope

- **Taste by prompt experiments.** Making it *beautiful* is a later effort that runs on top of this structure and its run record.
- **Cross-session learning.** Memory or learned taste carried between Performances.
- **Multiple agents.** Several autonomous performers, or agents reacting to each other.
