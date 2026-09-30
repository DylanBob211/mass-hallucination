import { Clock, Effect, Stream } from "effect";
import { expect, test } from "vitest";
import { type LongTask, Page } from "../../core/Page";
import { PageLive } from "./page";

test("a task that blocks the main thread over 50 ms shows as a long task, when it ran", async () => {
  const seen: Array<LongTask> = [];

  const blockedAt = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const page = yield* Page;
        yield* Effect.forkScoped(
          Stream.runForEach(page.longTasks, (task) => Effect.sync(() => seen.push(task))),
        );
        yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 50)));
        const blockedAt = yield* Clock.currentTimeMillis;
        const end = performance.now() + 120;
        while (performance.now() < end);
        yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 200)));
        return blockedAt;
      }).pipe(Effect.provide(PageLive)),
    ),
  );

  const task = seen.find(({ duration }) => duration >= 120);
  expect(task).toBeDefined();
  expect(Math.abs((task?.at ?? 0) - blockedAt)).toBeLessThan(50);
});
