import type { EditorView } from "@codemirror/view";
import { Layer } from "effect";
import { createFacade, type Facade } from "../facade";
import { editorLayer } from "./editor";
import { ModelLive } from "./model";
import { PageLive } from "./page";
import { StrudelLive } from "./strudel";

/**
 * The façade over the page's editor, the real Strudel repl, the model from `.env.local` and the
 * page itself.
 */
export const createLiveFacade = (view: EditorView): Facade =>
  createFacade(Layer.mergeAll(editorLayer(view), StrudelLive, ModelLive, PageLive));
