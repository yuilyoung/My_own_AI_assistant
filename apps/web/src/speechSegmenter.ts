/** Incremental Korean-friendly sentence segmentation for streamed LLM text.
 * Only complete clauses are emitted until flush(); no text is discarded.
 * The caller decides when to synthesize/play each segment.
 */
export class SpeechSegmenter {
  private pending = "";
  constructor(private readonly maxChars = 90) {
    if (!Number.isInteger(maxChars) || maxChars < 8) {
      throw new RangeError("maxChars must be an integer >= 8");
    }
  }

  push(chunk: string): string[] {
    this.pending += chunk;
    const ready: string[] = [];
    while (this.pending.length > 0) {
      const punctuation = /[.!?。！？](?=\s|$)/u.exec(this.pending);
      const boundary = punctuation
        ? punctuation.index + punctuation[0].length
        : -1;
      if (boundary > 0 && boundary <= this.maxChars) {
        ready.push(this.pending.slice(0, boundary).trim());
        this.pending = this.pending.slice(boundary).trimStart();
        continue;
      }
      if (this.pending.length < this.maxChars) break;
      const prefix = this.pending.slice(0, this.maxChars);
      const whitespace = prefix.lastIndexOf(" ");
      const split = whitespace >= 8 ? whitespace : this.maxChars;
      ready.push(this.pending.slice(0, split).trim());
      this.pending = this.pending.slice(split).trimStart();
    }
    return ready.filter(Boolean);
  }

  flush(): string[] {
    const tail = this.pending.trim();
    this.pending = "";
    return tail ? [tail] : [];
  }

  reset(): void {
    this.pending = "";
  }
}
