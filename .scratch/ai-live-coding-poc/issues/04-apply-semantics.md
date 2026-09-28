# 04 — Apply semantics: how agent changes land without stealing the instrument

Type: prototype
Status: resolved
Blocked by: 01, 03, 12

## Question

**The crux of the POC.** The brief's hardest constraint is that "changes can be applied during the session without destroying the human's ability to keep editing and performing." This ticket decides what happens, concretely, in the seconds around an agent edit — and it is what separates a collaborator from a robot with your keyboard.

Candidate shapes to react to (build the cheapest artifact that makes the difference *felt*, per `/prototype`):

- **Propose and accept** — the agent produces a diff; nothing changes until the human accepts. Safe, but adds a gate to every interaction and may kill the sense of playing *with* someone.
- **Direct write with undo** — the agent edits the buffer live; the human can rewind. Fast and collaborative, but the cursor/selection collision problem is real.
- **Agent-owned region** — the agent writes only into parts it owns; the human's parts are untouchable. Sidesteps collision entirely, at the cost of the *vary what I have* scenario.
- **Hybrid** — e.g. direct write for additions, propose-and-accept for in-place modification of the human's code.

The decision must survive all three acceptance scenarios, and must answer: what happens to the human's cursor and undo stack? Is the change applied to the buffer, evaluated, or both? Is application quantised to a cycle boundary, or immediate? What does the human see at the moment of an agent edit?

## Carried in from 12

[12](12-strudel-build-target.md) settled the *mechanism* — an Apply evaluates a composition of every Part's **Live code** with only the in-**Scope** Parts substituted — and left two things for this ticket to judge by feel, in the prototype:

- **A Part with no Live code contributes nothing to a composition.** Provisionally agreed, not locked: the *add a part* scenario is exactly where it will be felt (the agent applies `bass:` while the human has an unrun `lead:` on screen).
- **Who chooses the Scope, and how visible it is.** The agent can pick any Scope from one Part to everything; whether the human ever sees or overrides that choice is this ticket's.

## Deliverable

A linked throwaway prototype plus an ADR recording the chosen semantics and what was rejected.

## Answer

**A switch, not a single shape.** The human sets the agent's **Autonomy** to **Propose** (the default), **Write** or **Apply**. The agent makes the same request at every level, and the host decides where it lands. Under every level sits one rule: **the agent never touches text the human hasn't applied.** Recorded as [ADR 0003](../../../docs/adr/0003-agent-changes-land-by-autonomy-never-on-unapplied-text.md); new terms (**Autonomy**, **Propose / Write / Apply**, **Proposal**, **Stale**) are in [`CONTEXT.md`](../../../CONTEXT.md).

**Prototype:** `.scratch/ai-live-coding-poc/prototypes/04-apply-semantics.PROTOTYPE.html` on the throwaway branch `prototype/04-apply-semantics` (commit `78859c6`). It is a single-file logic demo: a pure Apply model, policy toggles and six walkthroughs (the three scenarios, typing in the target Part, a stale read, an unrun `lead` beside an agent `bass`, undo compared with revert, and a Part deleted but not applied). The same commit holds the dry-run experiments (`prototypes/04-dry-run/`).

### The ticket's four questions

- **Buffer, evaluated, or both?** It depends on Autonomy. *Propose*: neither; it becomes a Proposal, a diff with **Accept** (into the Source as Unapplied edits), **Accept & play** (Applied at once) and **Reject**. *Write*: into the Source as Unapplied edits, which the human Applies. *Apply*: into the Source and Applied. Only the human changes the Autonomy, at any moment, and the agent can't escalate itself.
- **Quantised or immediate?** An Apply the agent triggers (Apply Autonomy) waits for the **next cycle boundary**. An Apply the human triggers (Ctrl-Enter, Accept & play) is **immediate**. The human times their own gesture; the agent lands whenever its latency runs out.
- **Cursor?** Not something to design around. An agent write carries the cursor along with the text (a cursor inside replaced text moves to the end of the new text). Resting in a Part is no claim on it; typing is, and typing creates Unapplied edits, which the collision rule protects.
- **Undo stack?** For the POC, the editor's **single shared history, undoing text only**, with no Revert button. An agent write or an accepted Proposal is one Ctrl-Z step, and hearing the undo takes a Ctrl-Enter, as in Strudel today. It is knowingly rough at Apply Autonomy (walkthrough 5). Undo feels different by level: an agent's own write wants a revert of text *and* sound, while an accepted Proposal "feels like code I wrote". That is **deferred to the next version**, not decided.

