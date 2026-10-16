# 05 — Prototype: the decider/writer state machine

Type: prototype
Status: open
Blocked by: 01, 02

## Question

Does the split hold, with a state machine owning the flow, a typed **decider** answering small questions and the **writer** only writing code? Build a throwaway machine on a fake Performance, using the library 01 recommends and swappable deciders from 02, with stub judgements where 04 hasn't landed yet. Run it on scenario 1 (*leave it alone*) and feel:

1. Which **states** an agent pursuing a Brief naturally has (listening, deciding, writing, judging, waiting for the phrase, and so on).
2. Which transitions are decider calls and which are plain code.
3. How easy it is to change a state or a policy and rerun, which is the "improve over time" promise.
4. What a run looks like as a log of states and decisions.
