// Make the web videos and posters of Study 2 from the original recordings,
// with what is built into macOS (no ffmpeg needed):
//     swift tools/prepare_videos.swift [originals] [videos out] [posters out]
// defaults: ../video_stimuli  media/videos  media/posters
//
// - Only the videos the task uses are made: rows 1-32 (reason videos, 4 vs 2
//   boxes) and rows 33-48 (belief videos, no reason), version .1 (English)
//   and .2 (Dutch). The quality versions (.3/.4, Study 1) are skipped.
// - A source file is found by its number ("38.2-..."), so typos in the rest
//   of its name do not matter; the output gets the name the task expects
//   (as videoName() in app.js), e.g. 38.2-Rood-Maan-Kat-No.mp4.
// - Videos: 960 x 540 H.264 (about 600 kbit/s) + AAC, fast start, as the
//   Study 1 web videos. Posters: the first frame as JPEG.
// - A file that is already up to date (newer than its source) is skipped,
//   so the script can simply be run again after more videos have arrived.
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let srcDir = URL(fileURLWithPath: args.count > 1 ? args[1] : "../video_stimuli")
let outDir = URL(fileURLWithPath: args.count > 2 ? args[2] : "media/videos")
let posterDir = URL(fileURLWithPath: args.count > 3 ? args[3] : "media/posters")
let width = 960, height = 540, videoBitRate = 600_000, audioBitRate = 96_000

// Same tables as config.js
let boxes: [(String, [String])] = [("blue", ["elephant", "lion"]), ("red", ["dog", "cat"]),
                                   ("green", ["rhino", "turtle"]), ("yellow", ["cow", "pig"])]
let teams = ["moon", "sun"], qualities = ["strong", "weak"]
let dutch = ["blue": "blauw", "red": "rood", "green": "groen", "yellow": "geel", "moon": "maan",
             "sun": "zon", "strong": "sterk", "weak": "zwak", "elephant": "olifant", "lion": "leeuw",
             "dog": "hond", "cat": "kat", "rhino": "neushoorn", "turtle": "schildpad", "cow": "koe",
             "pig": "varken", "no": "no"]

func canonicalName(row: Int, version: Int) -> String {
    var words: [String]
    if row <= 32 {
        let i = row - 1
        let (box, pair) = boxes[i / 8]
        words = [box, teams[(i / 4) % 2], pair[(i / 2) % 2], qualities[i % 2]]
    } else {
        let i = row - 33
        let (box, pair) = boxes[i / 4]
        words = [box, teams[(i / 2) % 2], pair[i % 2], "no"]
    }
    let dutchVersion = version % 2 == 0
    let shown = words.map { w -> String in
        let s = dutchVersion ? dutch[w]! : w
        return s.prefix(1).uppercased() + s.dropFirst()
    }
    return "\(row).\(version)-" + shown.joined(separator: "-")
}

func modified(_ url: URL) -> Date? {
    (try? FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate]) as? Date
}

func upToDate(_ out: URL, source: URL) -> Bool {
    guard let o = modified(out), let s = modified(source) else { return false }
    return o > s
}

func writePoster(asset: AVAsset, to url: URL) async throws {
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: width, height: height)
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 10)
    let (image, _) = try await generator.image(at: .zero)
    let tmp = url.appendingPathExtension("part")
    guard let dest = CGImageDestinationCreateWithURL(tmp as CFURL, UTType.jpeg.identifier as CFString,
                                                     1, nil) else {
        throw NSError(domain: "poster", code: 1)
    }
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw NSError(domain: "poster", code: 2) }
    _ = try? FileManager.default.removeItem(at: url)
    try FileManager.default.moveItem(at: tmp, to: url)
}