### Collisions: refuse, per Part, atomically

Each agent request carries the text it read for every Part it changes. If any of those Parts has **changed since the read**, or **holds the human's Unapplied edits**, the whole request is refused and the tool result says why; the agent re-reads and retries, or leaves it. Nothing is merged or overwritten. In the prototype, "overwrite" merged the agent's edit into a half-typed `gain(.8` and produced text that could not evaluate. The same check runs when a Proposal is accepted; a Proposal whose Parts the human has edited is **Stale** and cannot be accepted. **At most one open Proposal**; asking again replaces it (may evolve later).

### Carried in from 12, now settled

- **A Part with no Live code contributes nothing: locked.** In walkthrough 4, `bass` comes in and the unrun `lead` stays silent, and that felt right.
- **Scope is chosen by nobody.** An agent Apply's Scope is exactly the Parts its change touched, Preamble included if touched. The collision rule guarantees none of them holds the human's work in progress, so there is nothing to show or override. Scope stays an internal concept.

### Found here: deletion is an Unapplied edit (amends ADR 0002)

Walkthrough 6 exposed a hole. Composition is built from the Parts in the current Source, so if the human deletes `chords` without applying and the agent then Applies `bass`, **`chords` stops**: the agent's Apply sounded the human's unapplied deletion. Fix: **a Part missing from the Source keeps its Live code until an Apply whose Scope is every Part.** A rename is a deletion plus a new Part.

### The feedback loop needs a dry-run at every Autonomy

06 relies on the tool returning `{ok, activeCode | error}` synchronously. But Propose and Write evaluate nothing, so the default level would hand the human code the agent never ran. **Decision: every agent request is dry-run first, at every Autonomy.** Errors go back to the agent as the tool result, and only code that validates becomes a Proposal, a write or an Apply.

Checked against published `@strudel/web@1.3.0` / `@strudel/core@1.2.6` (Node, same method as 06, scripts on the prototype branch):

- **Possible, with caveats, and no built-in entry point works as-is.** `repl.evaluate(code, false)` still swaps `scheduler.pattern`. Core's `evaluate` runs in global scope, where `setcps` changed the real tempo, `.play()` replaces playback, and `$:`/labels register into the live `pPatterns`.
- **Working route:** `transpiler` plus a local copy of core's ~10-line eval step.
  - `hush/all/each/setcps/setCps/setcpm/setCpm/samples/evaluate` are shadowed as no-op `Function` parameters.
  - `Pattern.prototype.p` is swapped for a collector and `.play` for a no-op during the call, restored in `finally`.
  - The collected patterns are `stack()`ed and `pattern.query(...)`'d over cycle 0–1. It must be `query`: `queryArc` swallows errors.
- **Error messages match** `repl.state.evalError` exactly: syntax, unknown function or method, mini-notation parse. It also catches a query-time error that a real evaluate reports as OK. Afterwards, `pPatterns`, cps, scheduler pattern, `started` and `state.*` were unchanged.
- **Caveats:** dry-runs must be serialised against real evaluates (a mutex); stubbing `samples` hides bad sample-map URLs; `register`/`evalScope` still mutate globals; tied to 1.2.6 internals.
- **Blind spots:** playback-time errors (`s("nosuchsound")` validates as OK), errors past cycle 1 or dependent on randomness or signals, and whether it sounds right.

Specifying the dry-run is **05's** job; this ticket fixes only that the loop exists at every Autonomy.

### Human gestures in the POC

**Ctrl-Enter only** (Apply, every Part). Apply-Part-at-cursor is deferred to a later version, not rejected. What the human *sees* at the moment of an agent edit (flash, attribution, proposal diff UI, Stale marking, the Autonomy switch itself) belongs to **09**.

### Rejected

Propose-only as the sole behaviour (kept as the default instead); direct-write-only; agent-owned regions and ownership-split hybrids (stored ownership contradicts ADR 0001, and owned regions kill *vary what I have*); overwrite or merge on collision; the cursor as a lock; an agent-chosen Scope; one linear history holding agent edits *with* a text-and-sound revert (deferred, not rejected).
