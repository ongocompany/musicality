import ExpoModulesCore
import AVFoundation

public class AudioExtractorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioExtractor")

    AsyncFunction("extractAndDownsample") { (uri: String) -> String in
      return try Self.extractAndDownsample(uri: uri)
    }

    AsyncFunction("extractMetadata") { (uri: String) -> [String: Any?] in
      return Self.extractMetadata(uri: uri)
    }

    // MARK: - Security-scoped bookmark (persistent cloud file access)

    AsyncFunction("createBookmark") { (uri: String) -> String? in
      return Self.createBookmark(uri: uri)
    }

    AsyncFunction("resolveBookmark") { (bookmarkBase64: String) -> String? in
      return Self.resolveBookmark(bookmarkBase64: bookmarkBase64)
    }

    AsyncFunction("copyWithSecurityScope") { (sourceUri: String, destUri: String) -> Bool in
      return Self.copyWithSecurityScope(sourceUri: sourceUri, destUri: destUri)
    }
  }

  // MARK: - Security-scoped bookmark

  /// Create a persistent bookmark from a security-scoped URL (from document picker)
  private static func createBookmark(uri: String) -> String? {
    guard let url = Self.resolveURL(uri) else { return nil }

    // Start accessing security-scoped resource
    let didStart = url.startAccessingSecurityScopedResource()
    defer { if didStart { url.stopAccessingSecurityScopedResource() } }

    do {
      let bookmarkData = try url.bookmarkData(
        options: .minimalBookmark,
        includingResourceValuesForKeys: nil,
        relativeTo: nil
      )
      return bookmarkData.base64EncodedString()
    } catch {
      print("[Bookmark] Failed to create: \(error.localizedDescription)")
      return nil
    }
  }

  /// Resolve a bookmark back to a URL and start security-scoped access
  private static func resolveBookmark(bookmarkBase64: String) -> String? {
    guard let bookmarkData = Data(base64Encoded: bookmarkBase64) else { return nil }

    do {
      var isStale = false
      let url = try URL(
        resolvingBookmarkData: bookmarkData,
        options: [],
        relativeTo: nil,
        bookmarkDataIsStale: &isStale
      )

      // Start accessing — caller must eventually stop
      let didStart = url.startAccessingSecurityScopedResource()
      if !didStart {
        print("[Bookmark] Could not start accessing security-scoped resource")
        return nil
      }

      return url.absoluteString
    } catch {
      print("[Bookmark] Failed to resolve: \(error.localizedDescription)")
      return nil
    }
  }

  /// Copy a file using security-scoped access (for cloud files)
  private static func copyWithSecurityScope(sourceUri: String, destUri: String) -> Bool {
    guard let srcURL = Self.resolveURL(sourceUri),
          let dstURL = Self.resolveURL(destUri) else { return false }

    let didStart = srcURL.startAccessingSecurityScopedResource()
    defer { if didStart { srcURL.stopAccessingSecurityScopedResource() } }

    do {
      if FileManager.default.fileExists(atPath: dstURL.path) {
        try FileManager.default.removeItem(at: dstURL)
      }
      try FileManager.default.copyItem(at: srcURL, to: dstURL)
      // Verify copy
      let attrs = try FileManager.default.attributesOfItem(atPath: dstURL.path)
      let size = attrs[.size] as? Int64 ?? 0
      return size > 0
    } catch {
      print("[Bookmark] Copy failed: \(error.localizedDescription)")
      return false
    }
  }

  private static func resolveURL(_ uri: String) -> URL? {
    if uri.hasPrefix("file://") { return URL(string: uri) }
    if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
    return URL(string: uri)
  }

  // MARK: - Metadata extraction

  private static func extractMetadata(uri: String) -> [String: Any?] {
    let fileURL: URL
    if uri.hasPrefix("file://") {
      guard let url = URL(string: uri) else { return [:] }
      fileURL = url
    } else if uri.hasPrefix("/") {
      fileURL = URL(fileURLWithPath: uri)
    } else {
      guard let url = URL(string: uri) else { return [:] }
      fileURL = url
    }

    let asset = AVURLAsset(url: fileURL)
    var result: [String: Any?] = [:]

    // Common metadata keys
    for item in asset.commonMetadata {
      if let key = item.commonKey {
        switch key {
        case .commonKeyTitle:
          result["title"] = item.stringValue
        case .commonKeyArtist:
          result["artist"] = item.stringValue
        case .commonKeyAlbumName:
          result["album"] = item.stringValue
        case .commonKeyArtwork:
          if let data = item.dataValue {
            // Save artwork to temp file
            let artPath = NSTemporaryDirectory() + "ritmo_art_\(UUID().uuidString.prefix(8)).jpg"
            try? data.write(to: URL(fileURLWithPath: artPath))
            result["albumArt"] = artPath
          }
        default:
          break
        }
      }
    }

    // Duration
    let duration = CMTimeGetSeconds(asset.duration)
    if duration.isFinite && duration > 0 {
      result["duration"] = duration
    }

    return result
  }

  // MARK: - Core extraction logic

  /// Convert any audio/video file to mono 22050Hz 16-bit PCM WAV
  private static func extractAndDownsample(uri: String) throws -> String {
    // Resolve file URL
    let fileURL: URL
    if uri.hasPrefix("file://") {
      guard let url = URL(string: uri) else {
        throw ExtractorError.invalidURI
      }
      fileURL = url
    } else if uri.hasPrefix("/") {
      fileURL = URL(fileURLWithPath: uri)
    } else {
      guard let url = URL(string: uri) else {
        throw ExtractorError.invalidURI
      }
      fileURL = url
    }

    guard FileManager.default.fileExists(atPath: fileURL.path) else {
      throw ExtractorError.fileNotFound(fileURL.path)
    }

    // Setup AVAsset
    let asset = AVURLAsset(url: fileURL)
    guard let audioTrack = asset.tracks(withMediaType: .audio).first else {
      throw ExtractorError.noAudioTrack
    }

    // Output settings: mono 22050Hz 16-bit PCM
    let targetSampleRate: Double = 22050
    let outputSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: targetSampleRate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]

    // Create reader
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: outputSettings)
    output.alwaysCopiesSampleData = false
    reader.add(output)

    guard reader.startReading() else {
      throw ExtractorError.readerFailed(reader.error?.localizedDescription ?? "Unknown")
    }

    // Collect all PCM samples
    var allSamples = Data()
    while let sampleBuffer = output.copyNextSampleBuffer() {
      if let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) {
        let length = CMBlockBufferGetDataLength(blockBuffer)
        var data = Data(count: length)
        data.withUnsafeMutableBytes { ptr in
          if let baseAddress = ptr.baseAddress {
            CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: length, destination: baseAddress)
          }
        }
        allSamples.append(data)
      }
    }

    if reader.status == .failed {
      throw ExtractorError.readerFailed(reader.error?.localizedDescription ?? "Unknown")
    }

    guard !allSamples.isEmpty else {
      throw ExtractorError.noSamplesExtracted
    }

    // Write WAV file
    let outputPath = NSTemporaryDirectory() + "ritmo_extracted_\(UUID().uuidString.prefix(8)).wav"
    let wavData = Self.createWavFile(pcmData: allSamples, sampleRate: Int(targetSampleRate), bitsPerSample: 16, channels: 1)
    try wavData.write(to: URL(fileURLWithPath: outputPath))

    return outputPath
  }

  // MARK: - WAV file creation

  private static func createWavFile(pcmData: Data, sampleRate: Int, bitsPerSample: Int, channels: Int) -> Data {
    let bytesPerSample = bitsPerSample / 8
    let byteRate = sampleRate * channels * bytesPerSample
    let blockAlign = channels * bytesPerSample
    let dataSize = pcmData.count
    let fileSize = 36 + dataSize

    var wav = Data()

    // RIFF header
    wav.append(contentsOf: "RIFF".utf8)
    wav.append(Self.uint32LE(UInt32(fileSize)))
    wav.append(contentsOf: "WAVE".utf8)

    // fmt chunk
    wav.append(contentsOf: "fmt ".utf8)
    wav.append(Self.uint32LE(16))
    wav.append(Self.uint16LE(1))                          // PCM format
    wav.append(Self.uint16LE(UInt16(channels)))
    wav.append(Self.uint32LE(UInt32(sampleRate)))
    wav.append(Self.uint32LE(UInt32(byteRate)))
    wav.append(Self.uint16LE(UInt16(blockAlign)))
    wav.append(Self.uint16LE(UInt16(bitsPerSample)))

    // data chunk
    wav.append(contentsOf: "data".utf8)
    wav.append(Self.uint32LE(UInt32(dataSize)))
    wav.append(pcmData)

    return wav
  }

  private static func uint32LE(_ value: UInt32) -> Data {
    var v = value.littleEndian
    return Data(bytes: &v, count: 4)
  }

  private static func uint16LE(_ value: UInt16) -> Data {
    var v = value.littleEndian
    return Data(bytes: &v, count: 2)
  }
}

// MARK: - Errors

private enum ExtractorError: LocalizedError {
  case invalidURI
  case fileNotFound(String)
  case noAudioTrack
  case readerFailed(String)
  case noSamplesExtracted

  var errorDescription: String? {
    switch self {
    case .invalidURI: return "Invalid file URI"
    case .fileNotFound(let path): return "File not found: \(path)"
    case .noAudioTrack: return "No audio track found in file"
    case .readerFailed(let msg): return "AVAssetReader failed: \(msg)"
    case .noSamplesExtracted: return "No audio samples extracted"
    }
  }
}
