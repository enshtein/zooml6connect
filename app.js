import { CHANNEL_MAPPINGS, GLOBAL_MAPPINGS, LAYERS, MIDI_CHANNEL, SCENES, clampMidi } from "./src/midi-mappings.js";
import { MidiService } from "./src/midi-service.js";
import { LfoEngine } from "./src/lfo-engine.js";
import { AudioService } from "./src/audio-service.js";

const midi = new MidiService();
const lfo = new LfoEngine();
const audio = new AudioService();
const midiLogs = [];
const MIXER_STORAGE_KEY = "zoom-l6-connect:mixer-state:v1";
let activeLayer = "high";
let connectionAttempt = null;
let audioConnectionAttempt = null;
let audioInputChannelCount = 0;
let selectedScene = 0;
let compressorActive = false;
let persistTimer = 0;
const lfoConfigs = {};
let editedLfo = null;

const channels = CHANNEL_MAPPINGS.map(mapping => ({
  ...mapping,
  level: 100,
  muted: false,
  routeActive: false,
  values: Object.fromEntries(Object.entries(LAYERS).map(([key, layer]) => [key, layer.defaultValue]))
}));

restoreMixerState();

const channelsRoot = document.querySelector("#channels");
const template = document.querySelector("#channelTemplate");
const connectionIndicator = document.querySelector("#midiConnectionIndicator");
const settingsDialog = document.querySelector("#midiSettingsDialog");
const iosMidiCompatibilityDialog = document.querySelector("#iosMidiCompatibilityDialog");
const inputSelect = document.querySelector("#midiInputSelect");
const outputSelect = document.querySelector("#midiOutputSelect");
const logElement = document.querySelector("#midiLog");
const audioIndicator = document.querySelector("#audioConnectionIndicator");
const audioDialog = document.querySelector("#audioSettingsDialog");
const audioDeviceSelect = document.querySelector("#audioDeviceSelect");
const audioDeviceInfo = document.querySelector("#audioDeviceInfo");
const keepAwakeToggle = document.querySelector("#keepAwakeToggle");
const lfoDialog = document.querySelector("#lfoSettingsDialog");
const lfoRateInput = document.querySelector("#lfoRate");
const lfoDepthInput = document.querySelector("#lfoDepth");

channels.forEach((channel, index) => renderChannel(channel, index));

