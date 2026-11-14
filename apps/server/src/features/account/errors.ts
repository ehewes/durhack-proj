/** Failures other features can catch. Messages never include consent choices or health values. */
export class AccountStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountStorageError";
  }
}
