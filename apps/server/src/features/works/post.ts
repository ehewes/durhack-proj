/** JSON we return to AWS SNS. Status outside 2xx makes SNS deliver again. */
export type StreetManagerPost =
  | {
      status: 200;
      body:
        | { ok: true; kind: "subscription_confirmed"; topicArn: string }
        | { ok: true; kind: "unsubscribe_confirmation"; topicArn: string }
        | { ok: true; kind: "ignored"; topicArn: string; objectType: string }
        | {
            ok: true;
            kind: "permit";
            stored: boolean;
            permitReferenceNumber: string;
            nightWork?: boolean;
            reason?: "outside_newcastle";
          };
    }
  | { status: 400 | 403 | 502; body: { ok: false; error: string } };
