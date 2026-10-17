# Taste is data, kept apart from the machine

The autonomous agent's musical opinions are its **Taste**: its Sections and what each welcomes or
forbids, its Judgements with their thresholds, the decider prompts, and which Judgements feed
each step of the loop. They will be tuned constantly as we learn what sounds good, so they live
as data and prose in one `taste/` folder (`sections.yaml`, `judgements.yaml`, `loop.yaml`,
`prompts/*.md`), never inline in code. Measurements that need code, such as computing Energy from
the digests, live in `taste/heuristics/` as small named functions, and the data refers to them
only by name. The code only interprets the Taste.

How the agent *works* (its states and transitions) is a different thing that changes for
different reasons. It stays in one transition-table file in code (autonomous-agent ticket 01),
where the type checker catches a transition to a state that doesn't exist.

## Considered Options

- **Taste inline in the agent's code.** Rejected: musical choices would be scattered, and every
  tweak would be a code change.
- **The transition table in `taste/` as YAML too.** Rejected: a typo in a state name would surface
  only at run time, and the steps change far less often than the Taste.
- **Taste editable live in the app, mid-run.** Deferred: a run whose Taste changed halfway can't be
  compared as one experiment.

## Consequences

- The Taste is loaded when a run starts and fixed for the run. Every run records the exact Taste
  it used (a hash plus a copy), so two runs on the same Brief can be compared knowing what differed.
- Each Judgement is a unit that declares the senses it reads, its mechanism (a named heuristic or
  a decider prompt), its timing and its output. Swapping one is a one-unit edit, through the
  `Policies` Layer.
