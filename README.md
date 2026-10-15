# Mass Hallucination

*A mass hallucination for an audience of one human and one machine.*

**Live-code music and visuals in your browser, with an AI pair-programmer playing alongside you.**

You write [Strudel](https://strudel.cc) patterns for the sound and [Hydra](https://hydra.ojack.xyz)
sketches for the visuals, all in one editor. Whenever you like, put your cursor on a line, press
`Ctrl-K` and ask for something: *"make the hats busier and swing it"*, *"add a bassline that
fits"*, *"give me visuals that pulse with the kick"*. The AI reads your code, writes a change, and
checks that it runs. The change then lands in a way you control, and **the music never stops while
it works**.

<!-- TODO: a short GIF or video of a session goes here -->

> **Status: proof of concept.** It runs on localhost and is built to answer one question: is a
> semi-autonomous AI performer worth pursuing? It doesn't save your work: refresh and it's gone.

## What it feels like

You start with an empty editor holding a sample bank and a tempo. Type a few labelled lines and
press `Ctrl-Enter`:

```js
samples('github:tidalcycles/dirt-samples')
setcpm(120/4)

kick: s("bd*4")
hats: s("hh*8").gain(.6)
chords: note("<c3 eb3 g3 bb3>").s("sawtooth").lpf(800)
viz: hydra`osc(10, 0.1).color("red").modulate(src(o0), pulse("kick")).out()`
```

Each labelled line is a **Part**: `kick`, `hats`, `chords` and `viz`. The AI works in Parts. It can
change one voice while the others keep playing exactly as they are, even a Part you're halfway
through editing. The `viz` Part draws on a canvas behind your code, and `pulse("kick")` makes it
flash in time with the kick.

### You decide how much the AI is allowed to do

| Autonomy | Key | What happens to the AI's change |
|---|---|---|
| **Propose** (default) | `Alt-1` | It shows up as a proposal. Accept it (`Alt-A`), accept and play it (`Alt-P`), or reject it (`Alt-R`). |
| **Write** | `Alt-2` | It goes straight into your code, but nothing changes in the sound until you press `Ctrl-Enter`. |
| **Apply** | `Alt-3` | It goes into your code and starts playing at the next cycle boundary, so it lands in time. |

You can switch levels at any moment, even while the AI is working.

### Other keys

| Key | Does |
|---|---|
| `Ctrl-Enter` | Run the code (and start playback if it was stopped) |
| `Ctrl-.` | Stop playback |
| `Ctrl-K` | Ask the AI something, aimed at the Part under your cursor (`Tab` aims at everything) |
| `Esc` | Stop the AI's current turn |
| `Ctrl-J` | Peek at what the AI is doing and saying |
| `Alt-H` | Cycle the code overlay: all code, the focused Part only, none |
| `Alt-L` | Download the timing log |

## Getting started

You'll need [Node.js](https://nodejs.org) 22+, [pnpm](https://pnpm.io), and an
[Anthropic API key](https://console.anthropic.com).

```sh
pnpm install
cp .env.example .env.local   # then paste your key into VITE_ANTHROPIC_API_KEY
pnpm dev
```

Open the address Vite prints (in Chrome), click into the editor, and press `Ctrl-Enter`.

> ⚠️ **About that key:** in this proof of concept the AI runs inside the page, so the key is built
> into the JavaScript bundle and sent from your browser. That's fine on localhost. **Never deploy a
> build anywhere public**, because anyone could read the key out of it. Use a dedicated Console
> workspace with a spending limit to be safe.

## How it works

A few ideas hold the whole thing together:

- **The text is the truth.** Your code is the only state. Parts, mutes, solos and whether something
  is a sound or a visual are all read from the text, never stored separately. So the AI and you
  can never disagree about what's on the page.
- **One tool, always checked.** The AI has exactly one tool, `change_parts`. Every change is
  **dry-run** against the real audio and visual engines before it can land. If it doesn't evaluate,
  the AI is told why and tries again, and you never hear the broken version.
- **Change one Part without touching the rest.** Running a Part builds a composition of what's
  already playing, with just that Part swapped in. That's how the AI can rework `hats` while you
  are mid-edit in `chords`, without either of you stepping on the other.
- **It works where you can see it.** While the AI writes, its draft streams into the editor right
  where the change will go, and a single status line says what it's doing.

Under the hood:

- **[Svelte 5](https://svelte.dev)** for the UI, with **[CodeMirror 6](https://codemirror.net)** as
  the editor
- **[Effect](https://effect.website)** for the core logic, the agent loop, and the seams that make
  it testable
- **[`@strudel/web`](https://www.npmjs.com/package/@strudel/web)** and
  **[`hydra-synth`](https://www.npmjs.com/package/hydra-synth)** for sound and visuals
- **[`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk)** talking to Claude
- **[Vitest](https://vitest.dev)**, with fast Node tests using fakes, and browser tests (via
  Playwright) wherever the real Strudel and Hydra engines matter

```
src/
  core/      the domain: parsing Parts, Apply, dry-runs, the agent loop (pure, tested with fakes)
  facade/    the one place Effect meets the UI, plus the live Strudel / Hydra / Claude adapters
  ui/        Svelte components and CodeMirror extensions
  reference/ the Strudel and Hydra cheat-sheets the AI is given, generated by scripts/
```

## How it was designed

This project was planned in the open, in the repo, before any code was written. If you like seeing
how decisions get made, these are worth a look:

- **[`CONTEXT.md`](CONTEXT.md)**: the shared vocabulary. What exactly a *Part*, an *Apply*, a
  *Proposal* or a *Turn* means.
- **[`docs/adr/`](docs/adr)**: seven short Architecture Decision Records explaining the big
  choices and why they were made.
- **[`.scratch/`](.scratch)**: the research, the spec and the ticket-by-ticket build plan.

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm test` | Run all tests (`test:node` / `test:browser` for one half) |
| `pnpm check` | The full check: types, Svelte, lint, format, tests |
| `pnpm build:reference` | Regenerate the AI's Strudel and Hydra reference from the installed packages |

The test in `src/facade/live/model.real.test.ts` calls the real Claude API, and it's skipped
unless a key is set.

## License

The code in this repository is [MIT](LICENSE). Strudel and hydra-synth are licensed under
**AGPL-3.0**, so a build that bundles them falls under the AGPL's terms.
