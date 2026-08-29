import { clampMidi } from "./midi-mappings.js";

export class MidiService extends EventTarget {
  access = null;
  input = null;
  output = null;
  channel = 1;

  get supported() {
    return typeof navigator.requestMIDIAccess === "function";
  }

  get connected() {
    return this.input?.state === "connected" && this.output?.state === "connected";
  }

  async initialize() {
    if (!this.supported) throw new Error("Web MIDI API is not available in this browser");
    if (!this.access) {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = event => this.#handleStateChange(event);
    }
    this.dispatchEvent(new Event("ports"));
    return this.access;
  }

  get initialized() {
    return this.access !== null;
  }

  getInputs() {
    return this.access ? [...this.access.inputs.values()] : [];
  }

  getOutputs() {
    return this.access ? [...this.access.outputs.values()] : [];
  }

  async autoConnect() {
    await this.initialize();
    const input = this.#bestPort(this.getInputs());
    const output = this.#bestPort(this.getOutputs());
    this.selectPorts(input?.id, output?.id);
    if (!this.connected) throw new Error("L6 Mixer Control input/output ports were not found");
    return true;
  }

  selectPorts(inputId, outputId) {
    this.#detachInput();
    this.input = this.getInputs().find(port => port.id === inputId) || null;
    this.output = this.getOutputs().find(port => port.id === outputId) || null;
    if (this.input) this.input.onmidimessage = event => this.#handleMessage(event);
    this.#emitConnection();
  }

  sendControlChange(cc, value, channel = this.channel) {
    if (!this.output) return false;
    const data = [0xb0 | ((channel - 1) & 0x0f), clampMidi(cc), clampMidi(value)];
    this.output.send(data);
    this.#log("out", data);
    return true;
  }

  sendProgramChange(program, channel = this.channel) {
    if (!this.output) return false;
    const data = [0xc0 | ((channel - 1) & 0x0f), clampMidi(program)];
    this.output.send(data);
    this.#log("out", data);
    return true;
  }

  disconnect() {
    this.#detachInput();
    this.input = null;
    this.output = null;
    this.#emitConnection();
  }

  #bestPort(ports) {
    return ports
      .filter(port => port.state !== "disconnected")
      .map(port => ({ port, score: this.#scorePort(port.name) }))
      .filter(candidate => candidate.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.port || null;
  }

  #scorePort(name = "") {
    const value = name.toLowerCase();
    if (value.includes("editor")) return -1000;
    let score = 0;
    if (value.includes("mixer control")) score += 200;
    if (value.includes("midiin2") || value.includes("midiout2")) score += 150;
    if (value.includes("zoom")) score += 40;
    if (value.includes("l6") || value.includes("l-6") || value.includes("livetrak")) score += 40;
    if (value.includes("midi i/o")) score -= 100;
    return score;
  }

  #handleMessage(event) {
    const data = [...event.data];
    const type = data[0] & 0xf0;
    const channel = (data[0] & 0x0f) + 1;
    this.#log("in", data);
    if (type === 0xb0 && data.length >= 3) {
      this.dispatchEvent(new CustomEvent("controlchange", { detail: { channel, cc: data[1], value: data[2] } }));
    } else if (type === 0xc0 && data.length >= 2) {
      this.dispatchEvent(new CustomEvent("programchange", { detail: { channel, program: data[1] } }));
    }
  }

  #handleStateChange(event) {
    this.#log("state", [], `${event.port?.name || "MIDI port"}: ${event.port?.state || "changed"}`);
    if (this.input?.state === "disconnected" || this.output?.state === "disconnected") {
      const inputName = this.input?.name;
      const outputName = this.output?.name;
      const input = this.getInputs().find(port => port.name === inputName && port.state === "connected");
      const output = this.getOutputs().find(port => port.name === outputName && port.state === "connected");
      this.selectPorts(input?.id, output?.id);
    } else if (!this.connected && event.port?.state === "connected") {
      const input = this.#bestPort(this.getInputs());
      const output = this.#bestPort(this.getOutputs());
      this.selectPorts(input?.id, output?.id);
    }
    this.dispatchEvent(new Event("ports"));
    this.#emitConnection();
  }

  #detachInput() {
    if (this.input) this.input.onmidimessage = null;
  }

  #emitConnection() {
    this.dispatchEvent(new CustomEvent("connectionchange", {
      detail: {
        connected: this.connected,
        inputName: this.input?.name || "",
        outputName: this.output?.name || ""
      }
    }));
  }

  #log(direction, data, message = "") {
    this.dispatchEvent(new CustomEvent("log", {
      detail: { direction, data, message, timestamp: new Date() }
    }));
  }
}
