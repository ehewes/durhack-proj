/** Failures the router maps to tRPC codes. Messages never include log content. */

export class EvidenceChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceChainError";
  }
}
