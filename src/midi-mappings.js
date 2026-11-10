export const MIDI_CHANNEL = 1;
export const IS_L6MAX = document.documentElement.dataset.mixerModel === "l6max" || /l6max\.html$/i.test(location.pathname);

const channelCcs = [
  { level: 83, pan: 73, high: 1, mid: 21, midfreq: 11, low: 33, aux1: 43, aux2: 53, efx: 63, mute: 93 },
  { level: 84, pan: 74, high: 2, mid: 22, midfreq: 12, low: 34, aux1: 44, aux2: 54, efx: 64, mute: 94 },
  { level: 85, pan: 75, high: 3, mid: 23, midfreq: 13, low: 35, aux1: 45, aux2: 55, efx: 65, mute: 95, route: 109 },
  { level: 86, pan: 76, high: 4, mid: 24, midfreq: 14, low: 36, aux1: 46, aux2: 56, efx: 66, mute: 102, route: 110 },
  { level: 87, pan: 77, high: 5, mid: 25, midfreq: 15, low: 37, aux1: 47, aux2: 57, efx: 67, mute: 103, route: 113 },
  { level: 88, pan: 78, high: 6, mid: 26, midfreq: 16, low: 38, aux1: 48, aux2: 58, efx: 68, mute: 104, route: 114 }
];

// L6max exposes controllable channel parameters for CH 1–8. MIDI assignments
// remain configurable on the hardware; verify these defaults against the
// connected mixer's L6 Editor configuration.
const l6maxChannelCcs = [
  { level: 81, pan: 73, high: 1, mid: 21, midfreq: 11, low: 33, submix: 41, aux1: 49, aux2: 57, efx: 65, mute: 93 },
  { level: 82, pan: 74, high: 2, mid: 22, midfreq: 12, low: 34, submix: 42, aux1: 50, aux2: 58, efx: 66, mute: 94 },
  { level: 83, pan: 75, high: 3, mid: 23, midfreq: 13, low: 35, submix: 43, aux1: 51, aux2: 59, efx: 67, mute: 95 },
  { level: 84, pan: 76, high: 4, mid: 24, midfreq: 14, low: 36, submix: 44, aux1: 52, aux2: 60, efx: 68, mute: 102 },
  { level: 85, pan: 77, high: 5, mid: 25, midfreq: 15, low: 37, submix: 45, aux1: 53, aux2: 61, efx: 69, mute: 103, route: 109 },
  { level: 86, pan: 78, high: 6, mid: 26, midfreq: 16, low: 38, submix: 46, aux1: 54, aux2: 62, efx: 70, mute: 104, route: 110 },
  { level: 87, pan: 79, high: 7, mid: 27, midfreq: 17, low: 39, submix: 47, aux1: 55, aux2: 63, efx: 71, mute: 105, route: 113 },
  { level: 88, pan: 80, high: 8, mid: 28, midfreq: 18, low: 40, submix: 48, aux1: 56, aux2: 64, efx: 72, mute: 106, route: 114 }
];

export const LAYERS = {
  high: { label: "EQ HIGH", defaultValue: 64 },
  midfreq: { label: "MID FREQ", defaultValue: 64 },
  mid: { label: "EQ MID", defaultValue: 64 },
  low: { label: "EQ LOW", defaultValue: 64 },
  submix: { label: "SUB MIX", defaultValue: 0 },
  aux1: { label: "AUX 1", defaultValue: 0 },
  aux2: { label: "AUX 2", defaultValue: 0 },
  efx: { label: "EFX SEND", defaultValue: 0 },
  pan: { label: "PAN", defaultValue: 64 }
};

const activeChannelCcs = IS_L6MAX ? l6maxChannelCcs : channelCcs;

export const CHANNEL_MAPPINGS = activeChannelCcs.map((cc, index) => ({
  number: index + 1,
  kind: IS_L6MAX ? (index < 4 ? "MONO" : "STEREO") : (index < 2 ? "MONO" : "STEREO"),
  routeLabel: IS_L6MAX
    ? (index < 4 ? "" : index < 6 ? "MONO ×2" : index === 6 ? "USB 1/2" : "USB 3/4")
    : (index < 2 ? "48V" : index < 4 ? "MONO ×2" : index === 4 ? "USB 1/2" : "USB 3/4"),
  routeMidiSupported: IS_L6MAX ? index >= 4 : index >= 2,
  cc
}));

export const GLOBAL_MAPPINGS = {
  effectType: 117,
  compressor: 119
};

export const SCENES = [
  { id: "A", program: 0, midiSupported: true },
  { id: "B", program: 1, midiSupported: true },
  { id: "C", program: 2, midiSupported: true },
  // D exists on the hardware, but the official MIDI implementation only
  // documents Program Change 0–2. Keep it visible without sending a command.
  ...(IS_L6MAX ? [{ id: "D", program: 3, midiSupported: false }] : [])
];

export function clampMidi(value) {
  return Math.max(0, Math.min(127, Math.round(Number(value) || 0)));
}
