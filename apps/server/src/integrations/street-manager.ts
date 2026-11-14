import { createVerify, X509Certificate } from "node:crypto";
import { z } from "zod";

/**
 * Street Manager open data arrives as AWS SNS HTTPS notifications.
 * DfT documents the topics, the confirmation GET, and the permit fields:
 * https://department-for-transport-streetmanager.github.io/street-manager-docs/open-data/
 *
 * British National Grid (OSGB36) converts to WGS84 with the Ordnance Survey
 * transverse Mercator inverse and the 7-parameter Helmert published as EPSG:1314
 * (OSGB36 to WGS 84). That Helmert is accurate to about 5 metres, which is enough
 * to place a permit against a stay. It is not the OSTN15 grid.
 */

/** Production topics from the DfT open data guide. eu-west-2, account 287813576808. */
export const STREET_MANAGER_TOPIC_ARNS = {
  activity: "arn:aws:sns:eu-west-2:287813576808:prod-activity-topic",
  permit: "arn:aws:sns:eu-west-2:287813576808:prod-permit-topic",
  section58: "arn:aws:sns:eu-west-2:287813576808:prod-section-58-topic",
} as const;

const OFFICIAL_TOPICS = new Set<string>(Object.values(STREET_MANAGER_TOPIC_ARNS));

const SNS_HOST = "sns.eu-west-2.amazonaws.com";

export type StreetManagerErrorCode =
  | "malformed"
  | "signature"
  | "certificate"
  | "topic"
  | "subscription"
  | "permit";

export class StreetManagerError extends Error {
  readonly code: StreetManagerErrorCode;

  constructor(code: StreetManagerErrorCode, message: string) {
    super(message);
    this.name = "StreetManagerError";
    this.code = code;
  }
}

/** Enough of fetch for the certificate and SubscribeURL GETs. */
export type StreetManagerFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type StreetManagerOptions = {
  /** Defaults to global fetch. Used for the signing certificate and SubscribeURL. */
  fetch?: StreetManagerFetch;
  /**
   * Replaces the certificate HTTPS fetch. The URL is still required to be an
   * AWS SNS certificate in eu-west-2 before this is called.
   */
  loadCertificate?: (url: string) => Promise<string>;
  /**
   * Subset of the three DfT topics. When omitted, `STREET_MANAGER_TOPIC_ARN`
   * narrows to one official topic if set, otherwise all three are accepted.
   */
  allowedTopicArns?: readonly string[];
};

export type StreetManagerPoint = {
  /** Representative British National Grid position, metres. A linestring uses the mean. */
  easting: number;
  northing: number;
  lat: number;
  lon: number;
  /** WKT as sent by Street Manager, on the British National Grid. */
  wkt: string;
};

export type StreetManagerPermit = {
  eventReference: number;
  eventType: string;
  eventTime: string;
  objectReference: string;
  permitReferenceNumber: string;
  workReferenceNumber: string;
  highwayAuthority: string;
  streetName: string;
  town: string | null;
  areaName: string | null;
  workCategory: string;
  trafficManagementType: string;
  currentTrafficManagementType: string | null;
  workStatus: string | null;
  /** Date is known even when the clock time was left unset. Midnight is a real time, not a missing one. */
  proposedStart: { date: string | null; time: string | null };
  proposedEnd: { date: string | null; time: string | null };
  actualStart: string | null;
  actualEnd: string | null;
  location: StreetManagerPoint;
};

export type StreetManagerReceipt =
  | { kind: "subscription_confirmed"; topicArn: string; status: number }
  | { kind: "unsubscribe_confirmation"; topicArn: string }
  | { kind: "permit"; permit: StreetManagerPermit }
  | { kind: "ignored"; topicArn: string; objectType: string };

const snsBase = {
  Message: z.string(),
  MessageId: z.string().min(1),
  TopicArn: z.string().min(1),
  Timestamp: z.string().min(1),
  SignatureVersion: z.enum(["1", "2"]),
  Signature: z.string().min(1),
  SigningCertURL: z.string().min(1),
};

const snsMessageSchema = z.discriminatedUnion("Type", [
  z.object({
    ...snsBase,
    Type: z.literal("Notification"),
    Subject: z.string().optional(),
  }),
  z.object({
    ...snsBase,
    Type: z.literal("SubscriptionConfirmation"),
    Token: z.string().min(1),
    SubscribeURL: z.string().min(1),
  }),
  z.object({
    ...snsBase,
    Type: z.literal("UnsubscribeConfirmation"),
    Token: z.string().min(1),
    SubscribeURL: z.string().min(1),
  }),
]);

