import type { EditorView } from "@codemirror/view";
import { Layer } from "effect";
import { createFacade, type Facade } from "../facade";
import { editorLayer } from "./editor";
import { ModelLive } from "./model";
import { StrudelLive } from "./strudel";

/** The façade over the page's editor, the real Strudel repl and the model from `.env.local`. */
export const createLiveFacade = (view: EditorView): Facade =>
  createFacade(Layer.mergeAll(editorLayer(view), StrudelLive, ModelLive));
