# iPad app

The Xcode project wraps the existing PWA UI in `WKWebView` and replaces Web MIDI with a native CoreMIDI bridge. The web files remain the source of truth and are copied into the app bundle during every Xcode build.

## Run on a personal iPad without a paid membership

1. Install a current Xcode release on the Mac and open `ZoomL6Connect.xcodeproj`.
2. Select the **ZoomL6Connect** target, open **Signing & Capabilities**, and choose your Apple Account's **Personal Team**.
3. If Xcode reports that the bundle identifier is unavailable, replace `com.enshtein.zooml6connect` with a unique identifier such as `com.yourname.zooml6connect`.
4. Connect and trust the iPad, enable Developer Mode if iPadOS asks, and select the iPad as the run destination.
5. Press **Run**. The app is landscape-only and targets iPadOS 16 or newer.
6. Connect the ZOOM L6 using its top USB-C data port, then tap **MIDI** and **AUTO CONNECT L6**. Verify that both selected endpoints contain `Mixer Control` and do not contain `Editor` or `MIDI I/O`.

No Apple Developer Program subscription is required for this personal-device Xcode workflow. Free provisioning must be refreshed periodically.

## Architecture

- `MixerViewController.swift` serves the bundled PWA through the private `zooml6://` scheme.
- The native web view is constrained to the iPad safe area, so mixer controls stay below the status bar and above the Home indicator.
- The eye/AWAKE toggle disables the iOS idle timer while active, keeping the display on during a mixing session. Turn it off when it is no longer needed to conserve battery.
- `CoreMIDIBridge.swift` owns CoreMIDI discovery, hot-plug notifications, input, and output.
- `NativeAudioBridge.swift` captures the current USB audio route with `AVAudioSession`/`AVAudioEngine`, calculates per-channel levels locally, and sends only meter values to the web UI.
- `src/midi-service.js` detects the native message handler and otherwise continues to use Web MIDI in ordinary browsers.
- `.github/workflows/pages.yml` is unchanged; the public PWA remains deployed from `master` to GitHub Pages.

## Test multichannel L6 audio

1. Build and install the latest app from Xcode, then stop it and disconnect the iPad from the Mac.
2. Power the L6 from its AC adapter and connect its top USB-C port directly to the iPad with a data-capable cable.
3. Ensure the L6 is exposing its fixed Multi Track USB audio mode before opening the app.
4. Open **ZOOM L6 Connect**, tap **AUDIO**, allow microphone access, then tap **AUTO ZOOM**.
5. Read the diagnostic line. The expected result is `12 channels · 48000 Hz · iOS max 12, session 12, engine 12`.
6. Feed signal into each L6 input and verify the corresponding meter independently. The hardware-verified USB capture order is: USB 1–2 = MASTER L/R, USB 3 = mixer CH1, USB 4 = mixer CH2, USB 5–6 = mixer CH3 L/R, USB 7–8 = mixer CH4 L/R, USB 9–10 = mixer CH5 L/R, and USB 11–12 = mixer CH6 L/R.

If `iOS max` is only 1 or 2, iPadOS did not expose the L6 multichannel route and software cannot request 12 channels from that route. Recheck the L6 USB mode, power, cable, and reconnect order. If `iOS max` is 12 but `engine` is lower, capture the diagnostic line and the Xcode console output for investigation.
