import { mount, unmount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { createLiveFacade } from "./facade/live";
import { createEditor } from "./ui/editor";

const target = document.getElementById("app");
if (!target) throw new Error("#app is missing from index.html");

// The keys reach the façade only once it exists, which needs the view first.
const view = createEditor("", {
  apply: () => void facade.apply(),
  stopTransport: () => void facade.stopTransport(),
});
const facade = createLiveFacade(view);
const app = mount(App, { target, props: { facade, view } });

import.meta.hot?.dispose(() => {
  void unmount(app)
    .then(() => facade.dispose())
    .then(() => {
      view.destroy();
    });
});