func writeVideo(asset: AVAsset, to url: URL) async throws {
    let tmp = url.deletingPathExtension().appendingPathExtension("part.mp4")
    _ = try? FileManager.default.removeItem(at: tmp)
    let reader = try AVAssetReader(asset: asset)
    let writer = try AVAssetWriter(outputURL: tmp, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true  // fast start: plays while loading

    var pairs: [(AVAssetReaderOutput, AVAssetWriterInput)] = []
    if let track = try await asset.loadTracks(withMediaType: .video).first {
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width, AVVideoHeightKey: height,
            AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: videoBitRate,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264MainAutoLevel,
                AVVideoMaxKeyFrameIntervalKey: 30]])
        input.transform = try await track.load(.preferredTransform)
        input.expectsMediaDataInRealTime = false
        pairs.append((output, input))
    }
    if let track = try await asset.loadTracks(withMediaType: .audio).first {
        var channels = 2, rate = 48_000.0
        if let desc = try await track.load(.formatDescriptions).first,
           let basic = CMAudioFormatDescriptionGetStreamBasicDescription(desc)?.pointee {
            channels = min(2, max(1, Int(basic.mChannelsPerFrame)))
            rate = basic.mSampleRate > 0 ? basic.mSampleRate : rate
        }
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM, AVNumberOfChannelsKey: channels,
            AVSampleRateKey: rate])
        let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
            AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: channels,
            AVSampleRateKey: rate, AVEncoderBitRateKey: audioBitRate])
        input.expectsMediaDataInRealTime = false
        pairs.append((output, input))
    }
    for (output, input) in pairs {
        reader.add(output)
        writer.add(input)
    }
    guard reader.startReading() else { throw reader.error ?? NSError(domain: "read", code: 1) }
    guard writer.startWriting() else { throw writer.error ?? NSError(domain: "write", code: 1) }
    writer.startSession(atSourceTime: .zero)

    // AVFoundation objects are used from one copy queue per track only
    final class Copy: @unchecked Sendable {
        let output: AVAssetReaderOutput, input: AVAssetWriterInput
        let reader: AVAssetReader, writer: AVAssetWriter
        init(_ o: AVAssetReaderOutput, _ i: AVAssetWriterInput, _ r: AVAssetReader, _ w: AVAssetWriter) {
            output = o; input = i; reader = r; writer = w
        }
    }
    await withTaskGroup(of: Void.self) { group in
        for copy in pairs.map({ Copy($0.0, $0.1, reader, writer) }) {
            group.addTask {
                let (output, input, reader, writer) = (copy.output, copy.input, copy.reader, copy.writer)
                await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
                    let queue = DispatchQueue(label: "copy")
                    input.requestMediaDataWhenReady(on: queue) {
                        while input.isReadyForMoreMediaData {
                            if let sample = output.copyNextSampleBuffer() {
                                if !input.append(sample) { break }
                            } else {
                                input.markAsFinished()
                                done.resume()
                                return
                            }
                        }
                        if writer.status == .failed || reader.status == .failed {
                            input.markAsFinished()
                            done.resume()
                        }
                    }
                }
            }
        }
    }
    await writer.finishWriting()
    if writer.status != .completed || reader.status == .failed {
        _ = try? FileManager.default.removeItem(at: tmp)
        throw writer.error ?? reader.error ?? NSError(domain: "write", code: 2)
    }
    _ = try? FileManager.default.removeItem(at: url)
    try FileManager.default.moveItem(at: tmp, to: url)
}

// Source files by number ("38.2"); names Dropbox has not finished
// downloading yet are skipped.
let fm = FileManager.default
try fm.createDirectory(at: outDir, withIntermediateDirectories: true)
try fm.createDirectory(at: posterDir, withIntermediateDirectories: true)
var sources: [String: URL] = [:]
let pattern = try NSRegularExpression(pattern: #"^(\d+)\.(\d)-.*\.mp4\s*$"#, options: [.caseInsensitive])
for name in try fm.contentsOfDirectory(atPath: srcDir.path) {
    let range = NSRange(name.startIndex..., in: name)
    guard let m = pattern.firstMatch(in: name, range: range),
          let r = Range(m.range(at: 1), in: name), let v = Range(m.range(at: 2), in: name) else { continue }
    sources["\(name[r]).\(name[v])"] = srcDir.appendingPathComponent(name)
}

var made = 0, skipped = 0, missing: [String] = [], failed: [String] = []
for row in 1...48 {
    for version in 1...2 {
        let name = canonicalName(row: row, version: version)
        guard let source = sources["\(row).\(version)"] else {
            missing.append(name)
            continue
        }
        let video = outDir.appendingPathComponent("\(name).mp4")
        let poster = posterDir.appendingPathComponent("\(name).jpg")
        if upToDate(video, source: source) && upToDate(poster, source: source) {
            skipped += 1
            continue
        }
        let asset = AVURLAsset(url: source)
        do {
            if !upToDate(video, source: source) { try await writeVideo(asset: asset, to: video) }
            if !upToDate(poster, source: source) { try await writePoster(asset: asset, to: poster) }
            made += 1
            let note = source.lastPathComponent == "\(name).mp4" ? "" : "   (from \"\(source.lastPathComponent)\")"
            print("made \(name)\(note)")
        } catch {
            failed.append("\(name): \(error.localizedDescription)")
        }
    }
}
print("\n\(made) made, \(skipped) already up to date, \(missing.count) missing, \(failed.count) failed")
missing.forEach { print("  missing: \($0)") }
failed.forEach { print("  FAILED:  \($0)") }
exit(failed.isEmpty ? 0 : 1)
