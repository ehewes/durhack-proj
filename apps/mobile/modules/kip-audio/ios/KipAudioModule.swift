import ExpoModulesCore

// Skeleton: the JS contract lives in ../index.ts. Real metering (AVAudioRecorder at 1 Hz, 10 s
// 16 kHz mono 16-bit WAV spike clips, SoundAnalysis speech check) is a later issue.
public class KipAudioModule: Module {
  private var recording = false

  public func definition() -> ModuleDefinition {
    Name("KipAudio")

    Events("onSample", "onSpike")

    AsyncFunction("start") { (options: StartOptions) in
      self.recording = true
    }

    AsyncFunction("stop") {
      self.recording = false
    }

    Function("isRecording") {
      return self.recording
    }

    AsyncFunction("deleteClip") { (uri: String) in
      // Later issue: delete the WAV at `uri`.
    }
  }
}

struct StartOptions: Record {
  @Field var spikeThresholdDb: Double = 0
}
