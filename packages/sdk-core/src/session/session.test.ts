import { afterEach, describe, expect, it, vi } from "vitest";
import { createHistory, type HistoryStep } from "./history.js";
import { applyCommands, type Reducer } from "./reducer.js";
import { createStore } from "./store.js";

describe("createStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the same snapshot until the state changes", () => {
    const initial = { count: 0 };
    const store = createStore(initial);

    expect(store.getSnapshot()).toBe(initial);
    store.set((state) => ({ count: state.count + 1 }));
    expect(store.getSnapshot()).toEqual({ count: 1 });
    expect(store.getSnapshot()).not.toBe(initial);
  });

  it("notifies listeners in order after a change, and not after setting the same value", () => {
    const store = createStore({ count: 0 });
    const calls: string[] = [];
    store.subscribe(() => calls.push(`a:${store.getSnapshot().count}`));
    store.subscribe(() => calls.push(`b:${store.getSnapshot().count}`));

    store.set({ count: 1 });
    store.set((state) => state);
    store.set(store.getSnapshot());

    expect(calls).toEqual(["a:1", "b:1"]);
  });

  it("stops notifying a listener once it unsubscribes, even more than once", () => {
    const store = createStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set(1);
    unsubscribe();
    unsubscribe();
    store.set(2);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("calls a listener subscribed twice twice, and each unsubscribe removes one", () => {
    const store = createStore(0);
    const listener = vi.fn();
    const first = store.subscribe(listener);
    store.subscribe(listener);

    store.set(1);
    first();
    store.set(2);

    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("calls the others when a listener throws, and reports the error", () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const store = createStore(0);
    const after = vi.fn();
    store.subscribe(() => {
      throw new Error("listener failed");
    });
    store.subscribe(after);

    store.set(1);

    expect(after).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(new Error("listener failed"));
  });

  it("doesn't call a listener removed by an earlier one in the same change", () => {
    const store = createStore(0);
    const second = vi.fn();
    let unsubscribeSecond = () => {};
    store.subscribe(() => unsubscribeSecond());
    unsubscribeSecond = store.subscribe(second);

    store.set(1);

    expect(second).not.toHaveBeenCalled();
  });

  it("first calls a listener added during a change on the next change", () => {
    const store = createStore(0);
    const late = vi.fn();
    store.subscribe(() => {
      store.subscribe(late);
    });

    store.set(1);
    expect(late).not.toHaveBeenCalled();
    store.set(2);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

/** A counter whose commands add or set a value, each with its inverse. */
type Command = { type: "add"; by: number } | { type: "set"; value: number };
const counter: Reducer<number, Command> = (state, command) => {
  switch (command.type) {
    case "add":
      return { state: state + command.by, inverse: { type: "add", by: -command.by } };
    case "set":
      return { state: command.value, inverse: { type: "set", value: state } };
  }
};
const add = (by: number): Command => ({ type: "add", by });

describe("applyCommands", () => {
  it("applies commands in order, and returns their inverses in reverse order", () => {
    const commands: Command[] = [add(2), { type: "set", value: 10 }, add(3)];

    const { state, inverses } = applyCommands(counter, 1, commands);

    expect(state).toBe(13);
    expect(inverses).toEqual([add(-3), { type: "set", value: 3 }, add(-2)]);
    // Applying the inverses undoes the whole sequence.
    expect(applyCommands(counter, state, inverses).state).toBe(1);
  });

  it("returns the state unchanged for no commands", () => {
    expect(applyCommands(counter, 5, [])).toEqual({ state: 5, inverses: [] });
  });

  it("lets a reducer's error through", () => {
    const failing: Reducer<number, Command> = () => {
      throw new RangeError("invalid command");
    };

    expect(() => applyCommands(failing, 0, [add(1)])).toThrow(RangeError);
  });
});

const step = (by: number): HistoryStep<Command> => ({ commands: [add(by)], inverses: [add(-by)] });

describe("createHistory", () => {
  it("undoes and redoes steps, last in first out", () => {
    const history = createHistory<Command>();
    expect(history.canUndo).toBe(false);

    history.push(step(1));
    history.push(step(2));

    expect(history.undo()).toEqual(step(2));
    expect(history.undo()).toEqual(step(1));
    expect(history.undo()).toBeUndefined();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toEqual(step(1));
    expect(history.redo()).toEqual(step(2));
    expect(history.redo()).toBeUndefined();
  });

  it("drops what could be redone when a step is pushed", () => {
    const history = createHistory<Command>();
    history.push(step(1));
    history.push(step(2));
    history.undo();

    history.push(step(3));

    expect(history.canRedo).toBe(false);
    expect(history.steps).toEqual([step(1), step(3)]);
  });

  it("keeps its own copy of a step", () => {
    const history = createHistory<Command>();
    const commands = [add(1)];
    history.push({ commands, inverses: [add(-1)] });

    commands.push(add(99));

    expect(history.steps[0]?.commands).toEqual([add(1)]);
    expect(Object.isFrozen(history.steps[0])).toBe(true);
  });

  it.each(["undo", "redo"] as const)("restores a step whose %s failed to apply", (direction) => {
    const history = createHistory<Command>();
    history.push(step(1));
    history.push(step(2));
    if (direction === "redo") {
      history.undo();
    }
    const before = { steps: history.steps, canUndo: history.canUndo, canRedo: history.canRedo };

    history[direction]();
    history.restore(direction);

    expect({ steps: history.steps, canUndo: history.canUndo, canRedo: history.canRedo }).toEqual(
      before,
    );
    expect(direction === "undo" ? history.undo() : history.redo()).toEqual(step(2));
  });

  describe("group", () => {
    it("records the steps pushed inside it as one, with inverses in reverse order", () => {
      const history = createHistory<Command>();

      const result = history.group(() => {
        history.push(step(1));
        history.push({ commands: [add(2), add(3)], inverses: [add(-3), add(-2)] });
        return "done";
      });

      expect(result).toBe("done");
      expect(history.steps).toEqual([
        { commands: [add(1), add(2), add(3)], inverses: [add(-3), add(-2), add(-1)] },
      ]);
      // The grouped inverses undo the grouped commands.
      const { state } = applyCommands(counter, 0, history.steps[0]?.commands ?? []);
      expect(applyCommands(counter, state, history.undo()?.inverses ?? []).state).toBe(0);
    });

    it("joins nested groups to the outer one", () => {
      const history = createHistory<Command>();

      history.group(() => {
        history.push(step(1));
        history.group(() => history.push(step(2)));
        history.push(step(3));
      });

      expect(history.steps).toHaveLength(1);
      expect(history.steps[0]?.commands).toEqual([add(1), add(2), add(3)]);
    });

    it("records nothing, and keeps the redo steps, when nothing was pushed", () => {
      const history = createHistory<Command>();
      history.push(step(1));
      history.undo();

      history.group(() => {});

      expect(history.steps).toEqual([step(1)]);
      expect(history.canRedo).toBe(true);
    });

    it("records what was pushed before an error, then rethrows it", () => {
      const history = createHistory<Command>();

      expect(() =>
        history.group(() => {
          history.push(step(1));
          history.push(step(2));
          throw new Error("failed halfway");
        }),
      ).toThrow("failed halfway");

      expect(history.steps).toEqual([{ commands: [add(1), add(2)], inverses: [add(-2), add(-1)] }]);
    });

    it("shows grouped steps only when the group ends", () => {
      const history = createHistory<Command>();
      history.group(() => {
        history.push(step(1));
        expect(history.canUndo).toBe(false);
      });
      expect(history.canUndo).toBe(true);
    });

    it("refuses an asynchronous function", async () => {
      const history = createHistory<Command>();

      expect(() => history.group(async () => {})).toThrow(
        new TypeError(
          "history.group() needs a synchronous function: steps pushed after an await would fall outside the group.",
        ),
      );
    });

    it.each([
      ["undo", (h: ReturnType<typeof createHistory<Command>>) => h.undo()],
      ["redo", (h: ReturnType<typeof createHistory<Command>>) => h.redo()],
      ["restore", (h: ReturnType<typeof createHistory<Command>>) => h.restore("undo")],
      ["drop", (h: ReturnType<typeof createHistory<Command>>) => h.drop(1)],
      ["clear", (h: ReturnType<typeof createHistory<Command>>) => h.clear()],
    ])("refuses %s() inside a group", (name, call) => {
      const history = createHistory<Command>();
      history.push(step(1));

      expect(() => history.group(() => call(history))).toThrow(
        new TypeError(`history.${name}() can't be called inside history.group().`),
      );
      expect(history.steps).toEqual([step(1)]);
    });
  });

  describe("dropping steps to save memory", () => {
    /** Two undo steps (1, 2) and two redo steps (4 reached last, then 3). */
    function withBothStacks() {
      const history = createHistory<Command>();
      for (const by of [1, 2, 3, 4]) {
        history.push(step(by));
      }
      history.undo();
      history.undo();
      return history;
    }

    it("orders the redo step reached last first, then the oldest undo steps", () => {
      expect(withBothStacks().dropOrder).toEqual([step(4), step(3), step(1), step(2)]);
    });

    it("drops in that order, so the steps that remain can still be applied", () => {
      const history = withBothStacks();

      history.drop(3);

      expect(history.steps).toEqual([step(2)]);
      expect(history.canRedo).toBe(false);
      expect(history.undo()).toEqual(step(2));
      expect(history.trimmed).toBe(true);
    });

    it("keeps the redo steps that remain redoable", () => {
      const history = withBothStacks();

      history.drop(1);

      expect(history.redo()).toEqual(step(3));
      expect(history.redo()).toBeUndefined();
    });

    it.each([0, -1, Number.NaN])("drops nothing for %s", (count) => {
      const history = withBothStacks();

      history.drop(count);

      expect(history.steps).toHaveLength(4);
      expect(history.trimmed).toBe(false);
    });

    it("drops everything for a count beyond the steps", () => {
      const history = withBothStacks();

      history.drop(10);

      expect(history.steps).toEqual([]);
      expect(history.trimmed).toBe(true);
    });

    it("forgets that steps were dropped when cleared", () => {
      const history = withBothStacks();
      history.drop(1);

      history.clear();

      expect(history.steps).toEqual([]);
      expect(history.trimmed).toBe(false);
      expect(history.canUndo || history.canRedo).toBe(false);
    });
  });
});
