import type { EditorView } from "@codemirror/view";
import { Layer } from "effect";
import { createFacade, type Facade } from "../facade";
import { editorLayer } from "./editor";
import { StrudelLive } from "./strudel";

/** The façade over the page's editor and the real Strudel repl. */
export const createLiveFacade = (view: EditorView): Facade =>
  createFacade(Layer.merge(editorLayer(view), StrudelLive));
