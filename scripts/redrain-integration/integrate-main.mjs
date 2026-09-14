export function integrateMain(original) {
  let code = original;
  const replace = (before, after) => {
    if (!code.includes(before)) throw new Error(`Main integration anchor missing: ${before.slice(0, 90)}`);
    code = code.replace(before, after);
  };
  replace('const SAVE_KEY =', 'import { EMBEDDED, createRedleafBridge } from "./platform-bridge.js";\n\nlet bridge = null;\nlet redleafResumeAudio = false;\nconst SAVE_KEY =');
  replace('function saveAudioPreferences() {', 'function saveAudioPreferences() {\n  if (EMBEDDED) return;');
  replace('const saved = JSON.parse(localStorage.getItem(AUDIO_PREFS_KEY));', 'const saved = EMBEDDED ? null : JSON.parse(localStorage.getItem(AUDIO_PREFS_KEY));');
  replace('const saved = JSON.parse(localStorage.getItem(READING_PREFS_KEY));', 'const saved = EMBEDDED ? null : JSON.parse(localStorage.getItem(READING_PREFS_KEY));');
  replace('let state = loadState();', 'let state = EMBEDDED ? freshState() : loadState();');
  replace('let seenEndings = loadSeenEndings();', 'let seenEndings = EMBEDDED ? [] : loadSeenEndings();');
  replace('function saveState() {', 'function saveState() {\n  if (EMBEDDED) { bridge?.checkpoint(); return; }');
  replace('function saveReadingPreferences() {', 'function saveReadingPreferences() {\n  if (EMBEDDED) return;');
  replace('localStorage.setItem(ENDINGS_KEY, JSON.stringify(seenEndings));', 'if (!EMBEDDED) localStorage.setItem(ENDINGS_KEY, JSON.stringify(seenEndings));');
  replace('function frame(now) {', 'function frame(now) {\n  if (bridge?.paused) { lastFrame = now; window.requestAnimationFrame(frame); return; }');
  replace('window.advanceTime = (milliseconds) => {', 'window.advanceTime = (milliseconds) => {\n  if (bridge?.paused) return;');
  replace('    coordinateSystem:', '    platform: { embedded: EMBEDDED, restored: bridge?.restored ?? true, paused: bridge?.paused ?? false },\n    coordinateSystem:');
  const bootstrap = `bridge = createRedleafBridge({
  getState: () => state,
  getEndings: () => seenEndings,
  restore(snapshot) {
    state = snapshot ? structuredClone(snapshot.state) : freshState();
    seenEndings = snapshot ? [...snapshot.endings] : [];
    readingIdentity = "";
  },
  settings(settings) {
    if (!settings || typeof settings !== "object") return;
    const speed = settings.textSpeed;
    if (typeof speed === "number") elements.readingSpeed.value = speed >= 100 ? "instant" : speed >= 70 ? "fast" : speed <= 25 ? "slow" : "standard";
    if (typeof settings.reducedMotion === "boolean") elements.readingReducedMotion.checked = settings.reducedMotion;
    const volume = settings.bgmVolume ?? settings.volume;
    if (typeof volume === "number") {
      const normalized = Math.max(0, Math.min(1, volume > 1 ? volume / 100 : volume));
      audio.setVolume(normalized);
      elements.volumeSlider.value = String(Math.round(normalized * 100));
    }
    if (settings.sound === false) {
      audio.disable();
      redleafResumeAudio = false;
      elements.soundConsent.checked = false;
    }
    if (typeof settings.textSize === "number") document.documentElement.style.setProperty("--redleaf-font-size", settings.textSize + "px");
    if (settings.lineHeight) document.documentElement.style.setProperty("--redleaf-line-height", String(settings.lineHeight));
    reader.setSpeed(elements.readingSpeed.value);
    if (motionReduced()) reader.finish();
    if (state.mode === "game" && revealedSpan) updateReadingReveal();
    renderMusicStatus();
  },
  command(command) {
    if (command === "settings") elements.menuDialog.showModal();
    if (command === "source") elements.sourceDialog.showModal();
    if (command === "restart") {
      document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
      restart();
    }
  },
  pause() { redleafResumeAudio = audio.enabled; audio.disable(); },
  resume() { if (redleafResumeAudio) { redleafResumeAudio = false; void audio.enable(); } },
  error(message) { showToast(message); },
  start() {
    render();
    resizeCanvas();
    renderTutorial();
    window.requestAnimationFrame(frame);
    if (state.mode === "game" && !state.tutorialSeen) elements.tutorialDialog.showModal();
  }
});
bridge.start();`;
  const anchor = 'render();\nresizeCanvas();\nrenderTutorial();\nwindow.requestAnimationFrame(frame);\n\nif (state.mode === "game" && !state.tutorialSeen) {\n  elements.tutorialDialog.showModal();\n}';
  // Portable release uses CRLF; normalize once to keep transforms reproducible.
  code = code.replaceAll('\r\n', '\n');
  replace(anchor, bootstrap);
  return code;
}
