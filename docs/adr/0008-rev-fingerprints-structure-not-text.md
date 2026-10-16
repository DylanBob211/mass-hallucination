# The Rev fingerprints the code's structure, not its exact text, so a Format changes nothing

The human Formats the Source with Prettier, and Prettier changes more than whitespace: it joins
and breaks lines, but also writes `.8` as `0.8`, adds or drops parentheses and semicolons, and
rewrites every string to one quote style. If the Rev were a fingerprint of the exact text (as it was
until now), every Format would make open Proposals Stale, get the agent's changes in a Turn
refused, and give every live Part Unapplied edits, though nothing heard or drawn had changed. So
the Rev is a fingerprint of the parsed program: its structure, every string exactly as quoted
(quotes decide what is Mini-notation, so they are code), and its comments. Unapplied edits compare
Live code the same way. A Part that does not parse has the Rev of its exact text.

## Considered Options

- **Exact-text Rev (the old rule).** Simplest, but turns every Format into a conflict with the
  agent; rejected for that.
- **Token Rev (ignore only whitespace between tokens).** Survives a whitespace-only formatter, but
  not Prettier's optional-punctuation changes, and treats `return\nx` like `return x`, which parse
  differently.
- **Our own whitespace-only formatter instead of Prettier.** Would have kept a token Rev, but means
  writing and maintaining a JavaScript printer; Prettier plus putting each string's original quotes
  back is a fraction of the work and lays code out better.

## Consequences

- A Format changes the quotes back after Prettier runs, and is refused unless the Rev of every Part
  and the Preamble is unchanged by it. This check is what makes a Format safe.
- Accepting a Proposal replaces the human's Layout of that Part with the agent's.
