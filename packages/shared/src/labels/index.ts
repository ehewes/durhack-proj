// Zod schemas and types for the `labels` feature's tRPC inputs and outputs and its clip upload.
export type {
  ClipUploadQuery,
  ClipUploadResult,
  LabelsForNightInput,
  LabelsForNightOutput,
} from "./schema";
export {
  CLIP_MIME_TYPES,
  clipUploadQuery,
  clipUploadResult,
  labelsForNightInput,
  labelsForNightOutput,
  MAX_CLIP_BYTES,
  SPIKE_MATCH_SECONDS,
} from "./schema";
