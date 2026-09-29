# 04: Live code and Apply by composition

**What to build:** Apply becomes the real mechanism: a composition of Live code with the in-Scope Parts substituted, so Unapplied edits elsewhere never sound, and deleted Parts keep sounding until a full Apply. Unapplied state is visible in the view model. See [spec §4 and §5](../../ai-live-coding-poc/spec.md), ADR 0002, ADR 0003.

**Blocked by:** 02 (Play the whole Source), 03 (Parse the Performance).

**Status:** ready-for-agent

- [ ] Live code is stored per Part identity and for the Preamble; nothing else is stored
- [ ] Compose walks the Source in order: in-Scope units give their current text, others their Live code, Parts with no Live code give nothing; deleted Parts with Live code are appended unless Scope is every Part
- [ ] Before each evaluate, the Hydra reset hook point exists (a no-op until ticket 13)
- [ ] Success is decided by correlating `onEvalError`/`state.evalError` with the call, not by the promise resolving
- [ ] On success in-Scope Live code := current text (and deleted Parts dropped on a full Apply); on failure previous Live code keeps playing
- [ ] Unapplied = current text ≠ Live code, or absent from the Source but holding Live code; published per Part in the view model
- [ ] Ctrl-Enter is a human Apply with Scope = every Part; the façade can also Apply a given Scope
- [ ] Node tests over compose/commit with a fake repl, including a deletion and a scoped Apply that leaves an Unapplied Part silent
