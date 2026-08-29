# Zoom L6 Connect

## Project goal

Build a touch-first PWA for controlling a ZOOM LiveTrak L6 from an iPad connected to the mixer by a USB data cable. The application is a custom tablet mixer UI inspired functionally by the open-source Zoom L6 Companion, but it must have its own interface and architecture.

The primary target is iPad/iOS in landscape orientation. The same web application should remain usable in supported desktop and tablet browsers for development, diagnostics, and fallback operation.

## Device communication

- Use the Web MIDI API for bidirectional communication with the ZOOM L6 over USB.
- Send MIDI Control Change messages for knobs, toggles, channel parameters, and LFO-modulated values.
- Receive MIDI Control Change messages so physical changes on the L6 are reflected in application state and UI.
- Support MIDI Note On/Off for the four sound pads and Program Change for scenes where required.
- Keep SysEx support isolated and optional. Request SysEx permission only for features that need it; ordinary mixer control must not depend on SysEx.
- Prefer the port whose name contains `Mixer Control`. Do not confuse it with the ordinary MIDI I/O port or the editor-only port.
- Treat MIDI input and MIDI output as separate connections. Either side can disconnect or reconnect independently.
- Keep all parameter-to-CC assignments in a declarative mapping layer. Do not hard-code MIDI numbers inside visual components.
- Clamp outgoing MIDI data to the valid 7-bit range, `0..127`.
- Avoid feedback loops when an incoming MIDI event updates UI state: receiving a value must not immediately echo the same value back unless explicitly required.
- Provide connection status, manual port selection, auto-connect, reconnect handling, and a MIDI diagnostic log.

## LFO behavior

- LFOs modulate mixer parameters by generating and sending MIDI CC values through the same MIDI adapter as manual controls.
- Keep LFO state separate from base/manual parameter values.
- Initial waveform support should include sine, triangle, square, and saw.
- Initial direction modes should include bipolar, positive, and negative modulation.
- LFO rate, depth, enable/disable, pause/resume, and global pause/resume must be represented explicitly in state.
- Throttle or schedule MIDI output deliberately so LFOs do not flood the USB MIDI connection or degrade touch/UI responsiveness.
- Stopping an LFO must leave the controlled parameter in a predictable state.

## Audio analysis

- Use the Web Audio API to capture audio exposed by the connected ZOOM L6 USB audio interface.
- Audio input is for analysis and visualization, including VU/level meters and later spectrum or clipping indicators; MIDI remains the control protocol.
- Keep audio capture and MIDI control as independent subsystems because either permission or connection can succeed while the other fails.
- Discover and display the audio devices and channel layout actually exposed by iOS/browser instead of assuming that every L6 USB channel is available.
- Do not route, record, upload, or persist audio unless a feature explicitly requires it and the user has granted permission.
- Handle suspended `AudioContext`, device changes, permission denial, channel-count differences, and loss of the USB device.

## iOS and PWA constraints

- The deliverable is an installable PWA with a web app manifest, service worker, standalone display mode, offline application shell, safe-area handling, and touch-first controls.
- Do not assume that Safari on iOS exposes the Web MIDI API. The current web platform may require a WebMIDI-capable iOS browser, a WebMIDI-to-CoreMIDI bridge, or a thin native `WKWebView`/CoreMIDI wrapper.
- Keep platform access behind adapters so the mixer UI and state model do not depend directly on `navigator.requestMIDIAccess()`.
- Likewise, isolate Web Audio device acquisition behind an audio adapter because iOS permission and USB audio behavior can vary by browser and OS version.
- Feature-detect Web MIDI, SysEx, media-device capture, AudioContext state, and PWA capabilities. Show actionable compatibility messages instead of failing silently.
- User gestures may be required to request MIDI/audio permissions and resume audio. Preserve those explicit interaction points in the UI.
- Validate the final connection flow on a real iPad and physical ZOOM LiveTrak L6; desktop emulation is not sufficient.

## Architecture

Keep these concerns separate:

1. Mixer domain state and parameter definitions.
2. MIDI transport, port discovery, message encoding, and incoming-message decoding.
3. LFO scheduling and modulation.
4. USB audio acquisition and Web Audio analysis.
5. PWA lifecycle, permissions, compatibility, and install behavior.
6. Touch-first presentation components.

UI components should read and update mixer state through application services/stores rather than call browser MIDI or audio APIs directly. The application must continue to render in a useful disconnected/demo state when no L6 is attached.

## Reference bundle analysis

The downloaded reference bundle at `/Users/leonid/Downloads/index-K0M96K9M.js` is a minified Vue 3 application using WebMidi.js 3.1.13. It is reference material, not project source and not a runtime dependency.

Useful confirmed patterns in that bundle:

