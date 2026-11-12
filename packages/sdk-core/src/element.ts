/**
 * The custom-element base of the `@hussmartinez` SDK family (ADR 0040).
 * Importing it touches no browser API.
 *
 * @packageDocumentation
 */

export type {
  EditorElementAttribute,
  EditorElementClass,
  EditorElementContext,
  EditorElementDefine,
  EditorElementDefinition,
  MountedEditor,
} from "./element/create-editor-element.js";
export { createEditorElement } from "./element/create-editor-element.js";
export type { SharedStyleSheetOptions } from "./element/shared-style-sheet.js";
export { adoptSharedStyleSheet } from "./element/shared-style-sheet.js";
