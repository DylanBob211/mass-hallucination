# 07 — Memory within a Performance

Type: grilling
Status: open
Blocked by: 05

## Question

The POC agent has no memory between Instructions (POC spec, amending ADR 0005). An agent building on a Brief needs continuity across its own steps. What does it carry within one Performance: a plan or direction, a journal of moves and their judgements, a score history, its reading of the Brief? Where does it live given Source-is-truth (ADR 0001), how is it kept small enough for the prompt cache, and what happens to it when the human edits or sends an Instruction?

Inputs from 04: memory owns the agent's **plan**: the current Section, the intended arc (where Energy should go, and when), and a **journal of moves** (each change's Intent and its Verdict). The heuristic for aimless looping reads that journal.
