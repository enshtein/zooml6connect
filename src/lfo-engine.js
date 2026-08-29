import { clampMidi } from "./midi-mappings.js";

export class LfoEngine {
  #entries = new Map();
  #frame = 0;
  #lastTime = performance.now();

  isActive(key) {
    return this.#entries.has(key);
  }

  start(key, baseValue, onValue, config = {}) {
    this.#entries.set(key, {
      baseValue: clampMidi(baseValue),
      onValue,
      phase: 0,
      lastSent: 0,
      rate: config.rate ?? 1,
      depth: config.depth ?? 0.3,
      waveform: config.waveform ?? "sine",
      mode: config.mode ?? "bipolar",
      paused: false
    });
    if (!this.#frame) this.#frame = requestAnimationFrame(time => this.#tick(time));
  }

  updateBase(key, value) {
    const entry = this.#entries.get(key);
    if (entry) entry.baseValue = clampMidi(value);
  }

  configure(key, config = {}) {
    const entry = this.#entries.get(key);
    if (!entry) return;
    if (config.rate !== undefined) entry.rate = Math.max(0.01, Number(config.rate));
    if (config.depth !== undefined) entry.depth = Math.max(0, Math.min(1, Number(config.depth)));
    if (config.waveform) entry.waveform = config.waveform;
    if (config.mode) entry.mode = config.mode;
  }

  setPaused(key, paused) {
    const entry = this.#entries.get(key);
    if (entry) entry.paused = Boolean(paused);
  }

  stop(key, restore = true) {
    const entry = this.#entries.get(key);
    if (!entry) return;
    this.#entries.delete(key);
    if (restore) entry.onValue(entry.baseValue, true);
    if (!this.#entries.size && this.#frame) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }
  }

  #tick(time) {
    const delta = Math.min(0.1, (time - this.#lastTime) / 1000);
    this.#lastTime = time;
    for (const entry of this.#entries.values()) {
      if (entry.paused) continue;
      entry.phase = (entry.phase + delta * entry.rate) % 1;
      if (time - entry.lastSent < 33) continue;
      entry.lastSent = time;
      let wave = this.#wave(entry.waveform, entry.phase);
      if (entry.mode === "positive") wave = (wave + 1) / 2;
      else if (entry.mode === "negative") wave = -(wave + 1) / 2;
      const value = clampMidi(entry.baseValue + wave * entry.depth * 127);
      entry.onValue(value, false);
    }
    this.#frame = this.#entries.size ? requestAnimationFrame(next => this.#tick(next)) : 0;
  }

  #wave(waveform, phase) {
    if (waveform === "triangle") return 1 - 4 * Math.abs(phase - 0.5);
    if (waveform === "square") return phase < 0.5 ? 1 : -1;
    if (waveform === "saw") return 2 * phase - 1;
    return Math.sin(phase * Math.PI * 2);
  }
}
