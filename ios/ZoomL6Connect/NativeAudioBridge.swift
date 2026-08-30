import AVFAudio
import WebKit

final class NativeAudioBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private let session = AVAudioSession.sharedInstance()
    private var engine: AVAudioEngine?
    private var selectedDeviceId = ""
    private var lastMeterUpdate: AVAudioTime?

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
    }

    deinit {
        stopAudio()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let command = body["command"] as? String,
              let requestId = body["requestId"] as? String else { return }

        switch command {
        case "getDevices":
            respond(requestId, result: ["devices": availableDevices()])
        case "connect":
            requestPermissionAndConnect(requestId: requestId, deviceId: body["deviceId"] as? String ?? "")
        case "disconnect":
            disconnect()
            respond(requestId, result: [:])
        default:
            respond(requestId, error: "Unknown native audio command: \(command)")
        }
    }

    private func requestPermissionAndConnect(requestId: String, deviceId: String) {
        session.requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                guard let self else { return }
                guard granted else {
                    self.respond(requestId, error: "Microphone/USB audio permission was denied in iPad Settings")
                    return
                }
                do {
                    let result = try self.connect(deviceId: deviceId)
                    self.respond(requestId, result: result)
                } catch {
                    self.disconnect()
                    self.respond(requestId, error: error.localizedDescription)
                }
            }
        }
    }

    private func connect(deviceId: String) throws -> [String: Any] {
        stopAudio()

        try session.setCategory(.record, mode: .measurement, options: [])
        try session.setPreferredSampleRate(48_000)
        try session.setPreferredIOBufferDuration(0.01)
        try session.setActive(true)

        let requestedInput = session.availableInputs?.first(where: { $0.uid == deviceId })
            ?? preferredInput(from: session.availableInputs ?? [])
        if let requestedInput {
            try session.setPreferredInput(requestedInput)
            selectedDeviceId = requestedInput.uid
        } else {
            selectedDeviceId = session.currentRoute.inputs.first?.uid ?? ""
        }

        let maximumChannels = session.maximumInputNumberOfChannels
        if maximumChannels > 0 {
            try session.setPreferredInputNumberOfChannels(min(12, maximumChannels))
        }

        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.inputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw NativeAudioError.inputUnavailable
        }

        input.installTap(onBus: 0, bufferSize: 1024, format: nil) { [weak self] buffer, time in
            self?.process(buffer: buffer, time: time)
        }
        engine.prepare()
        try engine.start()
        self.engine = engine

        let routeName = session.currentRoute.inputs.first?.portName ?? requestedInput?.portName ?? "USB audio input"
        let result: [String: Any] = [
            "deviceId": selectedDeviceId,
            "label": routeName,
            "channelCount": Int(format.channelCount),
            "sampleRate": Int(format.sampleRate),
            "maximumChannelCount": maximumChannels,
            "sessionChannelCount": session.inputNumberOfChannels
        ]
        emit([
            "type": "connection",
            "connected": true,
            "deviceId": selectedDeviceId,
            "label": routeName,
            "channelCount": Int(format.channelCount),
            "sampleRate": Int(format.sampleRate),
            "maximumChannelCount": maximumChannels,
            "sessionChannelCount": session.inputNumberOfChannels
        ])
        return result
    }

    private func disconnect() {
        stopAudio()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        selectedDeviceId = ""
        emit(["type": "connection", "connected": false, "channelCount": 0, "sampleRate": 0])
        emit(["type": "levels", "levels": []])
    }

    private func stopAudio() {
        guard let engine else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        self.engine = nil
        lastMeterUpdate = nil
    }

    private func process(buffer: AVAudioPCMBuffer, time: AVAudioTime) {
        if let lastMeterUpdate,
           time.sampleTime - lastMeterUpdate.sampleTime < AVAudioFramePosition(buffer.format.sampleRate / 30) {
            return
        }
        lastMeterUpdate = time

        let frameCount = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)
        guard frameCount > 0, channelCount > 0, let channels = buffer.floatChannelData else { return }

        let levels = (0..<channelCount).map { channel -> Double in
            let samples = channels[channel]
            var sum: Float = 0
            for frame in 0..<frameCount {
                let sample = samples[frame]
                sum += sample * sample
            }
            let rms = sqrt(sum / Float(frameCount))
            let decibels = rms > 0 ? 20 * log10(Double(rms)) : -60
            return max(0, min(1, (decibels + 60) / 60))
        }
        emit(["type": "levels", "levels": levels])
    }

    private func availableDevices() -> [[String: Any]] {
        let inputs = session.availableInputs ?? session.currentRoute.inputs
        return inputs.map { input in
            ["deviceId": input.uid, "label": input.portName, "kind": "audioinput"]
        }
    }

    private func preferredInput(from inputs: [AVAudioSessionPortDescription]) -> AVAudioSessionPortDescription? {
        inputs.first(where: { $0.portName.localizedCaseInsensitiveContains("ZOOM") })
            ?? inputs.first(where: { $0.portName.localizedCaseInsensitiveContains("L6") })
            ?? inputs.first(where: { $0.portType == .usbAudio })
            ?? inputs.first
    }

    private func respond(_ requestId: String, result: [String: Any]) {
        emit(["type": "response", "requestId": requestId, "result": result])
    }

    private func respond(_ requestId: String, error: String) {
        emit(["type": "response", "requestId": requestId, "error": error])
    }

    private func emit(_ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('zoom-audio-native',{detail:\(json)}))")
        }
    }
}

private enum NativeAudioError: LocalizedError {
    case inputUnavailable

    var errorDescription: String? {
        switch self {
        case .inputUnavailable:
            return "The selected USB audio input has no active channels"
        }
    }
}
