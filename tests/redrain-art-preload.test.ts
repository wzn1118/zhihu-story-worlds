import assert from "node:assert/strict";
import test from "node:test";
import { collectPortraitLookahead, createArtPreloader, getArtPreloadPolicy } from "../public/games/redrain/src/art-preload.js";

class TestImage {
  onload = null;
  onerror = null;
  fetchPriority = "auto";
  decoding = "auto";
  naturalWidth = 1024;
  naturalHeight = 1536;
  value = "";
  decode = () => Promise.resolve();
  constructor(requests) { this.requests = requests; }
  set src(value) { this.value = value; this.requests.push(value); }
  get src() { return this.value; }
  removeAttribute(name) { if (name === "src") this.value = ""; }
  async succeed() { await this.onload?.(); }
  fail() { this.onerror?.(); }
}

function fixture(options = {}) {
  const requests = [];
  const images = [];
  const preloader = createArtPreloader({
    getNetworkInfo: () => ({ effectiveType: "4g", downlink: 10, deviceMemory: 8 }),
    measureTransferMbps: () => null,
    ...options,
    createImage: () => {
      const image = new TestImage(requests);
      images.push(image);
      return image;
    }
  });
  const imageFor = (source) => {
    const image = [...images].reverse().find(image => image.src === source);
    assert.ok(image, `An image requested ${source}`);
    return image;
  };
  return { preloader, requests, images, imageFor };
}

test("current speaker is promoted without duplicate requests and obsolete work is cancelled", async () => {
  const { preloader, requests, imageFor } = fixture();
  const first = preloader.schedule(["a.webp"], [["b.webp"], ["c.webp"], ["ignored.webp"]]);
  const previous = imageFor("a.webp");
  assert.deepEqual(requests, ["a.webp", "b.webp"]);
  assert.equal(previous.fetchPriority, "high");
  assert.equal(imageFor("b.webp").fetchPriority, "low");

  const second = preloader.schedule(["b.webp"], [["c.webp"], ["d.webp"]]);
  assert.equal(await first, null);
  assert.equal(previous.src, "");
  assert.equal(imageFor("b.webp").fetchPriority, "high");
  assert.deepEqual(requests, ["a.webp", "b.webp", "c.webp"]);
  await imageFor("b.webp").succeed();
  assert.equal((await second)?.source, "b.webp");
  await imageFor("c.webp").succeed();
  assert.deepEqual(requests, ["a.webp", "b.webp", "c.webp", "d.webp"]);
});

test("failed WebP/decode falls back in order and unsuccessful requests can retry", async () => {
  const { preloader, requests, imageFor } = fixture();
  const sources = ["portrait.webp", "portrait.png", "same-character.png"];
  const current = preloader.schedule(sources);
  imageFor("portrait.webp").fail();
  const image = imageFor("portrait.png");
  image.decode = () => Promise.reject(new Error("corrupt image"));
  await image.succeed();
  image.decode = () => Promise.resolve();
  await image.succeed();
  assert.equal((await current)?.source, "same-character.png");
  assert.deepEqual(requests, sources);
  const cached = await preloader.schedule(sources);
  assert.equal(cached?.image, image);
  assert.deepEqual(requests, sources);

  const failed = preloader.schedule(["retry.webp"]);
  imageFor("retry.webp").fail();
  assert.equal(await failed, null);
  const retried = preloader.schedule(["retry.webp"]);
  const retriedImage = imageFor("retry.webp");
  const newest = requests.filter(source => source === "retry.webp").length;
  assert.equal(newest, 2);
  await retriedImage.succeed();
  assert.equal((await retried)?.source, "retry.webp");
});

test("backwards navigation keeps at most one speculative request beside the current image", async () => {
  const { preloader, images, imageFor } = fixture();
  const previous = preloader.schedule(["a.webp"], [["b.webp"]]);
  const current = preloader.schedule(["earlier.webp"], [["a.webp"], ["b.webp"]]);
  assert.equal(images.filter(image => image.src).length, 2);
  assert.equal(imageFor("a.webp").fetchPriority, "low");
  assert.equal(imageFor("earlier.webp").fetchPriority, "high");
  await imageFor("earlier.webp").succeed();
  await current;
  await imageFor("a.webp").succeed();
  await previous;
  assert.equal(imageFor("b.webp").fetchPriority, "low");
  preloader.schedule();
});

