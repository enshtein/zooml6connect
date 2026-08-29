# ZOOM L6 Connect

Touch-first PWA interface for bidirectional USB MIDI control and USB audio analysis of the ZOOM LiveTrak L6 on iPad.

## Local preview

```bash
npm run dev
```

Open <http://127.0.0.1:4173/>.

## Installable PWA

The current `master` branch is deployed through GitHub Pages at <https://enshtein.github.io/zooml6connect/>. On supported desktop browsers use **Install app**; on iPad use Safari's **Add to Home Screen** and enable **Open as Web App**.

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
