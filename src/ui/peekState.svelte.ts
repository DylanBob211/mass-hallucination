import type { TurnView } from "../facade/facade";

/**
 * Whether the peek is open (ADR 0007): toggled by Ctrl-J, closed by Esc, and opened by itself
 * when the agent answers in words, since an answer has nowhere else to go. UI state, outside the
 * view model.
 */
export class PeekState {
  open = $state(false);
  /** The Turn whose answer it last opened for, by its place in the session. */
  #answered = -1;

  /** Opens it if it is closed, and closes it if it is open. */
  toggle() {
    this.open = !this.open;
  }

  /** Closes it; `false` if it was closed already. */
  close(): boolean {
    const was = this.open;
    this.open = false;
    return was;
  }

  /** Opens it if the latest of `turns` has just answered in words. */
  see(turns: ReadonlyArray<TurnView>) {
    const latest = turns.length - 1;
    if (turns[latest]?.state !== "answered" || latest <= this.#answered) return;
    this.#answered = latest;
    this.open = true;
  }
}
