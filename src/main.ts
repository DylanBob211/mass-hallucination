import { mount, unmount } from "svelte";
import App from "./App.svelte";
import "./app.css";
import { createFacade } from "./facade/facade";

const target = document.getElementById("app");
if (!target) throw new Error("#app is missing from index.html");

const facade = createFacade();
const app = mount(App, { target, props: { facade } });

import.meta.hot?.dispose(() => {
  void unmount(app).then(() => facade.dispose());
});
