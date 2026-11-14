/** Failures other features can catch. Messages never include health values or audio. */

export class NightNotFoundError extends Error {
  readonly nightId: string;
  constructor(nightId: string) {
    super("Night not found");
    this.name = "NightNotFoundError";
    this.nightId = nightId;
  }
}

export class NightEventNotFoundError extends Error {
  readonly eventId: string;
  constructor(eventId: string) {
    super("Event not found");
    this.name = "NightEventNotFoundError";
    this.eventId = eventId;
  }
}

export class NightConflictError extends Error {
  readonly nightId: string;
  constructor(nightId: string) {
    super("Night already belongs to another user");
    this.name = "NightConflictError";
    this.nightId = nightId;
  }
}

export class NightConsentError extends Error {
  constructor() {
    super("Health series need health consent");
    this.name = "NightConsentError";
  }
}

export class NightStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NightStorageError";
  }
}