test("a cancelled image cannot become cached after its decode completes late", async () => {
  const { preloader, requests, imageFor } = fixture();
  let finishDecode;
  const first = preloader.schedule(["old.webp"]);
  const old = imageFor("old.webp");
  old.decode = () => new Promise(resolve => { finishDecode = resolve; });
  const pendingDecode = old.succeed();
  const current = preloader.schedule(["new.webp"]);
  finishDecode();
  await pendingDecode;
  assert.equal(await first, null);
  await imageFor("new.webp").succeed();
  assert.equal((await current)?.source, "new.webp");
  preloader.schedule(["old.webp"]);
  assert.deepEqual(requests, ["old.webp", "new.webp", "old.webp"]);
  preloader.schedule();
});

test("decoded portrait retention obeys its byte budget", async () => {
  const { preloader, requests, imageFor } = fixture({ maxDecodedBytes: 6 * 1024 * 1024 });
  const first = preloader.schedule(["a.webp"]);
  await imageFor("a.webp").succeed();
  await first;
  const second = preloader.schedule(["b.webp"]);
  await imageFor("b.webp").succeed();
  await second;
  await preloader.schedule(["b.webp"]);
  assert.deepEqual(requests, ["a.webp", "b.webp"]);
  preloader.schedule(["a.webp"]);
  assert.deepEqual(requests, ["a.webp", "b.webp", "a.webp"]);
  preloader.schedule();
});

test("network policy is conservative without hints and bounds decoded memory by device", () => {
  assert.equal(getArtPreloadPolicy().deferSpeculation, true);
  assert.equal(getArtPreloadPolicy({ effectiveType: "4g", downlink: 8 }).deferSpeculation, false);
  for (const effectiveType of ["slow-2g", "2g", "3g"]) {
    assert.equal(getArtPreloadPolicy({ effectiveType, downlink: 8 }).deferSpeculation, true);
  }
  assert.equal(getArtPreloadPolicy({ effectiveType: "4g", measuredMbps: 0.3 }).deferSpeculation, true);
  assert.equal(getArtPreloadPolicy({ effectiveType: "4g", downlink: 0.5 }).deferSpeculation, true);
  assert.deepEqual(getArtPreloadPolicy({ saveData: true, deviceMemory: 1 }), {
    allowSpeculation: false, deferSpeculation: true, maxUpcoming: 0,
    maxCached: 2, maxDecodedBytes: 8 * 1024 * 1024
  });
  assert.equal(getArtPreloadPolicy({ deviceMemory: 2 }).maxUpcoming, 1);
  assert.equal(getArtPreloadPolicy({ deviceMemory: 2 }).maxDecodedBytes, 12 * 1024 * 1024);
  assert.equal(getArtPreloadPolicy({ deviceMemory: 4 }).maxCached, 3);
});

test("Save-Data requests only the visible portrait, including during prologue prefetch", async () => {
  const { preloader, requests, imageFor } = fixture({
    getNetworkInfo: () => ({ saveData: true, effectiveType: "4g" })
  });
  await preloader.schedule([], [["first.webp"], ["second.webp"]]);
  assert.deepEqual(requests, []);
  const current = preloader.schedule(["first.webp"], [["second.webp"], ["third.webp"]]);
  assert.deepEqual(requests, ["first.webp"]);
  await imageFor("first.webp").succeed();
  assert.equal((await current)?.source, "first.webp");
  assert.deepEqual(requests, ["first.webp"]);
});

test("slow or unknown links wait through current decoding before fetching the nearest page", async () => {
  for (const network of [{ effectiveType: "2g" }, {}]) {
    const { preloader, requests, imageFor } = fixture({ getNetworkInfo: () => network });
    let finishDecode;
    const current = preloader.schedule(["current.webp"], [["next.webp"], ["later.webp"]]);
    assert.deepEqual(requests, ["current.webp"]);
    imageFor("current.webp").decode = () => new Promise(resolve => { finishDecode = resolve; });
    const decoding = imageFor("current.webp").succeed();
    assert.deepEqual(requests, ["current.webp"]);
    finishDecode();
    await decoding;
    await current;
    assert.deepEqual(requests, ["current.webp", "next.webp"]);
    await imageFor("next.webp").succeed();
    assert.deepEqual(requests, ["current.webp", "next.webp", "later.webp"]);
    preloader.schedule();
  }
});

