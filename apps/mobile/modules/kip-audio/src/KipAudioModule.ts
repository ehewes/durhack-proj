import { requireNativeModule } from "expo";

import type { KipAudioNative } from "./types";

// Resolved from the Swift module `KipAudio`; throws in a build that does not link it.
export default requireNativeModule<KipAudioNative>("KipAudio");
