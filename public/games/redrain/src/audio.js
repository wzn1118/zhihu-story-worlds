import { DEFAULT_AUDIO_TRACK, getAudioTrack, selectAudioSource } from "./audio-score.js";

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const QUIET = 0.0001;

export class RebirthWeekAudio {
  constructor() {
    this.context = null;
    this.fxBus = null;
    this.enabled = false;
    this.volume = 0.62;
    this.progress = 0;
    this.trackId = DEFAULT_AUDIO_TRACK;
    this.trackIntent = "mood";
    this.activeTrack = getAudioTrack(this.trackId);
    this.activePlayer = null;
    this.players = new Map();
    this.trackSources = new Map();
    this.mediaProbe = null;
    this.fadeFrame = 0;
    this.lastError = null;
  }

  async enable() {
    const player = this.#playerFor(this.activeTrack);
    if (!player) return false;
    this.enabled = true;
    this.#ensureFx();
    if (this.context?.state === "suspended") await this.context.resume();
    player.volume = 0;
    this.activePlayer = player;
    this.lastError = null;
    try {
      await player.play();
      this.#crossfade(null, player, 260);
      return true;
    } catch (error) {
      this.enabled = false;
      this.lastError = error?.message || "audio playback failed";
      return false;
    }
  }

  disable() {
    this.enabled = false;
    window.cancelAnimationFrame(this.fadeFrame);
    const players = [...this.players.values()].filter(player => !player.paused);
    const startedAt = performance.now();
    const levels = players.map(player => player.volume);
    const fade = now => {
      const mix = Math.max(0, Math.min(1, (now - startedAt) / 220));
      players.forEach((player, index) => { player.volume = levels[index] * (1 - mix); });
      if (mix < 1) this.fadeFrame = window.requestAnimationFrame(fade);
      else players.forEach(player => player.pause());
    };
    this.fadeFrame = window.requestAnimationFrame(fade);
  }

  async toggle() {
    if (this.enabled) {
      this.disable();
      return false;
    }
    return this.enable();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.enabled && this.activePlayer) this.activePlayer.volume = this.volume;
  }

  setTrack(id, { source = "scene" } = {}) {
    const next = getAudioTrack(id);
    this.trackIntent = source;
    if (next.id === this.trackId) return this.getSnapshot();
    this.trackId = next.id;
    this.activeTrack = next;
    if (this.enabled) this.#activateTrack(next);
    return this.getSnapshot();
  }

  setMood(progress) {
    this.progress = Math.max(0, Math.min(1, Number(progress) || 0));
    if (this.trackIntent === "mood") {
      const id = this.progress < 0.16 ? "dawn" : this.progress > 0.68 ? "pursuit" : "watch";
      this.setTrack(id, { source: "mood" });
    }
  }

  getSnapshot() {
    const player = this.players.get(this.activeTrack.id);
    const source = this.#sourceFor(this.activeTrack);
    return {
      enabled: this.enabled,
      playing: Boolean(this.enabled && player && !player.paused),
      orchestral: true,
      track: this.activeTrack.id,
      title: this.activeTrack.title,
      tempo: this.activeTrack.tempo,
      bars: this.activeTrack.bars,
      duration: this.activeTrack.duration,
      source: source.src,
      format: source.format,
      readyState: player?.readyState || 0,
      volume: Math.round(this.volume * 100),
      error: this.lastError
    };
  }

  click(strength = 1) {
    if (!this.enabled) return;
    this.#beep(390 + strength * 110, 0.05, 0.024 * strength, "triangle");
  }

  resolve() {
    if (!this.enabled) return;
    [0, 4, 7, 12].forEach((note, index) => {
      window.setTimeout(() => this.#beep(220 * 2 ** (note / 12), 0.42, 0.022, "sine"), index * 115);
    });
  }

  fail() {
    if (!this.enabled) return;
    [7, 3, 0].forEach((note, index) => {
      window.setTimeout(() => this.#beep(150 * 2 ** (note / 12), 0.32, 0.019, "sawtooth"), index * 180);
    });
  }

  #sourceFor(track) {
    if (this.trackSources.has(track.id)) return this.trackSources.get(track.id);
    if (!this.mediaProbe && typeof Audio === "function") this.mediaProbe = new Audio();
    const source = selectAudioSource(track, this.mediaProbe);
    this.trackSources.set(track.id, source);
    return source;
  }

  #playerFor(track) {
    if (typeof Audio !== "function") return null;
    if (this.players.has(track.id)) return this.players.get(track.id);
    const source = this.#sourceFor(track);
    const player = new Audio(source.src);
    player.loop = true;
    player.preload = "auto";
    player.volume = 0;
    player.dataset.track = track.id;
    player.addEventListener("error", () => {
      if (this.activeTrack.id === track.id) this.lastError = player.error?.message || `failed to load ${source.src}`;
    });
    this.players.set(track.id, player);
    return player;
  }

  #activateTrack(track) {
    const previous = this.activePlayer;
    const next = this.#playerFor(track);
    if (!next || previous === next) return;
    this.activePlayer = next;
    this.lastError = null;
    next.currentTime = 0;
    next.volume = 0;
    const promise = next.play();
    promise?.then(() => this.#crossfade(previous, next, 900)).catch(error => {
      this.lastError = error?.message || "audio playback failed";
    });
  }

  #crossfade(previous, next, duration) {
    window.cancelAnimationFrame(this.fadeFrame);
    const startedAt = performance.now();
    const previousLevel = previous?.volume || 0;
    const fade = now => {
      const mix = Math.max(0, Math.min(1, (now - startedAt) / duration));
      next.volume = this.volume * mix;
      if (previous && previous !== next) previous.volume = previousLevel * (1 - mix);
      if (mix < 1 && this.enabled) {
        this.fadeFrame = window.requestAnimationFrame(fade);
      } else if (previous && previous !== next) {
        previous.pause();
        previous.currentTime = 0;
      }
    };
    this.fadeFrame = window.requestAnimationFrame(fade);
  }

  #ensureFx() {
    if (!AudioContextClass || this.context) return;
    this.context = new AudioContextClass();
    this.fxBus = this.context.createGain();
    this.fxBus.gain.value = 0.36;
    this.fxBus.connect(this.context.destination);
  }

  #beep(frequency, duration, level, type) {
    if (!this.context || !this.fxBus) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(QUIET, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(QUIET, now + duration);
    oscillator.connect(gain).connect(this.fxBus);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }
}