test("an observed slow transfer overrides an optimistic 4g hint on the next page", async () => {
  const { preloader, requests, imageFor } = fixture({ measureTransferMbps: () => 0.4 });
  const initial = preloader.schedule(["initial.webp"]);
  await imageFor("initial.webp").succeed();
  await initial;
  const next = preloader.schedule(["current.webp"], [["upcoming.webp"]]);
  assert.deepEqual(requests, ["initial.webp", "current.webp"]);
  await imageFor("current.webp").succeed();
  await next;
  assert.deepEqual(requests, ["initial.webp", "current.webp", "upcoming.webp"]);
  preloader.schedule();
});

test("slow-link promotion reuses its request and cancels a competing speculative request", async () => {
  let network = { effectiveType: "4g" };
  const { preloader, requests, imageFor } = fixture({ getNetworkInfo: () => network });
  const old = preloader.schedule(["old.webp"], [["promoted.webp"], ["later.webp"]]);
  network = { effectiveType: "2g" };
  const current = preloader.schedule(["promoted.webp"], [["old.webp"], ["later.webp"]]);
  assert.equal(await old, null);
  assert.deepEqual(requests, ["old.webp", "promoted.webp"]);
  assert.equal(imageFor("promoted.webp").fetchPriority, "high");
  await imageFor("promoted.webp").succeed();
  await current;
  assert.deepEqual(requests, ["old.webp", "promoted.webp", "old.webp"]);
  preloader.schedule();
});

test("enabling Save-Data cancels in-flight speculation while keeping the current request", async () => {
  let saveData = false;
  const { preloader, requests, imageFor } = fixture({ getNetworkInfo: () => ({ effectiveType: "4g", saveData }) });
  const current = preloader.schedule(["current.webp"], [["next.webp"]]);
  const speculative = imageFor("next.webp");
  saveData = true;
  const same = preloader.schedule(["current.webp"], [["next.webp"]]);
  assert.equal(speculative.src, "");
  assert.equal(speculative.onload, null);
  await imageFor("current.webp").succeed();
  assert.equal((await current)?.image, (await same)?.image);
  assert.deepEqual(requests, ["current.webp", "next.webp"]);
});

test("speculative completions preserve current and nearest portraits under cache pressure", async () => {
  const { preloader, requests, imageFor } = fixture({ maxCached: 2, maxDecodedBytes: 12 * 1024 * 1024 });
  const current = preloader.schedule(["current.webp"], [["next.webp"], ["later.webp"]]);
  await imageFor("current.webp").succeed();
  await current;
  await imageFor("next.webp").succeed();
  await imageFor("later.webp").succeed();
  const initialRequests = [...requests];
  const retainedCurrent = await preloader.schedule(["current.webp"], [["next.webp"], ["later.webp"]]);
  assert.equal(retainedCurrent?.source, "current.webp");
  assert.deepEqual(requests, initialRequests, "uncached speculation must not restart on repeated renders");
  const retainedNext = await preloader.schedule(["next.webp"], [["later.webp"]]);
  assert.equal(retainedNext?.source, "next.webp");
  assert.deepEqual(requests, [...initialRequests, "later.webp"], "an earlier deadline may prefetch an image that previously did not fit");
  const promoted = preloader.schedule(["later.webp"]);
  assert.deepEqual(requests, [...initialRequests, "later.webp"]);
  await imageFor("later.webp").succeed();
  assert.equal((await promoted)?.source, "later.webp");
});

test("a one-portrait byte budget protects visible art from every speculative completion", async () => {
  const { preloader, requests, imageFor } = fixture({ maxDecodedBytes: 6 * 1024 * 1024 });
  const current = preloader.schedule(["current.webp"], [["next.webp"], ["later.webp"]]);
  await imageFor("current.webp").succeed();
  await current;
  await imageFor("next.webp").succeed();
  await imageFor("later.webp").succeed();
  assert.equal((await preloader.schedule(["current.webp"]))?.source, "current.webp");
  assert.deepEqual(requests, ["current.webp", "next.webp", "later.webp"]);
});

