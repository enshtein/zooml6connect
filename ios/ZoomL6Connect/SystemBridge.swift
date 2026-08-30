import UIKit
import WebKit

final class SystemBridge: NSObject, WKScriptMessageHandler {
    deinit {
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let keepAwake = body["keepAwake"] as? Bool else { return }
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = keepAwake
        }
    }
}
