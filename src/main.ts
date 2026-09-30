import { mount, unmount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { createLiveFacade } from "./facade/live";
import { createEditor } from "./ui/editor";
import { PeekState } from "./ui/peekState.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("#app is missing from index.html");

const peek = new PeekState();
// The keys reach the façade only once it exists, which needs the view first.
const view = createEditor("", {
  apply: () => void facade.apply(),
  stopTransport: () => void facade.stopTransport(),
  setAutonomy: (autonomy) => void facade.setAutonomy(autonomy),
  accept: () => void facade.accept(),
  acceptAndPlay: () => void facade.acceptAndPlay(),
  reject: () => void facade.reject(),
  instruct: (instruction, part) => void facade.instruct(instruction, part),
  stop: () => void facade.stop(),
  togglePeek: () => {
    peek.toggle();
  },
  closePeek: () => peek.close(),
});
const facade = createLiveFacade(view);
// The peek opens itself on a word answer (ADR 0007), whether or not anything renders it.
const seeTurns = facade.subscribe(({ turns }) => {
  peek.see(turns);
});
const app = mount(App, { target, props: { facade, view, peek } });

import.meta.hot?.dispose(() => {
  void unmount(app)
    .then(() => {
      seeTurns();
      return facade.dispose();
    })
    .then(() => {
      view.destroy();
    });
});
