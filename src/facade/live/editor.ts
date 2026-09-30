import { isolateHistory } from "@codemirror/commands";
import { StateEffect, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Effect, Layer, Stream } from "effect";
import { Editor, SourceMoved } from "../../core/Editor";
import { agentWriteEvent } from "../facade";

/** `Editor` over the live CodeMirror view, whose document is the Source (ADR 0006). */
export const editorLayer = (view: EditorView) =>
  Layer.scoped(
    Editor,
    Effect.gen(function* () {
      const listeners = new Set<(source: string) => void>();
      const read = () => view.state.doc.toString();

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          view.dispatch({
            effects: StateEffect.appendConfig.of(
              EditorView.updateListener.of((update) => {
                if (!update.docChanged) return;
                const source = update.state.doc.toString();
                for (const listener of listeners) listener(source);
              }),
            ),
          });
        }),
        // CodeMirror cannot take back an appended extension; with no listeners it does nothing.
        () =>
          Effect.sync(() => {
            listeners.clear();
          }),
      );

      return {
        read: Effect.sync(read),
        // Isolated, so the human's typing just before or after never joins its undo step.
        write: (onto, changes) =>
          Effect.suspend(() => {
            if (read() !== onto) return Effect.fail(new SourceMoved());
            view.dispatch({
              changes: [...changes],
              annotations: [Transaction.userEvent.of(agentWriteEvent), isolateHistory.of("full")],
            });
            return Effect.void;
          }),
        changes: Stream.asyncPush<string>(
          (emit) =>
            Effect.acquireRelease(
              Effect.sync(() => {
                const listener = (source: string) => emit.single(source);
                listeners.add(listener);
                emit.single(read());
                return listener;
              }),
              (listener) => Effect.sync(() => listeners.delete(listener)),
            ),
          { bufferSize: 1, strategy: "sliding" },
        ),
      };
    }),
  );
