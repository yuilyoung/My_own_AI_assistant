import { describe, expect, it } from "vitest";
import { SpeechSegmenter } from "./speechSegmenter";

describe("SpeechSegmenter", () => {
  it("streams completed Korean sentences without losing partial tokens", () => {
    const s = new SpeechSegmenter();
    expect(s.push("오늘은 학교에")).toEqual([]);
    expect(s.push(" 갔어. 그리고")).toEqual(["오늘은 학교에 갔어."]);
    expect(s.push(" 친구를 만났어!")).toEqual(["그리고 친구를 만났어!"]);
    expect(s.flush()).toEqual([]);
  });

  it("flushes an unfinished final phrase", () => {
    const s = new SpeechSegmenter();
    expect(s.push("반가워")).toEqual([]);
    expect(s.flush()).toEqual(["반가워"]);
    expect(s.flush()).toEqual([]);
  });

  it("drops queued text when a turn is interrupted", () => {
    const s = new SpeechSegmenter();
    s.push("이전 응답은");
    s.reset();
    expect(s.push("새로운 질문이야.")).toEqual(["새로운 질문이야."]);
  });

  it("bounds long unpunctuated output", () => {
    const s = new SpeechSegmenter(12);
    const parts = s.push("가나다라마바사아자차카타파하");
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.join("") + s.flush().join("")).toBe(
      "가나다라마바사아자차카타파하",
    );
  });
});
