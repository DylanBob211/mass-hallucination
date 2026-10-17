# 12 — How a DJ / live-coder shapes a set

Type: research
Status: resolved
Blocked by: —

## Question

The agent is always *in* some **Section** of the piece it is building (intro, build, drop, breakdown, outro), and the Section decides which moves are welcome: no fiddling mid-drop just because nothing changed for a while. What does DJ, VJ and live-coding practice say about structure, so the Sections, their lengths and their dispositions can be written down as configuration?

1. **The sections** a set or track moves through, the names DJs, producers, live-coders and VJs use, how long each typically runs, and how each is signalled.
2. **Phrasing**: the 8/16/32-bar conventions and where changes conventionally land (on the phrase, before the drop, never mid-drop).
3. **When DJs intervene and when they leave it alone**, per section: what they add, remove or hold.
4. **How a section shows in the sound** (density, loudness, low end, brightness), so host-computed digests (ticket 03) can tell whether the music sounds like the Section the agent intends.
5. **Live-coding practice specifically** (Algorave, TOPLAP, Strudel/Tidal performers): how people build structure while writing the piece live, rather than mixing finished tracks; and how VJs follow structure visually.

Deliver the findings in a shape that can become a configurable table: per Section, its typical length in phrases, its sonic signature, and its disposition (moves welcomed, moves forbidden).

## Answer

**Sections follow a known order and land on 16-bar phrases. Each has a sonic signature the host digests can check, and a disposition that can be written down as configuration.**

- **Names:** the Raveform corpus (TISMIR 2026) labels intro, buildup, drop, breakdown, cooldown, bridge and outro. rekordbox uses Intro, Up, Down, Chorus, Bridge, Verse and Outro. The typical order is intro, build, drop, breakdown, build, drop, (cooldown), outro.
- **Phrasing:** the most common section is 16 bars. Changes fall on multiples of 4 or 8 bars, and DJ transitions peak every 32 beats. In Strudel one cycle is one 4/4 bar (`setcpm(bpm/4)`), so **a phrase is 16 cycles**, and the 8-cycle digest from ticket 03 covers half a phrase. Fills of up to 4 beats close a phrase.
- **Sound:** loudness and spectral flux follow a U-shape. They fall suddenly at the breakdown (kick and bass removed), rise through the build (risers, filter opening) and peak at the drop (full bassline back). **Judge each Section against the run's own loudest phrase so far**, not against a fixed level.
- **Intervention:** DJs mix over intros and outros and hand the low end from one track to the other. They rarely touch tempo or key. "Never mid-drop" is an inference from these findings; no source states it as a rule.
- **Live coding:** "structure is provided by the live coder, who is continually changing the pattern" (McLean). Blank-slate sets are common. Strudel's `arrange`, `pick` and `lastOf` can write structure into the code itself.
- **VJ:** rekordbox Lighting picks a lighting scene per phrase type, and an intensity (Mood HIGH/MID/LOW) from tempo, rhythm, kick and density.

| Section | Phrases | Signature | Welcomed | Forbidden |
|---|---|---|---|---|
| Intro | 1–2 | percussive, sparse, steady | add a layer every 4–8 bars | full density, removals |
| Build | 1–2 | rising density, loudness, brightness; low end withheld | percussion, risers, filter opening, end fill | removing energy, early low end |
| Drop | 2–4 | max loudness, full kick and bass, dense | hold; one small change per 8 bars, on the boundary | mid-phrase edits, removing low end |
| Breakdown | 1–2 | sudden fall, no kick or bass, pads | cut the low end at once; new harmony | bringing the kick back, a gradual build-up |
| Outro | 1–2 | percussive, thinning | remove a layer every 4–8 bars | new material |

**Gaps:** no source gives section lengths broken down by section type, and no study measures how live-coded sets are structured.

Findings: `.scratch/autonomous-agent/research/12-how-a-dj-shapes-a-set.md` on branch `research/12-how-a-dj-shapes-a-set`. **Not pushed** (SSH key unavailable), so the branch is local only.