export type StreetManagerSnsMessage = z.infer<typeof snsMessageSchema>;

const eventSchema = z.object({
  event_reference: z.number(),
  event_type: z.string().min(1),
  event_time: z.string().min(1),
  object_type: z.string().min(1),
  object_reference: z.string().min(1),
  object_data: z.unknown(),
});

const optionalText = z.string().min(1).nullish();

const permitDataSchema = z.object({
  work_reference_number: z.string().min(1),
  permit_reference_number: z.string().min(1),
  highway_authority: z.string().min(1),
  street_name: z.string().min(1),
  works_location_coordinates: z.string().min(1),
  work_category: z.string().min(1),
  traffic_management_type: z.string().min(1),
  proposed_start_date: optionalText,
  proposed_start_time: optionalText,
  proposed_end_date: optionalText,
  proposed_end_time: optionalText,
  actual_start_date_time: optionalText,
  actual_end_date_time: optionalText,
  current_traffic_management_type: optionalText,
  work_status: optionalText,
  town: optionalText,
  area_name: optionalText,
});

type PermitEvent = z.infer<typeof eventSchema>;

/** Topics this process will accept. Unknown ARNs are rejected so a private SNS topic cannot pass. */
export function streetManagerTopics(override?: readonly string[]): readonly string[] {
  if (override) {
    if (override.length === 0) {
      throw new StreetManagerError("topic", "No Street Manager topics configured");
    }
    for (const arn of override) {
      if (!OFFICIAL_TOPICS.has(arn)) {
        throw new StreetManagerError("topic", "Topic ARN is not a Street Manager topic");
      }
    }
    return override;
  }
  const fromEnv = process.env.STREET_MANAGER_TOPIC_ARN?.trim();
  if (!fromEnv) return [...OFFICIAL_TOPICS];
  if (!OFFICIAL_TOPICS.has(fromEnv)) {
    throw new StreetManagerError("topic", "Topic ARN is not a Street Manager topic");
  }
  return [fromEnv];
}

/**
 * Bytes AWS signs, one field name and value per line.
 * SignatureVersion 1 is RSA-SHA1 and version 2 is RSA-SHA256. The string is the same.
 * https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 */
export function streetManagerStringToSign(message: StreetManagerSnsMessage): string {
  const lines: string[] = [];
  const add = (name: string, value: string) => {
    lines.push(name, value);
  };
  add("Message", message.Message);
  add("MessageId", message.MessageId);
  if (message.Type === "Notification") {
    if (message.Subject !== undefined) add("Subject", message.Subject);
  } else {
    add("SubscribeURL", message.SubscribeURL);
  }
  add("Timestamp", message.Timestamp);
  if (message.Type !== "Notification") add("Token", message.Token);
  add("TopicArn", message.TopicArn);
  add("Type", message.Type);
  return `${lines.join("\n")}\n`;
}

const AIRY_A = 6_377_563.396;
const AIRY_B = 6_356_256.909;
const WGS84_A = 6_378_137.0;
const WGS84_B = 6_356_752.314245;
const F0 = 0.9996012717;
const LAT0 = (49 * Math.PI) / 180;
const LON0 = (-2 * Math.PI) / 180;
const N0 = -100_000;
const E0 = 400_000;
const AIRY_E2 = 1 - (AIRY_B * AIRY_B) / (AIRY_A * AIRY_A);
const N_ELLIP = (AIRY_A - AIRY_B) / (AIRY_A + AIRY_B);
const N2 = N_ELLIP * N_ELLIP;
const N3 = N2 * N_ELLIP;

const HELMERT_TX = 446.448;
const HELMERT_TY = -125.157;
const HELMERT_TZ = 542.06;
const HELMERT_S = -20.4894e-6;
const HELMERT_RX = (0.1502 * Math.PI) / 648_000;
const HELMERT_RY = (0.247 * Math.PI) / 648_000;
const HELMERT_RZ = (0.8421 * Math.PI) / 648_000;

function insideNationalGrid(easting: number, northing: number): boolean {
  return (
    Number.isFinite(easting) &&
    Number.isFinite(northing) &&
    easting >= 0 &&
    easting <= 700_000 &&
    northing >= 0 &&
    northing <= 1_300_000
  );
}

