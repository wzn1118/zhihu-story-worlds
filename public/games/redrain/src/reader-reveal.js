const graphemes = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
export const READING_SPEEDS = Object.freeze({ slow: 64, standard: 34, fast: 18, instant: 0 });

export class ReaderReveal {
  constructor() { this.start(""); }

  start(text, { speed = "standard", instant = false } = {}) {
    this.text = text;
    this.segments = [...graphemes.segment(text)].map(item => item.segment);
    this.speed = Object.hasOwn(READING_SPEEDS, speed) ? speed : "standard";
    this.elapsed = 0;
    this.position = instant || this.speed === "instant" ? this.segments.length : 0;
  }

  get complete() { return this.position === this.segments.length; }
  get visibleText() { return this.segments.slice(0, this.position).join(""); }
  get remainingText() { return this.segments.slice(this.position).join(""); }

  setSpeed(speed) {
    if (!Object.hasOwn(READING_SPEEDS, speed)) return;
    this.speed = speed;
    this.elapsed = 0;
    if (speed === "instant") this.finish();
  }

  finish() { this.position = this.segments.length; this.elapsed = 0; }

  advance(milliseconds) {
    if (this.complete || !Number.isFinite(milliseconds) || milliseconds <= 0) return false;
    const before = this.position;
    this.elapsed += milliseconds;
    while (!this.complete) {
      const previous = this.segments[this.position - 1] || "";
      const pause = /[。！？…\n]/u.test(previous) ? 5 : /[，、；：]/u.test(previous) ? 2.5 : 1;
      const delay = READING_SPEEDS[this.speed] * pause;
      if (this.elapsed < delay) break;
      this.elapsed -= delay;
      this.position++;
    }
    return before !== this.position;
  }
}
