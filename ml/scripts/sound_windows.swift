// Classify an audio file in overlapping windows with Apple's built-in sound classifier
// (SoundAnalysis, the same model family the app uses to drop speech on the phone).
// Prints TSV: start_s, duration_s, top_label, top_confidence, speech_confidence.
//
//   swiftc -O ml/scripts/sound_windows.swift -o /tmp/sound_windows   (macOS only)
//   /tmp/sound_windows <file.m4a|wav>
import AVFoundation
import Foundation
import SoundAnalysis

final class Printer: NSObject, SNResultsObserving {
    func request(_ request: SNRequest, didProduce result: SNResult) {
        guard let r = result as? SNClassificationResult, let top = r.classifications.first else { return }
        let speech = r.classification(forIdentifier: "speech")?.confidence ?? 0
        print(String(format: "%.2f\t%.2f\t%@\t%.3f\t%.3f",
                     r.timeRange.start.seconds, r.timeRange.duration.seconds,
                     top.identifier, top.confidence, speech))
    }
    func request(_ request: SNRequest, didFailWithError error: Error) {
        FileHandle.standardError.write("error: \(error)\n".data(using: .utf8)!)
    }
}

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write("usage: sound_windows <audio file>\n".data(using: .utf8)!)
    exit(2)
}
let analyzer = try SNAudioFileAnalyzer(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let request = try SNClassifySoundRequest(classifierIdentifier: .version1)
request.overlapFactor = 0.5
let printer = Printer()
try analyzer.add(request, withObserver: printer)
analyzer.analyze()