function meridianArc(phi: number): number {
  const delta = phi - LAT0;
  const ma = (1 + N_ELLIP + (5 / 4) * N2 + (5 / 4) * N3) * delta;
  const mb = (3 * N_ELLIP + 3 * N2 + (21 / 8) * N3) * Math.sin(delta) * Math.cos(phi + LAT0);
  const mc = ((15 / 8) * N2 + (15 / 8) * N3) * Math.sin(2 * delta) * Math.cos(2 * (phi + LAT0));
  const md = (35 / 24) * N3 * Math.sin(3 * delta) * Math.cos(3 * (phi + LAT0));
  return AIRY_B * F0 * (ma - mb + mc - md);
}

function osgb36ToWgs84(latDeg: number, lonDeg: number): { lat: number; lon: number } {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const nu = AIRY_A / Math.sqrt(1 - AIRY_E2 * Math.sin(lat) ** 2);
  const x = nu * Math.cos(lat) * Math.cos(lon);
  const y = nu * Math.cos(lat) * Math.sin(lon);
  const z = (1 - AIRY_E2) * nu * Math.sin(lat);
  const x2 = HELMERT_TX + (1 + HELMERT_S) * x - HELMERT_RZ * y + HELMERT_RY * z;
  const y2 = HELMERT_TY + HELMERT_RZ * x + (1 + HELMERT_S) * y - HELMERT_RX * z;
  const z2 = HELMERT_TZ - HELMERT_RY * x + HELMERT_RX * y + (1 + HELMERT_S) * z;

  const wgsE2 = 1 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
  const p = Math.hypot(x2, y2);
  let phi = Math.atan2(z2, p * (1 - wgsE2));
  for (let i = 0; i < 8; i++) {
    const nuW = WGS84_A / Math.sqrt(1 - wgsE2 * Math.sin(phi) ** 2);
    phi = Math.atan2(z2 + wgsE2 * nuW * Math.sin(phi), p);
  }
  return { lat: (phi * 180) / Math.PI, lon: (Math.atan2(y2, x2) * 180) / Math.PI };
}