function renderChannel(channel, index) {
  const fragment = template.content.cloneNode(true);
  const strip = fragment.querySelector(".channel-strip");
  strip.dataset.channel = channel.number;
  fragment.querySelector(".channel-number").textContent = channel.number;
  fragment.querySelector(".channel-kind").textContent = channel.kind;

  const routeButton = fragment.querySelector(".route-button");
  routeButton.textContent = channel.routeLabel;
  routeButton.setAttribute("aria-pressed", "false");
  if (!channel.routeMidiSupported) routeButton.title = "Phantom power is not exposed by the documented L6 MIDI mapping";
  routeButton.addEventListener("click", () => {
    channel.routeActive = !channel.routeActive;
    updateRouteButton(strip, channel);
    if (channel.routeMidiSupported) midi.sendControlChange(channel.cc.route, channel.routeActive ? 127 : 0, MIDI_CHANNEL);
    schedulePersist();
  });

  const meters = fragment.querySelector(".channel-meters");
  const meterCount = index < 2 ? 1 : 2;
  if (meterCount === 2) meters.append(meters.firstElementChild.cloneNode(true));
  meters.querySelectorAll(".channel-meter").forEach((meter, meterIndex) => {
    meter.style.setProperty("--meter", "0%");
    meter.setAttribute("aria-label", `${channel.number} ${meterIndex === 0 ? "L" : "R"}`);
  });

  const upperMeterSpacer = meters.cloneNode(true);
  upperMeterSpacer.classList.add("upper-meter-spacer");
  upperMeterSpacer.setAttribute("aria-hidden", "true");
  upperMeterSpacer.querySelectorAll(".channel-meter").forEach(meter => meter.removeAttribute("aria-label"));
  fragment.querySelector(".upper-zone .fader-and-meter").append(upperMeterSpacer);

  const parameterFader = fragment.querySelector(".parameter-fader");
  parameterFader.addEventListener("input", event => {
    const value = clampMidi(event.target.value);
    channel.values[activeLayer] = value;
    lfo.updateBase(lfoKey(channel.number, activeLayer), value);
    updateStrip(strip, channel);
    midi.sendControlChange(channel.cc[activeLayer], value, MIDI_CHANNEL);
    schedulePersist();
  });

  const levelFader = fragment.querySelector(".level-fader");
  levelFader.addEventListener("input", event => {
    channel.level = clampMidi(event.target.value);
    lfo.updateBase(lfoKey(channel.number, "level"), channel.level);
    updateStrip(strip, channel);
    midi.sendControlChange(channel.cc.level, channel.level, MIDI_CHANNEL);
    schedulePersist();
  });
  addDoubleTap(levelFader, () => {
    lfo.stop(lfoKey(channel.number, "level"), false);
    channel.level = 64;
    updateStrip(strip, channel);
    midi.sendControlChange(channel.cc.level, 64, MIDI_CHANNEL);
    schedulePersist();
  });

  fragment.querySelector(".mute-button").addEventListener("click", () => {
    channel.muted = !channel.muted;
    updateMuteButton(strip, channel);
    midi.sendControlChange(channel.cc.mute, channel.muted ? 127 : 0, MIDI_CHANNEL);
    schedulePersist();
  });

  fragment.querySelector(".lfo-button").addEventListener("click", () => openLfoDialog(strip, channel, activeLayer));
  fragment.querySelector(".level-lfo-button").addEventListener("click", () => openLfoDialog(strip, channel, "level"));
  channelsRoot.append(fragment);
  updateStrip(strip, channel);
  updateMuteButton(strip, channel);
  updateRouteButton(strip, channel);
}

document.querySelectorAll(".layer-button").forEach(button => {
  button.classList.toggle("active", button.dataset.layer === activeLayer);
  button.addEventListener("click", () => {
    activeLayer = button.dataset.layer;
    document.querySelectorAll(".layer-button").forEach(item => item.classList.toggle("active", item === button));
    channels.forEach(channel => updateStrip(getStrip(channel.number), channel));
    schedulePersist();
  });
});

document.querySelectorAll(".scene-buttons button").forEach((button, index) => {
  button.dataset.program = SCENES[index].program;
  button.addEventListener("click", () => {
    selectScene(SCENES[index].program);
    midi.sendProgramChange(SCENES[index].program, MIDI_CHANNEL);
    schedulePersist();
  });
});

const compressorButton = document.querySelector(".comp-button");
compressorButton.setAttribute("aria-pressed", "false");
compressorButton.addEventListener("click", () => {
  const active = !compressorButton.classList.contains("active");
  setCompressor(active);
  midi.sendControlChange(GLOBAL_MAPPINGS.compressor, active ? 127 : 0, MIDI_CHANNEL);
  schedulePersist();
});
setCompressor(compressorActive);
selectScene(selectedScene);

connectionIndicator.addEventListener("click", () => {
  if (isIOSDevice() && !midi.supported) openIOSMidiCompatibilityDialog();
  else openMidiDialog();
});
audioIndicator.addEventListener("click", () => openAudioDialog());
let keepAwakeRequested = false;
let wakeLockSentinel = null;

keepAwakeToggle.addEventListener("click", async () => {
  keepAwakeRequested = !keepAwakeRequested;
  await applyKeepAwake();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && keepAwakeRequested) applyKeepAwake();
});

