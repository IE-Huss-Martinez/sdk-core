import { describe, expect, it, vi } from "vitest";
import { createToolRegistry } from "./registry.js";
import { defineTool, type ToolDefinition } from "./tool.js";

interface State {
  readonly selection: readonly string[];
}

const definition = (
  id: string,
  extra: Partial<ToolDefinition<State, undefined>> = {},
): ToolDefinition<State, undefined> => ({
  id,
  label: `tools.${id.split(".")[1]}`,
  icon: id.split(".")[1] ?? "",
  group: "pages",
  run: () => {},
  ...extra,
});

describe("defineTool", () => {
  it("returns the definition, frozen, with its own copies of arrays", () => {
    const requires = ["encryption"];
    const shortcuts = ["Mod+Shift+L"];
    const isEnabled = (state: State) => state.selection.length > 0;

    const tool = defineTool(definition("pdf.rotate-left", { requires, shortcuts, isEnabled }));
    requires.push("other");
    shortcuts.push("Mod+L");

    expect(tool).toMatchObject({ id: "pdf.rotate-left", group: "pages", isEnabled });
    expect(tool.requires).toEqual(["encryption"]);
    expect(tool.shortcuts).toEqual(["Mod+Shift+L"]);
    expect(Object.isFrozen(tool)).toBe(true);
    expect(Object.isFrozen(tool.requires)).toBe(true);
  });

  it("keeps a family action name and an opaque view as given", () => {
    const view = { component: "RotatePanel" };
    const tool = defineTool({ ...definition("audio.undo"), shortcuts: "undo", view });

    expect(tool.shortcuts).toBe("undo");
    expect(tool.view).toBe(view);
  });

  it.each(["pdf.rotate-left", "audio.split", "image2.crop", "pdf.a-1"])(
    "accepts the id %j",
    (id) => {
      expect(defineTool(definition(id)).id).toBe(id);
    },
  );

  it.each([
    ["an id without its SDK", definition("rotate"), 'Tool "rotate" needs an id like'],
    ["an id in capitals", definition("pdf.Rotate"), 'Tool "pdf.Rotate" needs an id like'],
    ["an id with two dots", definition("pdf.page.rotate"), "needs an id like"],
    ["an id with a trailing hyphen", definition("pdf.rotate-"), "needs an id like"],
    ["no id", { ...definition("pdf.x"), id: "" }, "A tool needs an id like"],
    ["no label", { ...definition("pdf.x"), label: "" }, 'Tool "pdf.x" needs a label.'],
    ["no icon", { ...definition("pdf.x"), icon: "" }, 'Tool "pdf.x" needs a icon.'],
    [
      "a group in capitals",
      { ...definition("pdf.x"), group: "Pages" },
      "needs a group in lowercase",
    ],
    [
      "requires that aren't names",
      definition("pdf.x", { requires: [""] }),
      "must list its requires",
    ],
    [
      "isEnabled that isn't a function",
      { ...definition("pdf.x"), isEnabled: true as never },
      "must have a function for isEnabled",
    ],
    ["no run", { ...definition("pdf.x"), run: undefined as never }, "needs a run function"],
    ["empty shortcuts", definition("pdf.x", { shortcuts: [""] }), "must give its shortcuts"],
    [
      "a misspelt key",
      { ...definition("pdf.x"), isEnable: () => true } as never,
      'Tool "pdf.x" has unknown keys: isEnable.',
    ],
  ])("refuses %s", (_, bad, message) => {
    expect(() => defineTool(bad as ToolDefinition)).toThrow(TypeError);
    expect(() => defineTool(bad as ToolDefinition)).toThrow(message);
  });
});

const undo = defineTool(definition("pdf.undo", { group: "history" }));
const redo = defineTool(definition("pdf.redo", { group: "history" }));
const rotate = defineTool(definition("pdf.rotate-left"));
const encrypt = defineTool(
  definition("pdf.encrypt", { group: "export", requires: ["encryption"] }),
);
const remove = defineTool(definition("pdf.delete"));
const ALL = [undo, redo, rotate, encrypt, remove];
const ids = (tools: readonly { id: string }[]) => tools.map((tool) => tool.id);