/** Convert an OSGB36 easting/northing to WGS84 latitude and longitude. */
export function bngToWgs84(easting: number, northing: number): { lat: number; lon: number } {
  if (!insideNationalGrid(easting, northing)) {
    throw new StreetManagerError(
      "malformed",
      "Easting and northing are outside the British National Grid",
    );
  }
  let phi = LAT0;
  let arc = 0;
  let converged = false;
  for (let i = 0; i < 10; i++) {
    phi += (northing - N0 - arc) / (AIRY_A * F0);
    arc = meridianArc(phi);
    if (Math.abs(northing - N0 - arc) < 0.00001) {
      converged = true;
      break;
    }
  }
  if (!converged) {
    throw new StreetManagerError("malformed", "National Grid conversion did not converge");
  }
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const tan2 = tanPhi * tanPhi;
  const tan4 = tan2 * tan2;
  const tan6 = tan4 * tan2;
  const nu = (AIRY_A * F0) / Math.sqrt(1 - AIRY_E2 * sinPhi * sinPhi);
  const rho = (AIRY_A * F0 * (1 - AIRY_E2)) / (1 - AIRY_E2 * sinPhi * sinPhi) ** 1.5;
  const eta2 = nu / rho - 1;
  const vii = tanPhi / (2 * rho * nu);
  const viii = (tanPhi / (24 * rho * nu ** 3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const ix = (tanPhi / (720 * rho * nu ** 5)) * (61 + 90 * tan2 + 45 * tan4);
  const x = 1 / cosPhi / nu;
  const xi = (1 / cosPhi / (6 * nu ** 3)) * (nu / rho + 2 * tan2);
  const xii = (1 / cosPhi / (120 * nu ** 5)) * (5 + 28 * tan2 + 24 * tan4);
  const xiia = (1 / cosPhi / (5040 * nu ** 7)) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);
  const dE = easting - E0;
  const lat = phi - vii * dE ** 2 + viii * dE ** 4 - ix * dE ** 6;
  const lon = LON0 + x * dE - xi * dE ** 3 + xii * dE ** 5 - xiia * dE ** 7;
  return osgb36ToWgs84((lat * 180) / Math.PI, (lon * 180) / Math.PI);
}

function parsePair(token: string): readonly [number, number] {
  const parts = token.split(/\s+/).filter((part) => part.length > 0);
  const eastText = parts[0];
  const northText = parts[1];
  if (parts.length !== 2 || eastText === undefined || northText === undefined) {
    throw new StreetManagerError(
      "permit",
      "Works location coordinates are not an easting and northing",
    );
  }
  const easting = Number(eastText);
  const northing = Number(northText);
  if (!insideNationalGrid(easting, northing)) {
    throw new StreetManagerError("permit", "Works location is outside the British National Grid");
  }
  return [easting, northing];
}

function parseWkt(wkt: string): readonly (readonly [number, number])[] {
  const trimmed = wkt.trim();
  const open = trimmed.indexOf("(");
  const close = trimmed.lastIndexOf(")");
  if (open < 0 || close !== trimmed.length - 1 || close <= open) {
    throw new StreetManagerError("permit", "Works location is not POINT or LINESTRING WKT");
  }
  const kind = trimmed.slice(0, open).trim().toUpperCase();
  const body = trimmed.slice(open + 1, close).trim();
  if (kind !== "POINT" && kind !== "LINESTRING") {
    throw new StreetManagerError("permit", "Works location is not POINT or LINESTRING WKT");
  }
  const tokens = body
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (tokens.length === 0 || (kind === "POINT" && tokens.length !== 1)) {
    throw new StreetManagerError("permit", "Works location coordinates are empty");
  }
  return tokens.map(parsePair);
}

function locationFromWkt(wkt: string): StreetManagerPoint {
  const pairs = parseWkt(wkt);
  let easting = 0;
  let northing = 0;
  for (const pair of pairs) {
    easting += pair[0];
    northing += pair[1];
  }
  easting /= pairs.length;
  northing /= pairs.length;
  const wgs84 = bngToWgs84(easting, northing);
  return { easting, northing, lat: wgs84.lat, lon: wgs84.lon, wkt };
}

function orNull(value: string | null | undefined): string | null {
  return value ?? null;
}

function permitFromEvent(event: PermitEvent): StreetManagerPermit {
  const data = permitDataSchema.safeParse(event.object_data);
  if (!data.success) {
    throw new StreetManagerError("permit", "Permit notification is missing a required field");
  }
  const fields = data.data;
  return {
    eventReference: event.event_reference,
    eventType: event.event_type,
    eventTime: event.event_time,
    objectReference: event.object_reference,
    permitReferenceNumber: fields.permit_reference_number,
    workReferenceNumber: fields.work_reference_number,
    highwayAuthority: fields.highway_authority,
    streetName: fields.street_name,
    town: orNull(fields.town),
    areaName: orNull(fields.area_name),
    workCategory: fields.work_category,
    trafficManagementType: fields.traffic_management_type,
    currentTrafficManagementType: orNull(fields.current_traffic_management_type),
    workStatus: orNull(fields.work_status),
    proposedStart: {
      date: orNull(fields.proposed_start_date),
      time: orNull(fields.proposed_start_time),
    },
    proposedEnd: {
      date: orNull(fields.proposed_end_date),
      time: orNull(fields.proposed_end_time),
    },
    actualStart: orNull(fields.actual_start_date_time),
    actualEnd: orNull(fields.actual_end_date_time),
    location: locationFromWkt(fields.works_location_coordinates),
  };
}

/** Parse a permit event object (the JSON inside an SNS Notification Message). */
export function parsePermitNotification(message: unknown): StreetManagerPermit {
  const event = eventSchema.safeParse(message);
  if (!event.success) {
    throw new StreetManagerError("malformed", "Notification is not a Street Manager event");
  }
  if (event.data.object_type !== "PERMIT") {
    throw new StreetManagerError("permit", "Notification is not a permit");
  }
  return permitFromEvent(event.data);
}

function snsUrl(value: string, code: "certificate" | "subscription", failure: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new StreetManagerError(code, failure);
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hostname !== SNS_HOST ||
    (url.port !== "" && url.port !== "443")
  ) {
    throw new StreetManagerError(code, failure);
  }
  return url;
}

function assertSigningCertUrl(value: string): void {
  const url = snsUrl(value, "certificate", "Signing certificate URL is not an AWS SNS certificate");
  if (
    url.search !== "" ||
    url.hash !== "" ||
    !/^\/SimpleNotificationService-[a-f0-9]+\.pem$/.test(url.pathname)
  ) {
    throw new StreetManagerError(
      "certificate",
      "Signing certificate URL is not an AWS SNS certificate",
    );
  }
}

function assertSubscribeUrl(value: string): string {
  const url = snsUrl(value, "subscription", "SubscribeURL is not an AWS SNS confirmation");
  if (
    (url.pathname !== "/" && url.pathname !== "") ||
    url.searchParams.get("Action") !== "ConfirmSubscription"
  ) {
    throw new StreetManagerError("subscription", "SubscribeURL is not an AWS SNS confirmation");
  }
  return value;
}