async function applyKeepAwake() {
  try {
    if (window.webkit?.messageHandlers?.zoomSystem) {
      window.webkit.messageHandlers.zoomSystem.postMessage({ keepAwake: keepAwakeRequested });
    } else if (keepAwakeRequested && navigator.wakeLock?.request) {
      wakeLockSentinel = await navigator.wakeLock.request("screen");
      wakeLockSentinel.addEventListener("release", () => {
        wakeLockSentinel = null;
        if (document.visibilityState === "visible" && keepAwakeRequested) applyKeepAwake();
      }, { once: true });
    } else if (!keepAwakeRequested && wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    } else if (keepAwakeRequested) {
      throw new Error("Screen wake lock is not supported in this browser");
    }
    keepAwakeToggle.classList.toggle("active", keepAwakeRequested);
    keepAwakeToggle.setAttribute("aria-pressed", String(keepAwakeRequested));
    keepAwakeToggle.title = keepAwakeRequested ? "Screen will stay awake" : "Keep iPad screen awake";
  } catch (error) {
    keepAwakeRequested = false;
    keepAwakeToggle.classList.remove("active");
    keepAwakeToggle.setAttribute("aria-pressed", "false");
    keepAwakeToggle.title = error.message;
  }
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function openIOSMidiCompatibilityDialog() {
  if (!iosMidiCompatibilityDialog.open) iosMidiCompatibilityDialog.showModal();
}

async function openMidiDialog() {
  settingsDialog.showModal();
  try {
    if (!midi.connected) await midi.autoConnect();
    refreshPortSelectors();
  } catch (error) {
    refreshPortSelectors();
    setConnectionError(error);
    appendLog(`ERROR: ${error.message}`);
  }
}

document.querySelector("#midiAutoConnect").addEventListener("click", () => connectMidi());
document.querySelector("#midiApplyPorts").addEventListener("click", () => midi.selectPorts(inputSelect.value, outputSelect.value));
document.querySelector("#midiDisconnect").addEventListener("click", () => midi.disconnect());
document.querySelector("#midiDialogClose").addEventListener("click", () => settingsDialog.close());
document.querySelector("#iosMidiDialogClose").addEventListener("click", () => iosMidiCompatibilityDialog.close());
document.querySelector("#iosMidiContinue").addEventListener("click", () => iosMidiCompatibilityDialog.close());
document.querySelector("#audioDialogClose").addEventListener("click", () => audioDialog.close());
document.querySelector("#audioAutoConnect").addEventListener("click", () => connectAudio(true));
document.querySelector("#audioApplyDevice").addEventListener("click", () => connectAudio(false));
document.querySelector("#audioDisconnect").addEventListener("click", () => audio.disconnect());
document.querySelector("#lfoDialogClose").addEventListener("click", () => lfoDialog.close());
document.querySelector("#lfoEnable").addEventListener("click", toggleEditedLfo);
document.querySelector("#lfoRandom").addEventListener("click", randomizeEditedLfo);
document.querySelector("#lfoPause").addEventListener("click", toggleEditedLfoPause);
lfoRateInput.addEventListener("input", updateEditedLfoControls);
lfoDepthInput.addEventListener("input", updateEditedLfoControls);
document.querySelectorAll("#lfoWaveformOptions button, #lfoModeOptions button").forEach(button => {
  button.addEventListener("click", () => {
    if (!editedLfo) return;
    const config = getLfoConfig(editedLfo.key);
    if (button.closest("#lfoWaveformOptions")) config.waveform = button.dataset.value;
    else config.mode = button.dataset.value;
    lfo.configure(editedLfo.key, config);
    renderLfoDialog();
    schedulePersist();
  });
});

midi.addEventListener("connectionchange", event => updateConnection(event.detail));
midi.addEventListener("ports", refreshPortSelectors);
midi.addEventListener("controlchange", event => applyIncomingControlChange(event.detail));
midi.addEventListener("programchange", event => {
  selectScene(event.detail.program);
  schedulePersist();
});
midi.addEventListener("log", event => logMidiEvent(event.detail));
audio.addEventListener("connectionchange", event => updateAudioConnection(event.detail));
audio.addEventListener("levels", event => updateAudioMeters(event.detail));

async function openAudioDialog() {
  audioDialog.showModal();
  await refreshAudioDevices();
  if (!audio.connected) await connectAudio(true);
}

async function connectAudio(automatic) {
  if (audioConnectionAttempt) return audioConnectionAttempt;
  setAudioPending();
  audioConnectionAttempt = (async () => {
    try {
      const result = automatic ? await audio.autoConnect() : await audio.connect(audioDeviceSelect.value);
      await refreshAudioDevices(result.deviceId);
    } catch (error) {
      setAudioError(error);
      audioDeviceInfo.textContent = error.message;
      await refreshAudioDevices();
    } finally {
      audioConnectionAttempt = null;
    }
  })();
  return audioConnectionAttempt;
}

async function connectMidi() {
  if (connectionAttempt) return connectionAttempt;
  setConnectionPending();
  connectionAttempt = (async () => {
    try {
      await midi.autoConnect();
      refreshPortSelectors();
    } catch (error) {
      setConnectionError(error);
      appendLog(`ERROR: ${error.message}`);
    } finally {
      connectionAttempt = null;
    }
  })();
  return connectionAttempt;
}

function applyIncomingControlChange({ channel, cc, value }) {
  if (channel !== MIDI_CHANNEL) return;
  for (const channelState of channels) {
    if (channelState.cc.level === cc) {
      channelState.level = value;
      lfo.updateBase(lfoKey(channelState.number, "level"), value);
    }
    else if (channelState.cc.mute === cc) channelState.muted = value > 63;
    else if (channelState.cc.route === cc) channelState.routeActive = value > 63;
    else {
      const layer = Object.keys(LAYERS).find(key => channelState.cc[key] === cc);
      if (layer) channelState.values[layer] = value;
    }
    const strip = getStrip(channelState.number);
    updateStrip(strip, channelState);
    updateMuteButton(strip, channelState);
    updateRouteButton(strip, channelState);
  }
  if (cc === GLOBAL_MAPPINGS.compressor) setCompressor(value > 63);
  schedulePersist();
}

function openLfoDialog(strip, channel, layerKey) {
  editedLfo = { strip, channel, layerKey, key: lfoKey(channel.number, layerKey) };
  renderLfoDialog();
  lfoDialog.showModal();
}

function toggleEditedLfo() {
  if (!editedLfo) return;
  if (lfo.isActive(editedLfo.key)) {
    lfo.stop(editedLfo.key, true);
    getLfoConfig(editedLfo.key).paused = false;
  } else {
    startLfo(editedLfo.strip, editedLfo.channel, editedLfo.layerKey);
  }
  updateStrip(editedLfo.strip, editedLfo.channel);
  renderLfoDialog();
}

function toggleEditedLfoPause() {
  if (!editedLfo) return;
  const config = getLfoConfig(editedLfo.key);
  if (!lfo.isActive(editedLfo.key)) {
    Object.assign(config, { rateRaw: 40, depthRaw: 38, rate: rateFromRaw(40), depth: 38 / 127, waveform: "sine", mode: "bipolar", paused: false });
    renderLfoDialog();
    schedulePersist();
    return;
  }
  config.paused = !config.paused;
  lfo.setPaused(editedLfo.key, config.paused);
  updateStrip(editedLfo.strip, editedLfo.channel);
  renderLfoDialog();
}

function randomizeEditedLfo() {
  if (!editedLfo) return;
  const waveforms = ["sine", "triangle", "square", "saw"];
  const modes = ["bipolar", "positive", "negative"];
  const config = getLfoConfig(editedLfo.key);
  config.rateRaw = Math.floor(Math.random() * 128);
  config.depthRaw = Math.floor(Math.random() * 128);
  config.rate = rateFromRaw(config.rateRaw);
  config.depth = config.depthRaw / 127;
  config.waveform = waveforms[Math.floor(Math.random() * waveforms.length)];
  config.mode = modes[Math.floor(Math.random() * modes.length)];
  lfo.configure(editedLfo.key, config);
  renderLfoDialog();
  schedulePersist();
}

function startLfo(strip, channel, layerKey) {
  const key = lfoKey(channel.number, layerKey);
  const baseValue = layerKey === "level" ? channel.level : channel.values[layerKey];
  const cc = layerKey === "level" ? channel.cc.level : channel.cc[layerKey];
  const config = getLfoConfig(key);
  config.paused = false;
  lfo.start(key, baseValue, value => {
    if (layerKey === "level") channel.level = value;
    else channel.values[layerKey] = value;
    if (layerKey === "level" || activeLayer === layerKey) updateStrip(strip, channel);
    midi.sendControlChange(cc, value, MIDI_CHANNEL);
  }, config);
  updateStrip(strip, channel);
}

function updateStrip(strip, channel) {
  const layer = LAYERS[activeLayer];
  const value = channel.values[activeLayer];
  strip.querySelector(".parameter-name").textContent = layer.label;
  strip.querySelector(".parameter-value").textContent = value;
  strip.querySelector(".level-value").textContent = channel.level;
  strip.querySelector(".parameter-fader").value = value;
  strip.querySelector(".level-fader").value = channel.level;
  strip.querySelector(".upper-fader-wrap").style.setProperty("--fader-value", value / 127);
  strip.querySelector(".level-fader-wrap").style.setProperty("--fader-value", channel.level / 127);
  const upperKey = lfoKey(channel.number, activeLayer);
  const levelKey = lfoKey(channel.number, "level");
  strip.querySelector(".lfo-button").classList.toggle("active", lfo.isActive(upperKey));
  strip.querySelector(".lfo-button").classList.toggle("paused", Boolean(getLfoConfig(upperKey).paused && lfo.isActive(upperKey)));
  strip.querySelector(".level-lfo-button").classList.toggle("active", lfo.isActive(levelKey));
  strip.querySelector(".level-lfo-button").classList.toggle("paused", Boolean(getLfoConfig(levelKey).paused && lfo.isActive(levelKey)));
}

function updateMuteButton(strip, channel) {
  const button = strip.querySelector(".mute-button");
  button.classList.toggle("active", channel.muted);
  button.setAttribute("aria-pressed", String(channel.muted));
}

function updateRouteButton(strip, channel) {
  const button = strip.querySelector(".route-button");
  button.classList.toggle("active", channel.routeActive);
  button.setAttribute("aria-pressed", String(channel.routeActive));
}

function setCompressor(active) {
  compressorActive = active;
  compressorButton.classList.toggle("active", active);
  compressorButton.setAttribute("aria-pressed", String(active));
}

function selectScene(program) {
  selectedScene = program;
  document.querySelectorAll(".scene-buttons button").forEach(button => button.classList.toggle("active", Number(button.dataset.program) === program));
}

function updateConnection({ connected, inputName = "", outputName = "" }) {
  connectionIndicator.classList.toggle("connected", connected);
  connectionIndicator.classList.toggle("disconnected", !connected);
  connectionIndicator.classList.remove("attention", "error");
  connectionIndicator.setAttribute("aria-label", connected ? "MIDI connected" : "Connect MIDI");
  connectionIndicator.title = connected ? `${inputName} → ${outputName}` : "Choose MIDI connection";
}

function setConnectionPending() {
  connectionIndicator.classList.add("attention");
  connectionIndicator.classList.remove("connected", "error");
  connectionIndicator.setAttribute("aria-label", "Connecting MIDI");
}

function setConnectionError(error) {
  const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
  const unsupported = !midi.supported;
  connectionIndicator.classList.remove("connected", "attention");
  connectionIndicator.classList.add(denied || unsupported ? "error" : "attention");
  connectionIndicator.setAttribute("aria-label", unsupported ? "Web MIDI unavailable" : denied ? "Allow MIDI access" : "ZOOM L6 not found");
  connectionIndicator.title = unsupported
    ? "This browser does not support Web MIDI"
    : denied
      ? "MIDI permission is required — tap to try again"
      : "L6 Mixer Control ports were not found — tap to scan again";
}

function refreshPortSelectors() {
  fillSelect(inputSelect, midi.getInputs(), midi.input?.id);
  fillSelect(outputSelect, midi.getOutputs(), midi.output?.id);
}

function fillSelect(select, ports, selectedId) {
  select.replaceChildren(new Option("Not selected", ""), ...ports.map(port => new Option(port.name, port.id, false, port.id === selectedId)));
}

async function refreshAudioDevices(selectedId = audio.deviceId) {
  const devices = await audio.getDevices();
  audioDeviceSelect.replaceChildren(
    new Option("System default", ""),
    ...devices.map((device, index) => new Option(device.label || `Audio input ${index + 1}`, device.deviceId, false, device.deviceId === selectedId))
  );
}

function updateAudioConnection({
  connected,
  label = "",
  channelCount = 0,
  sampleRate = 0,
  maximumChannelCount = 0,
  sessionChannelCount = 0
}) {
  audioInputChannelCount = connected ? channelCount : 0;
  audioIndicator.classList.toggle("connected", connected);
  audioIndicator.classList.toggle("disconnected", !connected);
  audioIndicator.classList.remove("attention", "error");
  audioIndicator.setAttribute("aria-label", connected ? "Audio connected" : "Connect audio");
  audioIndicator.title = connected ? `${label}: ${channelCount} channels, ${sampleRate} Hz` : "Choose USB audio input";
  audioDeviceInfo.classList.toggle("warning", connected && channelCount < 12);
  const nativeDiagnostics = maximumChannelCount
    ? ` · iOS max ${maximumChannelCount}, session ${sessionChannelCount}, engine ${channelCount}`
    : "";
  audioDeviceInfo.textContent = connected
    ? channelCount < 12
      ? `${label || "Audio input"} · ${channelCount} channels · ${sampleRate} Hz${nativeDiagnostics}. L6 is in Stereo Mix/Automatic web mode. Restart the L6 while holding USB 1/2 + SOUND PAD 2 to select fixed Multi Track (12-in/4-out), then reconnect AUDIO.`
      : `${label || "Audio input"} · ${channelCount} channels · ${sampleRate} Hz${nativeDiagnostics}`
    : "Audio is disconnected";
}

function setAudioPending() {
  audioIndicator.classList.add("attention");
  audioIndicator.classList.remove("connected", "error");
  audioIndicator.setAttribute("aria-label", "Connecting audio");
  audioDeviceInfo.textContent = "Requesting audio input…";
}

function setAudioError(error) {
  const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
  audioIndicator.classList.remove("connected", "attention");
  audioIndicator.classList.add("error");
  audioIndicator.setAttribute("aria-label", denied ? "Allow audio access" : "Audio connection failed");
  audioIndicator.title = denied ? "Microphone permission is required" : error.message;
}

function updateAudioMeters(levels) {
  if (audioInputChannelCount === 2) {
    channels.forEach(channel => {
      const strip = getStrip(channel.number);
      strip.querySelectorAll(".lower-zone .channel-meter").forEach(meter => setMeterLevel(meter, 0));
      strip.querySelector(".signal-led").classList.remove("active");
    });
    document.querySelectorAll(".master-channel-meters .channel-meter").forEach((meter, index) => setMeterLevel(meter, levels[index] || 0));
    return;
  }

  // Physical L6 USB capture order: MASTER L/R first, then CH1, CH2, CH3–CH6 stereo pairs.
  const layout = [[2], [3], [4, 5], [6, 7], [8, 9], [10, 11]];
  layout.forEach((sourceChannels, stripIndex) => {
    const strip = getStrip(stripIndex + 1);
    const meters = strip.querySelectorAll(".lower-zone .channel-meter");
    meters.forEach((meter, meterIndex) => setMeterLevel(meter, levels[sourceChannels[meterIndex]] || 0));
    const peak = Math.max(...sourceChannels.map(channel => levels[channel] || 0));
    strip.querySelector(".signal-led").classList.toggle("active", peak > 0.08);
  });
  document.querySelectorAll(".master-channel-meters .channel-meter").forEach((meter, index) => {
    setMeterLevel(meter, audioInputChannelCount >= 12 ? levels[index] || 0 : 0);
  });
}

function setMeterLevel(meter, normalizedLevel) {
  meter.style.setProperty("--meter", `${Math.round(normalizedLevel * 100)}%`);
}

function getLfoConfig(key) {
  if (!lfoConfigs[key]) {
    lfoConfigs[key] = { rateRaw: 40, depthRaw: 38, rate: rateFromRaw(40), depth: 38 / 127, waveform: "sine", mode: "bipolar", paused: false };
  }
  return lfoConfigs[key];
}

function rateFromRaw(raw) {
  return 0.05 + Math.pow(clampMidi(raw) / 127, 2) * 9.95;
}

function updateEditedLfoControls() {
  if (!editedLfo) return;
  const config = getLfoConfig(editedLfo.key);
  config.rateRaw = clampMidi(lfoRateInput.value);
  config.depthRaw = clampMidi(lfoDepthInput.value);
  config.rate = rateFromRaw(config.rateRaw);
  config.depth = config.depthRaw / 127;
  lfo.configure(editedLfo.key, config);
  renderLfoDialog();
  schedulePersist();
}

function renderLfoDialog() {
  if (!editedLfo) return;
  const config = getLfoConfig(editedLfo.key);
  const label = editedLfo.layerKey === "level" ? "LEVEL" : LAYERS[editedLfo.layerKey].label;
  document.querySelector("#lfoDialogTitle").textContent = `LFO · CH ${editedLfo.channel.number} · ${label}`;
  lfoRateInput.value = config.rateRaw;
  lfoDepthInput.value = config.depthRaw;
  lfoRateInput.closest(".fader-wrap").style.setProperty("--fader-value", config.rateRaw / 127);
  lfoDepthInput.closest(".fader-wrap").style.setProperty("--fader-value", config.depthRaw / 127);
  document.querySelector("#lfoRateValue").textContent = `${config.rate.toFixed(config.rate < 0.1 ? 2 : 1)} Hz`;
  document.querySelector("#lfoDepthValue").textContent = `${Math.round(config.depth * 100)}%`;
  document.querySelectorAll("#lfoWaveformOptions button").forEach(button => {
    const selected = button.dataset.value === config.waveform;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  document.querySelectorAll("#lfoModeOptions button").forEach(button => {
    const selected = button.dataset.value === config.mode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  const enabled = lfo.isActive(editedLfo.key);
  const enableButton = document.querySelector("#lfoEnable");
  const pauseButton = document.querySelector("#lfoPause");
  enableButton.textContent = enabled ? "DISABLE" : "ENABLE";
  enableButton.classList.toggle("active", enabled);
  pauseButton.disabled = false;
  pauseButton.textContent = enabled ? (config.paused ? "RESUME" : "PAUSE") : "RESET";
  pauseButton.classList.toggle("active", enabled && config.paused);
}

function addDoubleTap(element, callback) {
  let press = null;
  let previousTap = 0;

  element.addEventListener("pointerdown", event => {
    press = { x: event.clientX, y: event.clientY, time: performance.now() };
  });
  element.addEventListener("pointerup", event => {
    if (!press) return;
    const now = performance.now();
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    const isTap = moved <= 10 && now - press.time <= 300;
    press = null;
    if (!isTap) {
      previousTap = 0;
      return;
    }
    if (now - previousTap <= 320) {
      previousTap = 0;
      callback();
    } else {
      previousTap = now;
    }
  });
  element.addEventListener("pointercancel", () => {
    press = null;
    previousTap = 0;
  });
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistMixerState, 150);
}

function persistMixerState() {
  clearTimeout(persistTimer);
  persistTimer = 0;
  try {
    localStorage.setItem(MIXER_STORAGE_KEY, JSON.stringify({
      activeLayer,
      selectedScene,
      compressorActive,
      lfoConfigs: Object.fromEntries(Object.entries(lfoConfigs).map(([key, config]) => [key, { ...config, paused: false }])),
      channels: channels.map(channel => ({
        number: channel.number,
        level: channel.level,
        muted: channel.muted,
        routeActive: channel.routeActive,
        values: channel.values
      }))
    }));
  } catch (error) {
    appendLog(`STORAGE ERROR: ${error.message}`);
  }
}

function restoreMixerState() {
  try {
    const saved = JSON.parse(localStorage.getItem(MIXER_STORAGE_KEY));
    if (!saved || typeof saved !== "object") return;
    if (Object.hasOwn(LAYERS, saved.activeLayer)) activeLayer = saved.activeLayer;
    if (SCENES.some(scene => scene.program === saved.selectedScene)) selectedScene = saved.selectedScene;
    compressorActive = Boolean(saved.compressorActive);
    if (saved.lfoConfigs && typeof saved.lfoConfigs === "object") {
      for (const [key, config] of Object.entries(saved.lfoConfigs)) {
        const storedRateRaw = clampMidi(config.rateRaw ?? 40);
        const rateRaw = storedRateRaw === 39 ? 40 : storedRateRaw;
        const depthRaw = clampMidi(config.depthRaw ?? 38);
        lfoConfigs[key] = {
          rateRaw,
          depthRaw,
          rate: rateFromRaw(rateRaw),
          depth: depthRaw / 127,
          waveform: ["sine", "triangle", "square", "saw"].includes(config.waveform) ? config.waveform : "sine",
          mode: ["bipolar", "positive", "negative"].includes(config.mode) ? config.mode : "bipolar",
          paused: false
        };
      }
    }
    if (!Array.isArray(saved.channels)) return;
    for (const savedChannel of saved.channels) {
      const channel = channels.find(item => item.number === Number(savedChannel.number));
      if (!channel) continue;
      channel.level = clampMidi(savedChannel.level);
      channel.muted = Boolean(savedChannel.muted);
      channel.routeActive = Boolean(savedChannel.routeActive);
      for (const key of Object.keys(LAYERS)) {
        if (savedChannel.values && savedChannel.values[key] !== undefined) channel.values[key] = clampMidi(savedChannel.values[key]);
      }
    }
  } catch {
    localStorage.removeItem(MIXER_STORAGE_KEY);
  }
}

function logMidiEvent({ direction, data, message, timestamp }) {
  const hex = data.map(byte => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  appendLog(`${timestamp.toLocaleTimeString()} ${direction.toUpperCase()} ${message || hex}`);
}

function appendLog(line) {
  midiLogs.unshift(line);
  midiLogs.splice(100);
  logElement.textContent = midiLogs.join("\n");
}

function getStrip(number) {
  return document.querySelector(`[data-channel="${number}"]`);
}

function lfoKey(channel, layer) {
  return `${channel}:${layer}`;
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

if (isIOSDevice() && !midi.supported) {
  setConnectionError(new Error("Web MIDI is unavailable in this iOS browser"));
  openIOSMidiCompatibilityDialog();
} else {
  connectMidi();
}

if (navigator.permissions?.query) {
  navigator.permissions.query({ name: "microphone" }).then(permission => {
    if (permission.state === "granted") connectAudio(true);
  }).catch(() => {});
}

navigator.mediaDevices?.addEventListener?.("devicechange", () => refreshAudioDevices().catch(() => {}));
window.addEventListener("pagehide", persistMixerState);
