import { useSyncExternalStore } from "react";

/** Tiny observable store for non-undoable UI state. */
export class Store<T extends object> {
  private listeners = new Set<() => void>();
  constructor(private state: T) {}

  get = (): T => this.state;

  set = (patch: Partial<T> | ((s: T) => Partial<T>)): void => {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    let changed = false;
    for (const k in p) if (!Object.is(p[k], this.state[k])) changed = true;
    if (!changed) return;
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  };

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

/** Subscribes a component to a slice of a store. The selector must return stable references. */
export function useStore<T extends object, R>(store: Store<T>, sel: (s: T) => R): R {
  return useSyncExternalStore(store.subscribe, () => sel(store.get()));
}
