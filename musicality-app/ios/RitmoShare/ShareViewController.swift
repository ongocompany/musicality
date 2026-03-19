import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    handleSharedURL()
  }

  private func handleSharedURL() {
    guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
      close()
      return
    }

    for item in extensionItems {
      guard let attachments = item.attachments else { continue }
      for provider in attachments {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          provider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] data, _ in
            if let url = data as? URL {
              self?.openApp(with: url.absoluteString)
            }
          }
          return
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] data, _ in
            if let text = data as? String {
              self?.openApp(with: text)
            }
          }
          return
        }
      }
    }

    close()
  }

  private func openApp(with sharedText: String) {
    guard let encoded = sharedText.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
          let url = URL(string: "musicality://share?url=\(encoded)") else {
      close()
      return
    }

    // Open main app via URL scheme
    var responder: UIResponder? = self
    while let r = responder {
      if let application = r as? UIApplication {
        application.open(url, options: [:]) { [weak self] _ in
          self?.close()
        }
        return
      }
      responder = r.next
    }

    // Fallback: use openURL selector
    let selector = sel_registerName("openURL:")
    responder = self
    while let r = responder {
      if r.responds(to: selector) {
        r.perform(selector, with: url)
        break
      }
      responder = r.next
    }

    close()
  }

  private func close() {
    extensionContext?.completeRequest(returningItems: nil)
  }
}
