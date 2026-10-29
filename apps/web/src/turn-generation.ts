/** A monotonically increasing generation prevents stale async results crossing modes. */
export class TurnGeneration {
  private value = 0;
  next() { return ++this.value; }
  current(value: number) { return value === this.value; }
  cancel() { ++this.value; }
}