- Web MIDI initialization requests SysEx access and handles permission failure.
- MIDI input and output are enumerated and selected independently.
- Auto-connect prefers Zoom-like device names and a `Mixer Control` match.
- It sends and receives Control Change, Note On/Off, Program Change, and SysEx messages.
- It has reconnect/hot-plug handling and separates connection state for input and output.
- Mixer parameter mappings are data objects with name, CC number, MIDI channel, min/max/default value, and control type.
- Physical incoming CC values update controls bidirectionally.
- Sound pads use Note On on press and Note Off on release.
- Scenes use Program Change.
- Per-control LFOs are scheduled with `requestAnimationFrame`; the reference supports sine, triangle, square, saw, bipolar, positive, and negative modes.
- Custom MIDI mappings are persisted in browser storage and checked for duplicate CC/note assignments.
- The bundle also contains L6Max support and optional editor-port SysEx features; do not let those expand the initial L6 scope unintentionally.

Do not copy the minified bundle wholesale. Reimplement only understood behavior in maintainable, typed modules, and verify mappings and device behavior against the physical L6 and official documentation.

## Sources of truth

Use the following source hierarchy when requirements or observed behavior conflict:

1. The physical ZOOM LiveTrak L6 connected to the target iPad, with reproducible MIDI/audio captures.
2. The official ZOOM L6 Operation Manual: <https://zoomcorp.com/manuals/l6-en/>.
3. The official ZOOM L6 Editor and the settings/CC mapping currently stored on the physical mixer.
4. Current Apple/browser documentation and feature detection for iOS PWA, Web MIDI, media capture, and Web Audio behavior.
5. The open-source Zoom L6 Companion repository and downloaded production bundle as implementation references.
6. Community posts and videos as leads only; verify their claims against a higher-priority source or hardware test.

The online manual states that its contents and product specifications can change without notice. When implementing protocol-sensitive behavior, record the access date, L6 firmware version, iPadOS version, browser/wrapper version, cable/adapter, selected MIDI ports, and relevant L6 Editor settings.

Do not infer undocumented protocol guarantees from the minified reference bundle. In particular, the official MIDI implementation chart marks System Exclusive as unsupported on the standard L6 MIDI interface, while the bundle contains optional editor-port SysEx behavior. Treat editor-port SysEx as undocumented and experimental until it is independently verified on the target device; never make core mixer control depend on it.

## Official L6 facts relevant to this project

- Connect computers, smartphones, and tablets to the top USB Type-C port using a cable that supports data transfer.
- When using a smartphone or tablet, ZOOM recommends supplying the L6 from an AC adapter. Do not assume the iPad can reliably power the mixer while also maintaining MIDI and multichannel audio.
- The L6 exposes three distinct USB MIDI ports:
  - `L6 MIDI I/O Port` routes the physical MIDI IN/OUT jacks and is not the mixer-control target.
  - `L6 Mixer Control Port` controls L6 parameters, triggers sound pads, and receives effect-delay MIDI clock. This is the application's primary port.
  - `for L6 Editor Port` is reserved for the official editor and must not be used for normal mixer control.
- The L6 MIDI channel is configurable from channel 1 through channel 16. Never assume channel 1 without either configuration knowledge, discovery, or user selection.
- MIDI CC assignments are configurable in the official L6 Editor and can be set to `Not Mapped`. The app's defaults are only defaults; runtime configuration may differ.
- Officially mappable controls include per-channel EQ high/mid/mid-frequency/low, AUX 1/2 send, EFX send, pan, level, mute, channel 3/4 MONO x2, channel 5/6 USB input selection, EFX type, and compressor.
- The MIDI implementation chart documents Control Change reception/transmission for CC 1–31, 33–95, and 102–119; avoid reserved/unsupported ranges unless hardware testing proves a specific use.
- Scene A–C selection uses Program Change numbers 0–2.
- Sound pads use MIDI note numbers in the 0–127 range and their assignments are configurable.
- The L6 recognizes MIDI Clock for synchronizing supported delay behavior.
- As a USB audio interface, the L6 operates at 48 kHz and exposes up to 12 input channels and 4 output channels at 32-bit float or 24-bit on supported hosts. Browser/iOS exposure may be more limited, so discover the actual stream rather than assuming all channels.
- The two mono input channels are channels 1–2. Channels 3–4 are stereo or dual-mono, and channels 5–6 are stereo; this channel topology should inform labels, meters, and layout.
- EQ ranges documented by ZOOM are high 10 kHz shelving at ±15 dB, mid 100 Hz–8 kHz peaking at ±15 dB, and low 100 Hz shelving at ±15 dB. Convert raw MIDI `0..127` to display values using verified device curves rather than assuming a linear engineering-unit mapping.

## Product priorities

- Reliable USB connection and honest compatibility reporting come before visual polish.
- Optimize controls for iPad touch targets, landscape layout, and live-performance use.
- Make current numeric values and connection state immediately legible.
- Prevent accidental destructive or abrupt changes during performance.
- Do not add server requirements for core mixer control or audio metering; core operation should remain local to the device and browser/wrapper.
