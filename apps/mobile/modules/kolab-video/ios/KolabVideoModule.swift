import AVFoundation
import ExpoModulesCore
import CoreImage
import QuartzCore
import UIKit

// MARK: - Spec records (mirrors src/KolabVideo.types.ts)

struct ClipSpec: Record {
  @Field var uri: String = ""
  @Field var startMs: Double = 0
  /// 0 = until the end of the source
  @Field var endMs: Double = 0
}

struct TextSpec: Record {
  @Field var text: String = ""
  @Field var startMs: Double = 0
  @Field var endMs: Double = 0
  /// "top" | "center" | "bottom"
  @Field var position: String = "bottom"
  @Field var fontSize: Double = 64
  @Field var color: String = "#FFFFFF"
  /// Pill behind the text; nil = shadow only
  @Field var background: String? = nil
}

struct ImageSpec: Record {
  @Field var uri: String = ""
  /// Normalised 0...1, top-left origin
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var width: Double = 0.2
  @Field var height: Double = 0.1
  @Field var startMs: Double = 0
  /// 0 = until the end of the video
  @Field var endMs: Double = 0
  @Field var opacity: Double = 1
  @Field var cornerRadius: Double = 0
}

struct EndCardSpec: Record {
  @Field var durationMs: Double = 2500
  @Field var imageUri: String? = nil
  @Field var logoUri: String? = nil
  @Field var title: String = ""
  @Field var subtitle: String = ""
  @Field var colors: [String] = ["#7C3AED", "#DB2777"]
}

struct MusicSpec: Record {
  @Field var uri: String = ""
  @Field var volume: Double = 0.35
}

struct ComposeSpec: Record {
  @Field var clips: [ClipSpec] = []
  @Field var width: Double = 1080
  @Field var height: Double = 1920
  @Field var texts: [TextSpec] = []
  @Field var images: [ImageSpec] = []
  @Field var endCard: EndCardSpec? = nil
  @Field var music: MusicSpec? = nil
  @Field var voiceVolume: Double = 1
}

final class KolabVideoException: GenericException<String>, @unchecked Sendable {
  override var reason: String { param }
}

// MARK: - Module

