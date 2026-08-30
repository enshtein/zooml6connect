import CoreMIDI
import WebKit

final class CoreMIDIBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var outputPort = MIDIPortRef()
    private var selectedSource = MIDIEndpointRef()
    private var selectedDestination = MIDIEndpointRef()

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        MIDIClientCreateWithBlock("ZOOM L6 Connect" as CFString, &client) { [weak self] _ in
            DispatchQueue.main.async { self?.publishPorts() }
        }
        MIDIInputPortCreateWithBlock(client, "ZOOM L6 Input" as CFString, &inputPort) { [weak self] packetList, _ in
            self?.receive(packetList: packetList)
        }
        MIDIOutputPortCreate(client, "ZOOM L6 Output" as CFString, &outputPort)
    }

    deinit {
        if selectedSource != 0 { MIDIPortDisconnectSource(inputPort, selectedSource) }
        MIDIPortDispose(inputPort)
        MIDIPortDispose(outputPort)
        MIDIClientDispose(client)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let command = body["command"] as? String else { return }
        switch command {
        case "initialize":
            publishPorts()
        case "selectPorts":
            select(inputId: body["inputId"] as? String, outputId: body["outputId"] as? String)
        case "send":
            if let values = body["data"] as? [Int] { send(values.map { UInt8(clamping: $0) }) }
        case "disconnect":
            disconnect()
        default:
            emit(["type": "log", "message": "Unknown native MIDI command: \(command)"])
        }
    }

    private func select(inputId: String?, outputId: String?) {
        if selectedSource != 0 { MIDIPortDisconnectSource(inputPort, selectedSource) }
        selectedSource = endpoint(id: inputId, sources: true)
        selectedDestination = endpoint(id: outputId, sources: false)
        if selectedSource != 0 { MIDIPortConnectSource(inputPort, selectedSource, nil) }
        publishPorts()
    }

    private func disconnect() {
        if selectedSource != 0 { MIDIPortDisconnectSource(inputPort, selectedSource) }
        selectedSource = 0
        selectedDestination = 0
        publishPorts()
    }

    private func send(_ data: [UInt8]) {
        guard selectedDestination != 0, !data.isEmpty else { return }
        var packetList = MIDIPacketList()
        let packet = MIDIPacketListInit(&packetList)
        data.withUnsafeBufferPointer { buffer in
            _ = MIDIPacketListAdd(&packetList, MemoryLayout<MIDIPacketList>.size, packet, 0, data.count, buffer.baseAddress!)
        }
        MIDISend(outputPort, selectedDestination, &packetList)
    }

    private func receive(packetList: UnsafePointer<MIDIPacketList>) {
        var packet = packetList.pointee.packet
        for _ in 0..<packetList.pointee.numPackets {
            let bytes = withUnsafeBytes(of: packet.data) { rawBuffer in
                Array(rawBuffer.prefix(Int(packet.length)))
            }
            emit(["type": "message", "data": bytes])
            packet = MIDIPacketNext(&packet).pointee
        }
    }

    private func publishPorts() {
        let inputs = endpoints(sources: true)
        let outputs = endpoints(sources: false)
        emit([
            "type": "ports",
            "inputs": inputs,
            "outputs": outputs,
            "selectedInputId": selectedSource == 0 ? "" : String(MIDIGetUniqueID(selectedSource)),
            "selectedOutputId": selectedDestination == 0 ? "" : String(MIDIGetUniqueID(selectedDestination))
        ])
    }

    private func endpoints(sources: Bool) -> [[String: Any]] {
        let count = sources ? MIDIGetNumberOfSources() : MIDIGetNumberOfDestinations()
        return (0..<count).map { index in
            let endpoint = sources ? MIDIGetSource(index) : MIDIGetDestination(index)
            return ["id": String(MIDIGetUniqueID(endpoint)), "name": endpointName(endpoint), "state": "connected"]
        }
    }

    private func endpoint(id: String?, sources: Bool) -> MIDIEndpointRef {
        guard let id, let uniqueId = MIDIUniqueID(id) else { return 0 }
        let count = sources ? MIDIGetNumberOfSources() : MIDIGetNumberOfDestinations()
        for index in 0..<count {
            let candidate = sources ? MIDIGetSource(index) : MIDIGetDestination(index)
            if MIDIGetUniqueID(candidate) == uniqueId { return candidate }
        }
        return 0
    }

    private func endpointName(_ endpoint: MIDIEndpointRef) -> String {
        var value: Unmanaged<CFString>?
        MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &value)
        guard let value else { return "MIDI endpoint" }
        return value.takeRetainedValue() as String
    }

    private func emit(_ payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('zoom-midi-native',{detail:\(json)}))")
        }
    }
}

private func MIDIGetUniqueID(_ object: MIDIObjectRef) -> MIDIUniqueID {
    var value = MIDIUniqueID()
    MIDIObjectGetIntegerProperty(object, kMIDIPropertyUniqueID, &value)
    return value
}
