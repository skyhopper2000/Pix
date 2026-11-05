import type { Project } from "../core/model";

/**
 * Project state with undo/redo. Every edit is a named command: a pure function
 * Project -> Project. Because projects are immutable with structural sharing,
 * a history entry just keeps the project before and after the command.
 *
 * Continuous edits (a pen stroke, a drag) call `preview()` repeatedly while the
 * gesture runs (live updates everywhere, no history), then `commit()` once.
 */

export interface HistoryEntry {
  label: string;
  before: Project;
  after: Project;
}

export type Command = (p: Project) => Project;
type Listener = () => void;

export class ProjectHistory {
  private current: Project;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private gestureBase: Project | null = null;
  private saved: Project;
  private listeners = new Set<Listener>();

  constructor(
    initial: Project,
    readonly limit = 500,
  ) {
    this.current = initial;
    this.saved = initial;
  }

  get project(): Project {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0 && this.gestureBase === null;
  }

  get canRedo(): boolean {
    return this.future.length > 0 && this.gestureBase === null;
  }

  get undoLabel(): string | null {
    return this.past.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future.at(-1)?.label ?? null;
  }

  get dirty(): boolean {
    return this.current !== this.saved;
  }

  get inGesture(): boolean {
    return this.gestureBase !== null;
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Runs a command as one undoable step. No-op commands (same reference) create no entry. */
  dispatch(label: string, cmd: Command): Project {
    if (this.gestureBase) this.commit("Edit");
    const before = this.current;
    const after = cmd(before);
    if (after === before) return before;
    this.push({ label, before, after });
    this.current = after;
    this.emit();
    return after;
  }

  /** Applies a step of an ongoing gesture without recording history. */
  preview(cmd: Command): Project {
    this.gestureBase ??= this.current;
    const next = cmd(this.current);
    if (next !== this.current) {
      this.current = next;
      this.emit();
    }
    return next;
  }

  /** Ends a gesture: records one entry from gesture start to now (if anything changed). */
  commit(label: string): void {
    const base = this.gestureBase;
    if (!base) return;
    this.gestureBase = null;
    if (this.current !== base) this.push({ label, before: base, after: this.current });
    this.emit();
  }

  /** Abandons a gesture and restores the state from before it. */
  cancel(): void {
    if (!this.gestureBase) return;
    this.current = this.gestureBase;
    this.gestureBase = null;
    this.emit();
  }

  undo(): void {
    if (!this.canUndo) return;
    const e = this.past.pop()!;
    this.future.push(e);
    this.current = e.before;
    this.emit();
  }

  redo(): void {
    if (!this.canRedo) return;
    const e = this.future.pop()!;
    this.past.push(e);
    this.current = e.after;
    this.emit();
  }

  /** Replaces the project and clears history (New / Open). */
  reset(p: Project): void {
    this.current = p;
    this.saved = p;
    this.past = [];
    this.future = [];
    this.gestureBase = null;
    this.emit();
  }

  markSaved(): void {
    this.saved = this.current;
    this.emit();
  }

  private push(e: HistoryEntry) {
    this.past.push(e);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
}
