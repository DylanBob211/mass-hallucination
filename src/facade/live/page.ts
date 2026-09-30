import { Effect, Layer, Stream } from "effect";
import { type LongTask, Page } from "../../core/Page";

/** `Page` over the browser: long tasks from a `PerformanceObserver`, downloads by a link. */
export const PageLive = Layer.succeed(Page, {
  longTasks: Stream.asyncPush<LongTask>((emit) =>
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
  ),
  download: (name, text) =>
    Effect.sync(() => {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    }),
});
