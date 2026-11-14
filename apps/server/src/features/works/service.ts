import { isInNewcastleArea } from "@kip/shared/works";
import {
  receiveStreetManagerMessage,
  STREET_MANAGER_TOPIC_ARNS,
  StreetManagerError,
  type StreetManagerOptions,
} from "../../integrations/street-manager";
import { permitToWork } from "./document";
import type { StreetManagerPost } from "./post";
import { worksRepository } from "./repo";

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

  const permit = receipt.permit;
  if (!isInNewcastleArea(permit.location.lat, permit.location.lon)) {
    return {
      status: 200,
      body: {
        ok: true,
        kind: "permit",
        stored: false,
        permitReferenceNumber: permit.permitReferenceNumber,
        reason: "outside_newcastle",
      },
    };
  }

  const work = permitToWork(permit, { simulated: false });
  await worksRepository().upsert(work);
  return {
    status: 200,
    body: {
      ok: true,
      kind: "permit",
      stored: true,
      permitReferenceNumber: work.permitReferenceNumber,
      nightWork: work.nightWork,
    },
  };
}
