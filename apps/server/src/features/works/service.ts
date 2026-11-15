import { isInNewcastleArea } from "@kip/shared/works";
import {
  receiveStreetManagerMessage,
  STREET_MANAGER_TOPIC_ARNS,
  StreetManagerError,
  type StreetManagerOptions,
  type StreetManagerPermit,
} from "../../integrations/street-manager";
import { permitToWork } from "./document";
import type { StreetManagerPost } from "./post";
import { type WorksWrite, worksRepository } from "./repo";

const topics = Object.values(STREET_MANAGER_TOPIC_ARNS);

let streetManagerOptions: StreetManagerOptions = {};

/** Tests pass a signing certificate and a fake fetch. Production uses the defaults. */
export function setStreetManagerOptions(options: StreetManagerOptions | undefined): void {
  streetManagerOptions = options ?? {};
}

function failure(error: StreetManagerError): StreetManagerPost {
  if (error.code === "malformed" || error.code === "permit") {
    return { status: 400, body: { ok: false, error: error.code } };
  }
  if (error.code === "subscription") {
    return { status: 502, body: { ok: false, error: error.code } };
  }
  return { status: 403, body: { ok: false, error: error.code } };
}

export type StorePermitResult =
  | { stored: true; permitReferenceNumber: string; nightWork: boolean; write: WorksWrite }
  | { stored: false; permitReferenceNumber: string; reason: "outside_newcastle" };

/**
 * Keeps a Newcastle permit in `works` and drops the rest of England. Live SNS permits and
 * the sample loaded by `seed:works` both come through here. `simulated` labels sample data
 * and is never true for a live permit.
 */
export async function storePermit(
  permit: StreetManagerPermit,
  options: { simulated: boolean },
): Promise<StorePermitResult> {
  if (!isInNewcastleArea(permit.location.lat, permit.location.lon)) {
    return {
      stored: false,
      permitReferenceNumber: permit.permitReferenceNumber,
      reason: "outside_newcastle",
    };
  }
  const work = permitToWork(permit, options);
  const write = await worksRepository().upsert(work);
  return {
    stored: true,
    permitReferenceNumber: work.permitReferenceNumber,
    nightWork: work.nightWork,
    write,
  };
}

/**
 * One SNS POST. Confirms a subscription, stores a Newcastle permit, and
 * answers 200 for anything Street Manager should not retry.
 */
export async function receiveStreetManagerPost(rawBody: string): Promise<StreetManagerPost> {
  let receipt: Awaited<ReturnType<typeof receiveStreetManagerMessage>>;
  try {
    receipt = await receiveStreetManagerMessage(rawBody, {
      allowedTopicArns: topics,
      ...streetManagerOptions,
    });
  } catch (error) {
    if (error instanceof StreetManagerError) return failure(error);
    throw error;
  }

  if (receipt.kind === "subscription_confirmed") {
    return {
      status: 200,
      body: { ok: true, kind: "subscription_confirmed", topicArn: receipt.topicArn },
    };
  }
  if (receipt.kind === "unsubscribe_confirmation") {
    return {
      status: 200,
      body: { ok: true, kind: "unsubscribe_confirmation", topicArn: receipt.topicArn },
    };
  }
  if (receipt.kind === "ignored") {
    return {
      status: 200,
      body: {
        ok: true,
        kind: "ignored",
        topicArn: receipt.topicArn,
        objectType: receipt.objectType,
      },
    };
  }

  const result = await storePermit(receipt.permit, { simulated: false });
  if (!result.stored) {
    return {
      status: 200,
      body: {
        ok: true,
        kind: "permit",
        stored: false,
        permitReferenceNumber: result.permitReferenceNumber,
        reason: result.reason,
      },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      kind: "permit",
      stored: true,
      permitReferenceNumber: result.permitReferenceNumber,
      nightWork: result.nightWork,
    },
  };
}