test("low-memory devices bound both lookahead requests and retained portraits", async () => {
  const { preloader, requests, imageFor } = fixture({
    getNetworkInfo: () => ({ effectiveType: "4g", deviceMemory: 2 })
  });
  const first = preloader.schedule(["current.webp"], [["next.webp"], ["ignored.webp"]]);
  await imageFor("current.webp").succeed();
  await first;
  await imageFor("next.webp").succeed();
  assert.deepEqual(requests, ["current.webp", "next.webp"]);
  const next = await preloader.schedule(["next.webp"], [["third.webp"]]);
  assert.equal(next?.source, "next.webp");
  await imageFor("third.webp").succeed();
  const old = preloader.schedule(["current.webp"]);
  assert.deepEqual(requests, ["current.webp", "next.webp", "third.webp", "current.webp"]);
  await imageFor("current.webp").succeed();
  await old;
});

test("failed speculative art is retried only when promoted or re-entering lookahead", async () => {
  const { preloader, requests, imageFor } = fixture();
  const current = preloader.schedule(["current.webp"], [["bad.webp"]]);
  imageFor("bad.webp").fail();
  await imageFor("current.webp").succeed();
  await current;
  await preloader.schedule(["current.webp"], [["bad.webp"]]);
  assert.deepEqual(requests, ["current.webp", "bad.webp"]);
  const promoted = preloader.schedule(["bad.webp"]);
  assert.deepEqual(requests, ["current.webp", "bad.webp", "bad.webp"]);
  await imageFor("bad.webp").succeed();
  await promoted;
});

function lookahead(options = {}) {
  return collectPortraitLookahead({
    sceneIndex: 0, pages: [],
    selectPortrait: (sceneIndex, page) => ({ source: page, sources: [`${sceneIndex}/${page}`] }),
    sourcesFor: selection => selection.sources,
    ...options
  });
}

test("lookahead consults only the committed next chapter and only after a successful outcome", () => {
  let nextCalls = 0;
  const nextChapter = () => {
    nextCalls += 1;
    return { sceneIndex: 1, pages: ["current", "next", "next", "later", "ignored"] };
  };
  assert.deepEqual(lookahead({ currentSource: "current", nextChapter }), []);
  assert.deepEqual(lookahead({ currentSource: "current", nextChapter, outcome: "chosen", pendingBadEnd: "failure" }), []);
  assert.equal(nextCalls, 0);
  assert.deepEqual(lookahead({ currentSource: "current", nextChapter, outcome: "chosen" }), [["1/next"], ["1/later"]]);
  assert.equal(nextCalls, 1);
  assert.deepEqual(lookahead({ nextChapter: () => null, outcome: "final chapter" }), []);
});

test("same-chapter deadlines take priority, skip duplicates and stop without inspecting later branches", () => {
  let nextCalls = 0;
  const nextChapter = () => { nextCalls += 1; return { sceneIndex: 1, pages: ["next-chapter"] }; };
  assert.deepEqual(lookahead({
    pages: ["past", "current", "soon", "soon", "later", "ignored"],
    startIndex: 1, currentSource: "current", outcome: "chosen", nextChapter
  }), [["0/soon"], ["0/later"]]);
  assert.equal(nextCalls, 0);
  assert.deepEqual(lookahead({
    pages: ["past", "soon"], startIndex: 1, outcome: "chosen", nextChapter
  }), [["0/soon"], ["1/next-chapter"]]);
  assert.equal(nextCalls, 1);
});

test("a scene batch reserves both slots for visible background and speaker before props or lookahead", async () => {
  const { preloader, requests, imageFor } = fixture();
  let background;
  let portrait;
  let prop;
  preloader.batch(() => {
    portrait = preloader.schedule(["speaker.webp"], [["next.webp"]]);
    background = preloader.retain("background", ["room.webp"], { priority: "high" });
    prop = preloader.retain("prop", ["key.webp"], { priority: "low" });
  });
  assert.deepEqual(requests, ["speaker.webp", "room.webp"]);
  await imageFor("speaker.webp").succeed(); await portrait;
  assert.deepEqual(requests, ["speaker.webp", "room.webp", "key.webp"]);
  await imageFor("room.webp").succeed(); await background;
  await imageFor("key.webp").succeed(); await prop;
  assert.deepEqual(requests, ["speaker.webp", "room.webp", "key.webp", "next.webp"]);
  preloader.schedule(); preloader.release("background"); preloader.release("prop");
});

