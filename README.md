# ZOOM L6 Connect

Touch-first PWA interfaces for bidirectional USB MIDI control and USB audio analysis of the ZOOM LiveTrak L6 family on iPad.

## Choose your mixer

- **ZOOM LiveTrak L6:** <https://enshtein.github.io/zooml6connect/>
- **ZOOM LiveTrak L6MAX:** <https://enshtein.github.io/zooml6connect/l6max.html>

Open the version that matches the connected hardware. The L6MAX page includes eight channel strips and its L6MAX-specific MIDI mapping.

## iPadOS MIDI requirement

For USB MIDI control on an iPad, open the app in [MIDIWeb Browser](https://apps.apple.com/us/app/midiweb-browser/id6757226617). Safari, Safari-installed web apps, and ordinary iPad browsers do not expose the Web MIDI API, so mixer control will not work in them. Audio analysis may still be available independently when the browser exposes the USB audio device.

## Local preview

```bash
npm run dev
```

Open <http://127.0.0.1:4173/>.

## Installable PWA

The current `master` branch is deployed through GitHub Pages. On supported desktop browsers use **Install app**. For iPad USB MIDI control, use MIDIWeb Browser rather than Safari or an app installed from Safari.

## Native iPad test app

The optional Xcode wrapper in [`ios/`](ios/) embeds the same web interface and provides native USB MIDI through CoreMIDI. It can be installed on a personal iPad from Xcode with a free Apple Account. Adding it does not change the GitHub Pages deployment or remove the PWA version.

## MIDI integration

The current version includes bidirectional Web MIDI control for the documented L6 Mixer Control mapping:

- EQ, PAN, AUX 1/2, EFX send and channel LEVEL controls
- MUTE, MONO ×2 and USB 1/2–3/4 toggles
- compressor and Scene A–C control
- incoming MIDI synchronization, hot-plug handling and a diagnostic MIDI log
- per-parameter sine LFO output with a throttled MIDI update rate

Tap the connection indicator or open Settings and choose **AUTO CONNECT L6**. The app prefers the port named `L6 Mixer Control Port` and rejects the editor-only port.

Phantom power (`48V`) and the physical MASTER level are not exposed by the documented L6 MIDI mapping, so those UI controls do not send fabricated MIDI commands.

## USB audio metering

The `AUDIO` button opens USB audio input selection. The app requests an unprocessed multichannel stream, prefers devices whose label contains ZOOM/L6, reports the channel count actually exposed by the browser, and drives the channel and master meters with Web Audio RMS analysis. Audio permission and connection are independent from MIDI.

## Local mixer state

Channel values, mute/route states, the active parameter layer, scene selection, and compressor state are persisted locally in the browser and restored after reload. Restoring the UI never sends the saved mix to connected hardware automatically; incoming physical L6 MIDI remains authoritative.
