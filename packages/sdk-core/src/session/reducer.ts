/**
 * The result of applying one command: the new state, and the command that
 * undoes it.
 *
 * @typeParam S - The state.
 * @typeParam C - The commands.
 * @public
 */
export interface Applied<S, C> {
  readonly state: S;
  readonly inverse: C;
}

/**
 * Applies one command to a state, and returns the new state with the
 * command's inverse (ADR 0010, ADR 0029). Reducers are pure: they never
 * change `state`. An invalid command throws the SDK's own error.
 *
 * @typeParam S - The state.
 * @typeParam C - The commands.
 * @public
 */
export type Reducer<S, C> = (state: S, command: C) => Applied<S, C>;

/**
 * Applies commands in order, and returns the final state with the commands
 * that undo the whole sequence: the inverses, in reverse order.
 *
 * @example
 * ```ts
 * const { state, inverses } = applyCommands(reducer, plan, commands);
 * history.push({ commands, inverses });
 * // Later, undoing the step:
 * const undone = applyCommands(reducer, state, inverses).state;
 * ```
 *
 * @param reducer - Applies one command.
 * @param state - The state to start from.
 * @param commands - The commands, in the order they run.
 * @public
 */
export function applyCommands<S, C>(
  reducer: Reducer<S, C>,
  state: S,
  commands: readonly C[],
): { readonly state: S; readonly inverses: C[] } {
  let current = state;
  const inverses: C[] = [];
  for (const command of commands) {
    const applied = reducer(current, command);
    current = applied.state;
    inverses.unshift(applied.inverse);
  }
  return { state: current, inverses };
}
