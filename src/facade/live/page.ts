import { Clock, Effect, Layer, Stream } from "effect";
import { type LongTask, Page } from "../../core/Page";

/** How long, in ms, the times of past frames are kept, for `frames` to look back. */
const framesKeptMillis = 5000;

/**
 * Keeps the time (`performance.now()`) of each frame drawn in the last `framesKeptMillis`, until
 * the scope closes.
 */
const watchFrames = Effect.acquireRelease(
  Effect.sync(() => {
    const drawn: Array<number> = [];
    // Timed when each frame's callbacks run: its own timestamp is when it was due, and a frame
    // a stall held up would show no gap.
    let frame = requestAnimationFrame(function keep() {
      const time = performance.now();
      drawn.push(time);
      while ((drawn[0] ?? time) < time - framesKeptMillis) drawn.shift();
      frame = requestAnimationFrame(keep);
    });
    return {
      drawn,
      stop: () => {
        cancelAnimationFrame(frame);
      },
    };
  }),
  ({ stop }) => Effect.sync(stop),
);

/**
 * Each long task from now on, from a `PerformanceObserver`. Entries are timed by the monotonic
 * clock, and are moved onto the wall clock as they arrive.
 */
const longTasksObserved = Stream.asyncPush<LongTask>((emit) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      // Entries arrive after their task, timed by the monotonic clock. That clock drifts from
      // the wall clock the Turns are timed by, over hours or a sleep, so it is converted now.
      const observer = new PerformanceObserver((list) => {
        const wallClockOffset = Date.now() - performance.now();
        for (const entry of list.getEntries())
          void emit.single({ at: wallClockOffset + entry.startTime, duration: entry.duration });
      });
      observer.observe({ type: "longtask" });
      return observer;
    }),
    (observer) =>
      Effect.sync(() => {
        observer.disconnect();
      }),
  ),
);

/** Hands the performer a file named `name` holding `text`, by clicking a link to it. */
const download = (name: string, text: string) =>
  Effect.sync(() => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  });

/**
 * `Page` over the browser: long tasks from a `PerformanceObserver`, frames from
 * `requestAnimationFrame`, downloads by a link.
 */
export const PageLive = Layer.scoped(
  Page,
  Effect.map(watchFrames, ({ drawn }) => ({
    longTasks: longTasksObserved,
    frames: (from: number, to: number) =>
      Effect.gen(function* () {
        yield* Effect.sleep(Math.max(0, to - (yield* Clock.currentTimeMillis)));
        // Frames are timed by the monotonic clock; see `longTasksObserved`.
        const wallClockOffset = (yield* Clock.currentTimeMillis) - performance.now();
        const times = drawn.map((time) => wallClockOffset + time);
        let first = 0;
        for (const [index, time] of times.entries()) if (time <= from) first = index;
        return times.slice(first).filter((time) => time <= to);
      }),
    download,
  })),
);
