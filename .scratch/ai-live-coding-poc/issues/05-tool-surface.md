# 05 — The tool surface

Type: grilling
Status: resolved
Blocked by: 03, 04

## Question

Specify the "small, controlled set of tools" the agent gets — names, signatures, arguments, return shapes, and errors. Small is a requirement, not an aspiration: every tool must be justified by one of the three acceptance scenarios.

Decide:

- Which tools exist. Sketch: read current state, modify/replace code (shape dictated by ticket 04), evaluate, inspect transport. Argue each one in or out.
- Whether modification is **whole-buffer replace**, **targeted patch/diff**, or **structured edit of a named part** — this follows from 03 and 04 and should not be re-litigated here, only expressed.
- What each tool **returns**, including on failure. A tool that fails silently is worse than no tool.
- Whether the agent can **read** state on demand, or whether current state is pushed into its context every turn.
- What the agent is structurally prevented from doing (stopping the transport? deleting everything?), and whether prevention lives in the tool definitions or in the UI.
- How the tool set would extend to a second surface later, without building for that now.

## Carried in from 04

[04](04-apply-semantics.md) / [ADR 0003](../../../docs/adr/0003-agent-changes-land-by-autonomy-never-on-unapplied-text.md) fixed these; express them, don't re-litigate:

- **One change request, whatever the Autonomy.** The agent asks "set these Parts to this text"; the host lands it as a Proposal, a write or an Apply. The agent cannot read or set its Autonomy. Whether it is *told* where its change landed (`landed: "proposed" | "written" | "applied"`) is yours.
- **The request carries the text the agent read for each Part it changes.** It is refused atomically, with a reason, if any Part changed since the read or holds the human's Unapplied edits. Design the error so the agent can re-read and retry.
- **No Scope argument.** An agent Apply's Scope is the set of Parts touched, the Preamble included if touched.
- **Every request is dry-run first**, at every Autonomy. Only code that validates lands. Specify the mechanism here, starting from the route in 04's answer (stubbed transpiler sandbox, `.p`/`.play` swap, strict `query` over one cycle, serialised against real evaluates). Mind its blind spot: playback-time errors pass. This supersedes 06's "apply returns `{ok, activeCode | error}` synchronously": the synchronous error now comes from the dry-run, and `activeCode` exists only at Apply.
- New Parts are appended to the Source. Removing a Part is an Unapplied deletion that keeps sounding until an Apply of every Part, so decide whether the agent may delete Parts at all.

## Deliverable

Tool definitions written out in full, recorded as an ADR.

## Answer

**One tool, state pushed, every change dry-run.** Written out in full in [ADR 0004](../../../docs/adr/0004-one-tool-state-pushed-dry-run-gated.md); new term **Rev** in [`CONTEXT.md`](../../../CONTEXT.md); ADR 0003 now says the read text is identified by its Rev.

- **One tool: `change_parts({ changes: [{ part, rev, text }] })`.**
  - `text` is the whole Part, label included. The Preamble is addressed as `"(preamble)"`.
  - `rev: null` appends a new Part.
  - No deletion and no rename. The agent may mute or solo through the label prefix.
  - Evaluate, transport and read tools, and `queryArc`, are all out. `queryArc` is deferred, not
    rejected.
- **Rev:** the first 8 hex characters of a SHA-256 of the Part's text. It is derived, never stored,
  and replaces echoing the read text.
- **State is pushed with every instruction; there is no read tool.** The snapshot holds:
  - the Source
  - a Part index: rev, unapplied, muted/soloed, surface
  - the Live code of each Part that holds Unapplied edits
  - the transport: `started` and cps
  - the error slot, with its phase
- **Returns:**
  - `ok` with `landed: proposed|written|applied` and optional `warnings`.
  - Otherwise one of: `stale` (with fresh text and rev, to retry with), `unapplied` (the human's
    text is not quoted), `invalid` (the dry-run message, and the Part it points to), `bad_request`.
    Atomic.
- **At most one landed change per instruction:** the first success ends tool use for that
  instruction. This holds for the POC and is to be discussed again later.
- **Dry-run:**
  - It evaluates the composition the Apply would evaluate, queries cycles 0–8 under a time cap,
    and uses 04's mechanism, serialised by a mutex.
  - `hush()` is refused as `invalid`.
  - Control-synonym collisions come back as warnings.
- **Playback errors** reach the agent only through the next snapshot's error slot.
- **Prevention lives in the tool and the dry-run, not the UI.**
  - The agent can't start or stop the transport. An agent Apply on a stopped transport starts no
    sound.
  - It may change tempo with `setcps`.
- **A second Surface** needs only the `surface` tag and its own dry-run, and neither is built now.
