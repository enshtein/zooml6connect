import UIKit
import WebKit

final class MixerViewController: UIViewController, WKUIDelegate {
    private var webView: WKWebView!
    private var midiBridge: CoreMIDIBridge!
    private var audioBridge: NativeAudioBridge!
    private var systemBridge: SystemBridge!

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: "zooml6")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        webView.uiDelegate = self
        midiBridge = CoreMIDIBridge(webView: webView)
        audioBridge = NativeAudioBridge(webView: webView)
        systemBridge = SystemBridge()
        configuration.userContentController.add(midiBridge, name: "zoomMidi")
        configuration.userContentController.add(audioBridge, name: "zoomAudio")
        configuration.userContentController.add(systemBridge, name: "zoomSystem")

        let container = UIView()
        container.backgroundColor = UIColor(red: 22 / 255, green: 23 / 255, blue: 24 / 255, alpha: 1)
        webView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.safeAreaLayoutGuide.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: container.safeAreaLayoutGuide.bottomAnchor)
        ])
        view = container
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: URL(string: "zooml6://app/index.html")!))
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "zoomMidi")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "zoomAudio")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "zoomSystem")
    }

    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.prompt)
    }
}

private final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }
        var path = url.path
        if path == "/" { path = "/index.html" }
        let relativePath = String(path.dropFirst())
        let fileURL = Bundle.main.bundleURL.appendingPathComponent("WebApp").appendingPathComponent(relativePath)

        guard let data = try? Data(contentsOf: fileURL) else {
            urlSchemeTask.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let response = URLResponse(
            url: url,
            mimeType: Self.mimeType(for: fileURL.pathExtension),
            expectedContentLength: data.count,
            textEncodingName: "utf-8"
        )
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private static func mimeType(for extensionName: String) -> String {
        switch extensionName.lowercased() {
        case "html": return "text/html"
        case "js": return "text/javascript"
        case "css": return "text/css"
        case "json", "webmanifest": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        default: return "application/octet-stream"
        }
    }
}
