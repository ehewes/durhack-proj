/** Failures other features can catch. Messages never include consent choices or health values. */
export class AccountStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountStorageError";
  }
}

/** The user asked to delete everything and it has not finished: nothing new may be stored. */
export class AccountDeletingError extends Error {
  constructor() {
    super("Account is being deleted");
    this.name = "AccountDeletingError";
  }
}
