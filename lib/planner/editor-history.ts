/** Bounded, in-memory history of immutable editor snapshots, never execution records. */
export class EditorHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastAt = -Infinity;
  constructor(private readonly limit = 30) {}
  record(previous: T, now = Date.now()) {
    if (!this.past.length || now - this.lastAt > 500 || this.future.length) {
      this.past.push(previous);
      this.past = this.past.slice(-this.limit);
    }
    this.lastAt = now;
    this.future = [];
  }
  undo(current: T): T | undefined {
    const next = this.past.pop();
    if (next !== undefined) this.future.push(current);
    this.lastAt = -Infinity;
    return next;
  }
  redo(current: T): T | undefined {
    const next = this.future.pop();
    if (next !== undefined) this.past.push(current);
    this.lastAt = -Infinity;
    return next;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}