describe("createToolRegistry", () => {
  it("presents every tool whose capabilities are on, grouped by group in order of first appearance", () => {
    const registry = createToolRegistry(ALL, { capabilities: ["encryption"] });

    expect(ids(registry.tools)).toEqual([
      "pdf.undo",
      "pdf.redo",
      "pdf.rotate-left",
      "pdf.encrypt",
      "pdf.delete",
    ]);
    expect(registry.toolbar.map(ids)).toEqual([
      ["pdf.undo", "pdf.redo"],
      ["pdf.rotate-left", "pdf.delete"],
      ["pdf.encrypt"],
    ]);
    expect(registry.omitted).toEqual([]);
  });

  it("leaves out tools whose capabilities are off, and says which", () => {
    const registry = createToolRegistry(ALL);

    expect(ids(registry.tools)).not.toContain("pdf.encrypt");
    expect(registry.get("pdf.encrypt")).toBeUndefined();
    expect(registry.omitted).toEqual(["pdf.encrypt"]);
  });

  it("presents the tools option's tools, in its order", () => {
    const registry = createToolRegistry(ALL, { tools: ["pdf.rotate-left", "pdf.undo"] });

    expect(ids(registry.tools)).toEqual(["pdf.rotate-left", "pdf.undo"]);
    expect(registry.toolbar.map(ids)).toEqual([["pdf.rotate-left"], ["pdf.undo"]]);
    expect(registry.get("pdf.redo")).toBeUndefined();
    expect(registry.get("pdf.undo")).toBe(undo);
  });

  it("lays out the toolbar option's groups, dropping tools a capability leaves out", () => {
    const registry = createToolRegistry(ALL, {
      toolbar: [["pdf.rotate-left", "pdf.delete"], ["pdf.encrypt"], ["pdf.undo", "pdf.redo"]],
    });

    // The encrypt group is empty without its capability, so it's left out.
    expect(registry.toolbar.map(ids)).toEqual([
      ["pdf.rotate-left", "pdf.delete"],
      ["pdf.undo", "pdf.redo"],
    ]);
    // Tools off the toolbar are still present, for menus and shortcuts.
    expect(ids(registry.tools)).toContain("pdf.undo");
  });

  it("returns frozen data", () => {
    const registry = createToolRegistry(ALL);

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.tools)).toBe(true);
    expect(Object.isFrozen(registry.toolbar[0])).toBe(true);
  });

  it.each([
    [
      "two tools with one id",
      () => createToolRegistry([undo, defineTool(definition("pdf.undo"))]),
      'More than one tool has the id "pdf.undo".',
    ],
    [
      "an unknown tool in tools",
      () => createToolRegistry(ALL, { tools: ["pdf.undo", "pdf.rotate"] }),
      'The tools option names unknown tools: "pdf.rotate".',
    ],
    [
      "a tool named twice in tools",
      () => createToolRegistry(ALL, { tools: ["pdf.undo", "pdf.undo"] }),
      'The tools option names tools more than once: "pdf.undo".',
    ],
    [
      "an unknown tool on the toolbar",
      () => createToolRegistry(ALL, { toolbar: [["pdf.undo"], ["pdf.zoom"]] }),
      'The toolbar option names unknown tools: "pdf.zoom".',
    ],
    [
      "a tool twice on the toolbar",
      () => createToolRegistry(ALL, { toolbar: [["pdf.undo"], ["pdf.undo"]] }),
      'The toolbar option names tools more than once: "pdf.undo".',
    ],
    [
      "a toolbar tool that tools leaves out",
      () => createToolRegistry(ALL, { tools: ["pdf.undo"], toolbar: [["pdf.undo", "pdf.redo"]] }),
      'The toolbar option names tools that tools leaves out: "pdf.redo".',
    ],
  ])("refuses %s", (_, create, message) => {
    expect(create).toThrow(new TypeError(message));
  });

  it("never calls a tool's functions", () => {
    const run = vi.fn();
    const isAvailable = vi.fn(() => true);

    createToolRegistry([defineTool(definition("pdf.watch", { run, isAvailable }))]);

    expect(run).not.toHaveBeenCalled();
    expect(isAvailable).not.toHaveBeenCalled();
  });
});
