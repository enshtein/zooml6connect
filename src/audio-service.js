export class AudioService extends EventTarget {
  stream = null;
  context = null;
  source = null;
  splitter = null;
  analysers = [];
  animationFrame = 0;
  deviceId = "";

  get supported() {
    return Boolean(navigator.mediaDevices?.getUserMedia && (globalThis.AudioContext || globalThis.webkitAudioContext));
  }

  get connected() {
    return Boolean(this.stream?.active && this.context && this.context.state !== "closed");
  }

  async getDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audioinput");
  }

  async autoConnect() {
    const devices = await this.getDevices();
    const preferred = this.#preferredDevice(devices);
    let connection = await this.connect(preferred?.deviceId || "");
    const revealedPreferred = this.#preferredDevice(await this.getDevices());
    if (revealedPreferred && revealedPreferred.deviceId !== connection.deviceId) {
      connection = await this.connect(revealedPreferred.deviceId);
    }
    return connection;
  }

  async connect(deviceId = "") {
    if (!this.supported) throw new Error("Web Audio input is not available in this browser");
    await this.disconnect();

    const audio = {
      channelCount: { ideal: 12 },
      sampleRate: { ideal: 48000 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
    if (deviceId) audio.deviceId = { exact: deviceId };

    this.stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    const track = this.stream.getAudioTracks()[0];
    track.addEventListener("ended", () => this.disconnect());

    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    this.context = new AudioContextClass({ sampleRate: 48000, latencyHint: "interactive" });
    if (this.context.state === "suspended") await this.context.resume();
    this.source = this.context.createMediaStreamSource(this.stream);

    const settings = track.getSettings();
    const channelCount = Math.max(1, Math.min(32, settings.channelCount || this.source.channelCount || 1));
    this.deviceId = settings.deviceId || deviceId;
    this.splitter = this.context.createChannelSplitter(channelCount);
    this.source.connect(this.splitter);
    this.analysers = Array.from({ length: channelCount }, (_, channel) => {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      this.splitter.connect(analyser, channel);
      return { analyser, buffer: new Float32Array(analyser.fftSize) };
    });

    this.#emitConnection(true, track.label, channelCount, settings.sampleRate || this.context.sampleRate);
    this.#meterLoop();
    return { deviceId: this.deviceId, label: track.label, channelCount, sampleRate: settings.sampleRate || this.context.sampleRate };
  }

  async disconnect() {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.source = null;
    this.splitter = null;
    this.analysers = [];
    this.deviceId = "";
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.context = null;
    this.#emitConnection(false, "", 0, 0);
    this.dispatchEvent(new CustomEvent("levels", { detail: [] }));
  }

  #preferredDevice(devices) {
    return devices.find(device => /zoom/i.test(device.label))
      || devices.find(device => /\bl-?6\b|livetrak/i.test(device.label))
      || null;
  }

  #meterLoop = () => {
    if (!this.connected) return;
    const levels = this.analysers.map(({ analyser, buffer }) => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) sum += sample * sample;
      const rms = Math.sqrt(sum / buffer.length);
      const decibels = rms > 0 ? 20 * Math.log10(rms) : -60;
      return Math.max(0, Math.min(1, (decibels + 60) / 60));
    });
    this.dispatchEvent(new CustomEvent("levels", { detail: levels }));
    this.animationFrame = requestAnimationFrame(this.#meterLoop);
  };

  #emitConnection(connected, label, channelCount, sampleRate) {
    this.dispatchEvent(new CustomEvent("connectionchange", {
      detail: { connected, label, channelCount, sampleRate, deviceId: this.deviceId }
    }));
  }
}