const certificateCache = new Map<string, string>();

async function httpsGet(
  fetchImpl: StreetManagerFetch,
  url: string,
  code: "certificate" | "subscription",
  failure: string,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new StreetManagerError(code, failure);
  }
}

async function loadSigningCertificate(url: string, options: StreetManagerOptions): Promise<string> {
  assertSigningCertUrl(url);
  if (options.loadCertificate) return options.loadCertificate(url);
  const cached = certificateCache.get(url);
  if (cached !== undefined) return cached;
  const response = await httpsGet(
    options.fetch ?? fetch,
    url,
    "certificate",
    "Signing certificate could not be fetched",
  );
  if (!response.ok) {
    throw new StreetManagerError("certificate", "Signing certificate request failed");
  }
  const pem = await response.text();
  if (!pem.includes("BEGIN CERTIFICATE")) {
    throw new StreetManagerError("certificate", "Signing certificate was not a PEM");
  }
  certificateCache.set(url, pem);
  return pem;
}

function verifySnsSignature(
  pem: string,
  payload: string,
  signature: string,
  version: "1" | "2",
): void {
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(pem);
  } catch {
    throw new StreetManagerError("certificate", "Signing certificate could not be read");
  }
  const skewMs = 5 * 60 * 1000;
  const from = Date.parse(certificate.validFrom);
  const to = Date.parse(certificate.validTo);
  const now = Date.now();
  if (Number.isNaN(from) || Number.isNaN(to) || from - skewMs > now || to + skewMs < now) {
    throw new StreetManagerError(
      "certificate",
      "Signing certificate is outside its validity window",
    );
  }
  if (certificate.publicKey.asymmetricKeyType !== "rsa") {
    throw new StreetManagerError("certificate", "Signing certificate is not RSA");
  }
  const verifier = createVerify(version === "1" ? "RSA-SHA1" : "RSA-SHA256");
  verifier.update(payload, "utf8");
  let valid = false;
  try {
    valid = verifier.verify(certificate.publicKey, signature, "base64");
  } catch {
    valid = false;
  }
  if (!valid) throw new StreetManagerError("signature", "SNS signature did not verify");
}

/**
 * Verify one raw SNS POST body, confirm a subscription, or parse a permit.
 * Activity and section 58 notifications are acknowledged as `ignored` so the
 * caller can return 200. A subscription is confirmed only after the signature
 * and the topic ARN both check out.
 */
export async function receiveStreetManagerMessage(
  rawBody: string,
  options: StreetManagerOptions = {},
): Promise<StreetManagerReceipt> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new StreetManagerError("malformed", "SNS body is not JSON");
  }
  const message = snsMessageSchema.safeParse(parsed);
  if (!message.success) {
    throw new StreetManagerError("malformed", "SNS message is not a Street Manager notification");
  }
  const allowed = streetManagerTopics(options.allowedTopicArns);
  const pem = await loadSigningCertificate(message.data.SigningCertURL, options);
  verifySnsSignature(
    pem,
    streetManagerStringToSign(message.data),
    message.data.Signature,
    message.data.SignatureVersion,
  );
  if (!allowed.includes(message.data.TopicArn)) {
    throw new StreetManagerError("topic", "Topic ARN is not a Street Manager topic");
  }

  if (message.data.Type === "SubscriptionConfirmation") {
    const url = assertSubscribeUrl(message.data.SubscribeURL);
    const response = await httpsGet(
      options.fetch ?? fetch,
      url,
      "subscription",
      "Street Manager subscription could not be confirmed",
    );
    if (!response.ok) {
      throw new StreetManagerError(
        "subscription",
        "Street Manager subscription confirmation was rejected",
      );
    }
    return {
      kind: "subscription_confirmed",
      topicArn: message.data.TopicArn,
      status: response.status,
    };
  }

  if (message.data.Type === "UnsubscribeConfirmation") {
    return { kind: "unsubscribe_confirmation", topicArn: message.data.TopicArn };
  }

  let eventJson: unknown;
  try {
    eventJson = JSON.parse(message.data.Message);
  } catch {
    throw new StreetManagerError("malformed", "Notification Message is not JSON");
  }
  const event = eventSchema.safeParse(eventJson);
  if (!event.success) {
    throw new StreetManagerError("malformed", "Notification is not a Street Manager event");
  }
  if (event.data.object_type !== "PERMIT") {
    return { kind: "ignored", topicArn: message.data.TopicArn, objectType: event.data.object_type };
  }
  return { kind: "permit", permit: permitFromEvent(event.data) };
}