/// On-device editor backend: trims and joins clips, burns in captions and brand overlays,
/// mixes a music bed, and exports an H.264 MP4. AVFoundation only (no ffmpeg).
public class KolabVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("KolabVideo")
    Events("onProgress")

    AsyncFunction("getInfo") { (uri: String) -> [String: Any] in
      let asset = AVURLAsset(url: try Self.url(uri))
      let duration = try await asset.load(.duration)
      let video = try await asset.loadTracks(withMediaType: .video).first
      let audio = try await asset.loadTracks(withMediaType: .audio).first
      var size = CGSize.zero
      if let video {
        let (natural, transform) = try await video.load(.naturalSize, .preferredTransform)
        let rect = CGRect(origin: .zero, size: natural).applying(transform)
        size = CGSize(width: abs(rect.width), height: abs(rect.height))
      }
      return ["durationMs": duration.seconds * 1000, "width": size.width, "height": size.height, "hasAudio": audio != nil]
    }

    AsyncFunction("thumbnail") { (uri: String, atMs: Double, maxSize: Double) -> String in
      let generator = AVAssetImageGenerator(asset: AVURLAsset(url: try Self.url(uri)))
      generator.appliesPreferredTrackTransform = true
      generator.maximumSize = CGSize(width: maxSize, height: maxSize)
      generator.requestedTimeToleranceBefore = .zero
      generator.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 10)
      let (cg, _) = try await generator.image(at: CMTime(seconds: atMs / 1000, preferredTimescale: 600))
      guard let data = UIImage(cgImage: cg).jpegData(compressionQuality: 0.7) else {
        throw KolabVideoException("Could not encode thumbnail")
      }
      let out = Self.outputURL(ext: "jpg")
      try data.write(to: out)
      return out.absoluteString
    }

    /// The timeline's audio only (for speech-to-captions): same trims and order as the video.
    AsyncFunction("exportAudio") { (clips: [ClipSpec]) -> [String: Any] in
      let composition = AVMutableComposition()
      guard let track = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        throw KolabVideoException("Could not create audio track")
      }
      var cursor = CMTime.zero
      for clip in clips {
        let asset = AVURLAsset(url: try Self.url(clip.uri))
        let range = try await Self.range(of: clip, in: asset)
        if let source = try await asset.loadTracks(withMediaType: .audio).first {
          try track.insertTimeRange(range, of: source, at: cursor)
        }
        cursor = cursor + range.duration
      }
      guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetAppleM4A) else {
        throw KolabVideoException("Audio export unavailable")
      }
      let out = Self.outputURL(ext: "m4a")
      session.outputURL = out
      session.outputFileType = .m4a
      try await self.run(session, reportProgress: false)
      return ["uri": out.absoluteString, "durationMs": cursor.seconds * 1000]
    }

    AsyncFunction("compose") { (spec: ComposeSpec) -> [String: Any] in
      try await self.compose(spec)
    }
  }

  /// Runs one step and turns any AVFoundation error into a readable, step-labelled exception.
  private static func step<T>(_ name: String, _ body: () async throws -> T) async throws -> T {
    do {
      return try await body()
    } catch let e as KolabVideoException {
      throw e
    } catch {
      let ns = error as NSError
      let under = (ns.userInfo[NSUnderlyingErrorKey] as? NSError).map { " / \($0.domain) \($0.code)" } ?? ""
      throw KolabVideoException("\(name): \(ns.domain) \(ns.code)\(under) \(ns.localizedFailureReason ?? ns.localizedDescription)")
    }
  }

  // MARK: compose

  /// One stretch of the output timeline and how its source frames map onto the canvas (Core Image space).
  private struct Segment {
    let start: Double
    let end: Double
    let transform: CGAffineTransform
  }

  /// A pre-drawn overlay already positioned on the canvas, visible from `start` to `end` seconds.
  private struct Overlay {
    let image: CIImage
    let start: Double
    let end: Double
  }

  private func compose(_ spec: ComposeSpec) async throws -> [String: Any] {
    guard !spec.clips.isEmpty else { throw KolabVideoException("Add at least one clip") }
    let render = CGSize(width: spec.width, height: spec.height)
    let composition = AVMutableComposition()
    guard
      let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let voiceTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    else { throw KolabVideoException("Could not create tracks") }

    var segments: [Segment] = []
    var cursor = CMTime.zero
    var last: (source: AVAssetTrack, range: CMTimeRange, transform: CGAffineTransform, asset: AVURLAsset)?
    for clip in spec.clips {
      let asset = AVURLAsset(url: try Self.url(clip.uri))
      guard let source = try await asset.loadTracks(withMediaType: .video).first else {
        throw KolabVideoException("A clip has no video")
      }
      let range = try await Self.range(of: clip, in: asset)
      let at = cursor
      try await Self.step("insert video") { try videoTrack.insertTimeRange(range, of: source, at: at) }
      if let audio = try await asset.loadTracks(withMediaType: .audio).first {
        try await Self.step("insert audio") { try voiceTrack.insertTimeRange(range, of: audio, at: at) }
      }
      let (natural, preferred) = try await source.load(.naturalSize, .preferredTransform)
      let transform = Self.ciFill(natural: natural, preferred: preferred, into: render)
      segments.append(Segment(start: cursor.seconds, end: (cursor + range.duration).seconds, transform: transform))
      cursor = cursor + range.duration
      last = (source, range, transform, asset)
    }
    let contentEnd = cursor

    // End card: hold the last clip's final frame for the card's length; the card covers it fully.
    if let card = spec.endCard, card.durationMs > 0, let last {
      let extra = CMTime(seconds: card.durationMs / 1000, preferredTimescale: 600)
      let tail = CMTime(value: 3, timescale: 30)
      let hold = CMTimeRange(start: max(last.range.start, last.range.end - tail), end: last.range.end)
      let at = cursor
      try await Self.step("end card") {
        try videoTrack.insertTimeRange(hold, of: last.source, at: at)
        videoTrack.scaleTimeRange(CMTimeRange(start: at, duration: hold.duration), toDuration: extra)
      }
      segments.append(Segment(start: cursor.seconds, end: (cursor + extra).seconds, transform: last.transform))
      cursor = cursor + extra
    }
    let total = cursor

    let overlays = try await Self.step("overlays") { try self.overlays(spec: spec, render: render, contentEnd: contentEnd.seconds, total: total.seconds) }
    let canvas = CGRect(origin: .zero, size: render)
    let black = CIImage(color: .black).cropped(to: canvas)

    // Per-frame Core Image compositor (no Core Animation: AVVideoCompositionCoreAnimationTool
    // crashes in the iOS Simulator's renderer, and this path is also simpler to reason about).
    let videoComposition = AVMutableVideoComposition(asset: composition) { request in
      let t = request.compositionTime.seconds
      var frame = black
      if let seg = segments.first(where: { t >= $0.start && t < $0.end }) ?? segments.last {
        frame = request.sourceImage.transformed(by: seg.transform).composited(over: frame)
      }
      for o in overlays where t >= o.start && t < o.end {
        frame = o.image.composited(over: frame)
      }
      request.finish(with: frame.cropped(to: canvas), context: nil)
    }
    videoComposition.renderSize = render
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

    let audioMix = try await Self.step("music") { try await mix(spec: spec, composition: composition, voice: voiceTrack, total: total) }

    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      throw KolabVideoException("Video export unavailable")
    }
    let out = Self.outputURL(ext: "mp4")
    session.outputURL = out
    session.outputFileType = .mp4
    session.shouldOptimizeForNetworkUse = true
    session.videoComposition = videoComposition
    session.audioMix = audioMix
    try await run(session, reportProgress: true)
    withExtendedLifetime(last?.asset) {}
    let size = (try? FileManager.default.attributesOfItem(atPath: out.path)[.size] as? NSNumber)?.intValue ?? 0
    return ["uri": out.absoluteString, "durationMs": total.seconds * 1000, "bytes": size]
  }

  private func run(_ session: AVAssetExportSession, reportProgress: Bool) async throws {
    let ticker = Task { [weak self] in
      while reportProgress && !Task.isCancelled {
        self?.sendEvent("onProgress", ["progress": Double(session.progress)])
        try? await Task.sleep(nanoseconds: 200_000_000)
      }
    }
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
      session.exportAsynchronously { done.resume() }
    }
    ticker.cancel()
    guard session.status == .completed else {
      let ns = session.error as NSError?
      let under = (ns?.userInfo[NSUnderlyingErrorKey] as? NSError).map { " / \($0.domain) \($0.code)" } ?? ""
      throw KolabVideoException("export: \(ns?.domain ?? "") \(ns?.code ?? 0)\(under) \(ns?.localizedFailureReason ?? ns?.localizedDescription ?? "failed")")
    }
    if reportProgress { sendEvent("onProgress", ["progress": 1.0]) }
  }

  // MARK: audio

  private func mix(spec: ComposeSpec, composition: AVMutableComposition, voice: AVMutableCompositionTrack, total: CMTime) async throws -> AVAudioMix {
    let voiceParams = AVMutableAudioMixInputParameters(track: voice)
    voiceParams.setVolume(Float(spec.voiceVolume), at: .zero)
    var params = [voiceParams]

    // Keep the asset referenced while inserting: a track only holds its asset weakly.
    let musicAsset = spec.music.flatMap { $0.uri.isEmpty ? nil : try? AVURLAsset(url: Self.url($0.uri)) }
    if let music = spec.music, let musicAsset,
       let source = try await musicAsset.loadTracks(withMediaType: .audio).first,
       let bed = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
      let loop = try await source.load(.timeRange).duration
      var at = CMTime.zero
      while at < total, loop.seconds > 0 {
        let piece = CMTimeMinimum(loop, total - at)
        try bed.insertTimeRange(CMTimeRange(start: .zero, duration: piece), of: source, at: at)
        at = at + piece
      }
      let bedParams = AVMutableAudioMixInputParameters(track: bed)
      let fade = CMTime(seconds: min(1.2, total.seconds / 4), preferredTimescale: 600)
      bedParams.setVolume(Float(music.volume), at: .zero)
      bedParams.setVolumeRamp(fromStartVolume: Float(music.volume), toEndVolume: 0, timeRange: CMTimeRange(start: total - fade, duration: fade))
      params.append(bedParams)
    }
    let mix = AVMutableAudioMix()
    mix.inputParameters = params
    return mix
  }

  // MARK: overlays

  private func overlays(spec: ComposeSpec, render: CGSize, contentEnd: Double, total: Double) throws -> [Overlay] {
    var out: [Overlay] = []

    for img in spec.images {
      guard let image = try? Self.loadImage(img.uri) else { continue }
      let rect = CGRect(x: img.x * render.width, y: img.y * render.height, width: img.width * render.width, height: img.height * render.height)
      let drawn = Self.fitted(image, in: rect.size, cornerRadius: img.cornerRadius, opacity: img.opacity)
      out.append(Overlay(image: Self.place(drawn, at: rect.origin, canvas: render), start: img.startMs / 1000, end: img.endMs > 0 ? img.endMs / 1000 : contentEnd))
    }

    for t in spec.texts where !t.text.trimmingCharacters(in: .whitespaces).isEmpty {
      let image = Self.textImage(t.text, size: t.fontSize, color: Self.color(t.color), background: t.background.map(Self.color), maxWidth: render.width * 0.86)
      let y: CGFloat = switch t.position {
      case "top": render.height * 0.13
      case "center": (render.height - image.size.height) / 2
      default: render.height * 0.72 - image.size.height / 2
      }
      let origin = CGPoint(x: (render.width - image.size.width) / 2, y: y)
      out.append(Overlay(image: Self.place(image, at: origin, canvas: render), start: t.startMs / 1000, end: min(t.endMs / 1000, contentEnd)))
    }

    if let card = spec.endCard, card.durationMs > 0 {
      let image = endCardImage(card, render: render)
      out.append(Overlay(image: Self.place(image, at: .zero, canvas: render), start: contentEnd, end: total + 1))
    }
    return out
  }

  /// Full-frame outro: brand gradient, logo tile, product photo, title and call to action.
  private func endCardImage(_ card: EndCardSpec, render: CGSize) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: render, format: format).image { ctx in
      let cg = ctx.cgContext
      let colors = card.colors.map { Self.color($0).cgColor } as CFArray
      if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: nil) {
        cg.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: render.width, y: render.height), options: [])
      }
      var y = render.height * 0.16
      if let logo = card.logoUri.flatMap({ try? Self.loadImage($0) }) {
        let side = render.width * 0.22
        let tile = CGRect(x: (render.width - side) / 2, y: y, width: side, height: side)
        UIColor.white.setFill()
        UIBezierPath(roundedRect: tile, cornerRadius: side * 0.22).fill()
        Self.fitted(logo, in: CGSize(width: side * 0.76, height: side * 0.76), cornerRadius: 0, opacity: 1)
          .draw(in: tile.insetBy(dx: side * 0.12, dy: side * 0.12))
        y += side + render.height * 0.04
      }
      if let product = card.imageUri.flatMap({ try? Self.loadImage($0) }) {
        let w = render.width * 0.56
        let rect = CGRect(x: (render.width - w) / 2, y: y, width: w, height: w * 1.2)
        cg.saveGState()
        UIBezierPath(roundedRect: rect, cornerRadius: 48).addClip()
        let scale = max(rect.width / product.size.width, rect.height / product.size.height)
        let size = CGSize(width: product.size.width * scale, height: product.size.height * scale)
        product.draw(in: CGRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2, width: size.width, height: size.height))
        cg.restoreGState()
        y += rect.height + render.height * 0.04
      }
      for (text, size) in [(card.title, 76.0), (card.subtitle, 46.0)] where !text.isEmpty {
        let image = Self.textImage(text, size: size, color: .white, background: nil, maxWidth: render.width * 0.84)
        image.draw(at: CGPoint(x: (render.width - image.size.width) / 2, y: y))
        y += image.size.height + 16
      }
    }
  }

  // MARK: helpers

  /// Converts a UIKit-space image placement (top-left origin) into a positioned CIImage.
  private static func place(_ image: UIImage, at origin: CGPoint, canvas: CGSize) -> CIImage {
    let ci = image.cgImage.map { CIImage(cgImage: $0) } ?? CIImage.empty()
    return ci.transformed(by: CGAffineTransform(translationX: origin.x, y: canvas.height - origin.y - image.size.height))
  }

  /// Draws `image` aspect-fit into `size`, with optional rounded corners and opacity.
  private static func fitted(_ image: UIImage, in size: CGSize, cornerRadius: Double, opacity: Double) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      let scale = min(size.width / image.size.width, size.height / image.size.height)
      let drawn = CGSize(width: image.size.width * scale, height: image.size.height * scale)
      let rect = CGRect(x: (size.width - drawn.width) / 2, y: (size.height - drawn.height) / 2, width: drawn.width, height: drawn.height)
      if cornerRadius > 0 { UIBezierPath(roundedRect: rect, cornerRadius: cornerRadius).addClip() }
      image.draw(in: rect, blendMode: .normal, alpha: opacity)
    }
  }

  /// `fill` expressed in Core Image coordinates (bottom-left origin on both sides).
  private static func ciFill(natural: CGSize, preferred: CGAffineTransform, into render: CGSize) -> CGAffineTransform {
    let flipIn = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: natural.height)
    let flipOut = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: render.height)
    return flipIn.concatenating(fill(natural: natural, preferred: preferred, into: render)).concatenating(flipOut)
  }

  /// Aspect-fill a source track (with its rotation) into the render size.
  private static func fill(natural: CGSize, preferred: CGAffineTransform, into render: CGSize) -> CGAffineTransform {
    let rect = CGRect(origin: .zero, size: natural).applying(preferred)
    let oriented = CGSize(width: abs(rect.width), height: abs(rect.height))
    let scale = max(render.width / oriented.width, render.height / oriented.height)
    return preferred
      .concatenating(CGAffineTransform(translationX: -rect.origin.x, y: -rect.origin.y))
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
      .concatenating(CGAffineTransform(translationX: (render.width - oriented.width * scale) / 2, y: (render.height - oriented.height * scale) / 2))
  }

  private static func range(of clip: ClipSpec, in asset: AVURLAsset) async throws -> CMTimeRange {
    let duration = try await asset.load(.duration)
    let start = CMTime(seconds: max(0, clip.startMs) / 1000, preferredTimescale: 600)
    let end = clip.endMs > 0 ? CMTimeMinimum(CMTime(seconds: clip.endMs / 1000, preferredTimescale: 600), duration) : duration
    guard end > start else { throw KolabVideoException("A clip's trim is empty") }
    return CMTimeRange(start: start, end: end)
  }

  /// Text (emoji included) drawn once into an image: reliable wrapping, shadow and pill background.
  private static func textImage(_ text: String, size: Double, color: UIColor, background: UIColor?, maxWidth: CGFloat) -> UIImage {
    let style = NSMutableParagraphStyle()
    style.alignment = .center
    style.lineBreakMode = .byWordWrapping
    let shadow = NSShadow()
    shadow.shadowColor = UIColor.black.withAlphaComponent(background == nil ? 0.75 : 0)
    shadow.shadowBlurRadius = 8
    shadow.shadowOffset = CGSize(width: 0, height: 2)
    let font = UIFont.systemFont(ofSize: size, weight: .heavy)
    let rounded = font.fontDescriptor.withDesign(.rounded).map { UIFont(descriptor: $0, size: size) } ?? font
    let attributed = NSAttributedString(string: text, attributes: [.font: rounded, .foregroundColor: color, .paragraphStyle: style, .shadow: shadow])
    let pad = CGSize(width: size * 0.55, height: size * 0.3)
    let bounds = attributed.boundingRect(with: CGSize(width: maxWidth - pad.width * 2, height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
    let canvas = CGSize(width: ceil(bounds.width + pad.width * 2), height: ceil(bounds.height + pad.height * 2))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: canvas, format: format).image { _ in
      if let background {
        background.setFill()
        UIBezierPath(roundedRect: CGRect(origin: .zero, size: canvas), cornerRadius: min(canvas.height / 2, size * 0.6)).fill()
      }
      attributed.draw(with: CGRect(x: pad.width, y: pad.height, width: bounds.width, height: bounds.height), options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
    }
  }

  private static func loadImage(_ uri: String) throws -> UIImage {
    let data = try Data(contentsOf: try url(uri))
    guard let image = UIImage(data: data) else { throw KolabVideoException("Unreadable image") }
    return image
  }

  private static func color(_ hex: String) -> UIColor {
    var s = hex.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
    if s.count == 6 { s += "FF" }
    var v: UInt64 = 0
    Scanner(string: s).scanHexInt64(&v)
    return UIColor(red: CGFloat((v >> 24) & 0xFF) / 255, green: CGFloat((v >> 16) & 0xFF) / 255, blue: CGFloat((v >> 8) & 0xFF) / 255, alpha: CGFloat(v & 0xFF) / 255)
  }

  private static func url(_ uri: String) throws -> URL {
    if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
    guard let u = URL(string: uri) else { throw KolabVideoException("Bad URI: \(uri)") }
    return u
  }

  private static func outputURL(ext: String) -> URL {
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("kolab-video", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent("\(UUID().uuidString).\(ext)")
  }
}
