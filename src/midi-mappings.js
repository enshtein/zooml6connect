export const MIDI_CHANNEL = 1;

const channelCcs = [
  { level: 83, pan: 73, high: 1, mid: 21, midfreq: 11, low: 33, aux1: 43, aux2: 53, efx: 63, mute: 93 },
  { level: 84, pan: 74, high: 2, mid: 22, midfreq: 12, low: 34, aux1: 44, aux2: 54, efx: 64, mute: 94 },
  { level: 85, pan: 75, high: 3, mid: 23, midfreq: 13, low: 35, aux1: 45, aux2: 55, efx: 65, mute: 95, route: 109 },
  { level: 86, pan: 76, high: 4, mid: 24, midfreq: 14, low: 36, aux1: 46, aux2: 56, efx: 66, mute: 102, route: 110 },
  { level: 87, pan: 77, high: 5, mid: 25, midfreq: 15, low: 37, aux1: 47, aux2: 57, efx: 67, mute: 103, route: 113 },
  { level: 88, pan: 78, high: 6, mid: 26, midfreq: 16, low: 38, aux1: 48, aux2: 58, efx: 68, mute: 104, route: 114 }
];

export const LAYERS = {
  high: { label: "EQ HIGH", defaultValue: 64 },
  midfreq: { label: "MID FREQ", defaultValue: 64 },
  mid: { label: "EQ MID", defaultValue: 64 },
  low: { label: "EQ LOW", defaultValue: 64 },
  aux1: { label: "AUX 1", defaultValue: 0 },
  aux2: { label: "AUX 2", defaultValue: 0 },
  efx: { label: "EFX SEND", defaultValue: 0 },
  pan: { label: "PAN", defaultValue: 64 }
};

export const CHANNEL_MAPPINGS = channelCcs.map((cc, index) => ({
  number: index + 1,
  kind: index < 2 ? "MONO" : "STEREO",
  routeLabel: index < 2 ? "48V" : index < 4 ? "MONO ×2" : index === 4 ? "USB 1/2" : "USB 3/4",
  routeMidiSupported: index >= 2,
  cc
}));

export const GLOBAL_MAPPINGS = {
  effectType: 117,
  compressor: 119
};

export const SCENES = [
  { id: "A", program: 0 },
  { id: "B", program: 1 },
  { id: "C", program: 2 }
];

export function clampMidi(value) {
  return Math.max(0, Math.min(127, Math.round(Number(value) || 0)));
}