test("two consumers reuse one decode and releasing one cannot cancel the other", async () => {
  const { preloader, requests, imageFor } = fixture();
  const first = preloader.retain("stage", ["shared.webp"], { priority: "high" });
  const second = preloader.retain("gallery", ["shared.webp"]);
  preloader.release("gallery");
  assert.deepEqual(requests, ["shared.webp"]);
  await imageFor("shared.webp").succeed();
  const result = await first;
  assert.equal((await second).image, result.image);
  const again = await preloader.retain("stage", ["shared.webp"], { priority: "high" });
  assert.equal(again.image, result.image);
  preloader.release("stage");
});

test("a visible prop pauses for two urgent images without rejecting its consumer", async () => {
  const { preloader, requests, imageFor } = fixture();
  const prop = preloader.retain("prop", ["key.webp"], { priority: "low" });
  const originalProp = imageFor("key.webp");
  let settled = false;
  void prop.then(() => { settled = true; });
  let portrait;
  let background;
  preloader.batch(() => {
    portrait = preloader.schedule(["speaker.webp"]);
    background = preloader.retain("background", ["room.webp"], { priority: "high" });
  });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(originalProp.src, "");
  assert.deepEqual(requests, ["key.webp", "speaker.webp", "room.webp"]);
  await imageFor("speaker.webp").succeed(); await portrait;
  await imageFor("room.webp").succeed(); await background;
  await imageFor("key.webp").succeed();
  assert.equal((await prop).source, "key.webp");
  preloader.schedule(); preloader.release("background"); preloader.release("prop");
});

test("Save-Data retains visible backgrounds and props but never downloads the next scene", async () => {
  const { preloader, requests, imageFor } = fixture({ getNetworkInfo: () => ({ saveData: true, effectiveType: "3g" }) });
  let background;
  let prop;
  preloader.batch(() => {
    background = preloader.retain("background", ["current.webp"], { priority: "high" });
    prop = preloader.retain("prop", ["prop.webp"], { priority: "low" });
    preloader.schedule([], [["next.webp"]]);
  });
  assert.deepEqual(requests, ["current.webp"]);
  await imageFor("current.webp").succeed(); await background;
  await imageFor("prop.webp").succeed(); await prop;
  assert.deepEqual(requests, ["current.webp", "prop.webp"]);
  preloader.release("background"); preloader.release("prop");
});

test("leaving a scene cancels all unshared in-flight art and ignores late decode completions", async () => {
  const { preloader, requests, imageFor } = fixture();
  const old = preloader.retain("background", ["old-room.webp"], { priority: "high" });
  let finishDecode;
  const oldImage = imageFor("old-room.webp");
  oldImage.decode = () => new Promise(resolve => { finishDecode = resolve; });
  const decoding = oldImage.succeed();
  const next = preloader.retain("background", ["new-room.webp"], { priority: "high" });
  assert.equal(await old, null);
  finishDecode(); await decoding;
  await imageFor("new-room.webp").succeed(); await next;
  preloader.retain("background", ["old-room.webp"], { priority: "high" });
  assert.deepEqual(requests, ["old-room.webp", "new-room.webp", "old-room.webp"]);
  preloader.release("background");
});

test("a failed visible decoration does not restart when unrelated pages are scheduled", async () => {
  const { preloader, requests, imageFor } = fixture();
  const failed = preloader.retain("prop", ["missing.webp"], { priority: "low" });
  imageFor("missing.webp").fail();
  assert.equal(await failed, null);
  const portrait = preloader.schedule(["speaker.webp"]);
  await imageFor("speaker.webp").succeed(); await portrait;
  preloader.schedule();
  assert.deepEqual(requests, ["missing.webp", "speaker.webp"]);
  preloader.release("prop");
});
