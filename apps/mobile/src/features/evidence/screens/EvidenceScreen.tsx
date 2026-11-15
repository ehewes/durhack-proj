import { EVIDENCE_NOTE, type ReportOutput, type VerifyOutput } from "@kip/shared/evidence";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC, useTRPCClient } from "@/lib/trpc";
import { Button, Card, Screen, Text } from "@/lib/ui";
import { NightEvidenceCard } from "../components/NightEvidenceCard";
import { EMPTY_BODY, EMPTY_TITLE, EVIDENCE_INTRO } from "../copy";
import { type EvidenceNight, sortNights } from "../model";

type Busy = Record<string, "pending" | "failed" | undefined>;

export function EvidenceScreen() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const list = useQuery({ ...trpc.night.list.queryOptions(), retry: false });
  const [checking, setChecking] = useState<Busy>({});
  const [reporting, setReporting] = useState<Busy>({});
  const [anchoring, setAnchoring] = useState<Busy>({});
  const [results, setResults] = useState<Record<string, VerifyOutput | undefined>>({});
  const [reports, setReports] = useState<Record<string, ReportOutput | undefined>>({});

  async function onVerify(nightId: string) {
    setChecking((s) => ({ ...s, [nightId]: "pending" }));
    setResults((s) => ({ ...s, [nightId]: undefined }));
    try {
      const result = await client.evidence.verify.query({ nightId });
      setResults((s) => ({ ...s, [nightId]: result }));
      setChecking((s) => ({ ...s, [nightId]: undefined }));
    } catch {
      setChecking((s) => ({ ...s, [nightId]: "failed" }));
    }
  }

  async function onReport(nightId: string) {
    setReporting((s) => ({ ...s, [nightId]: "pending" }));
    try {
      const report = await client.evidence.report.query({ nightId });
      setReports((s) => ({ ...s, [nightId]: report }));
      setReporting((s) => ({ ...s, [nightId]: undefined }));
    } catch {
      setReporting((s) => ({ ...s, [nightId]: "failed" }));
    }
  }

  async function onAnchor(nightId: string) {
    setAnchoring((s) => ({ ...s, [nightId]: "pending" }));
    try {
      await client.evidence.anchor.mutate({ nightId });
      setAnchoring((s) => ({ ...s, [nightId]: undefined }));
      setResults((s) => ({ ...s, [nightId]: undefined }));
      await queryClient.invalidateQueries({ queryKey: trpc.night.list.queryKey() });
    } catch {
      setAnchoring((s) => ({ ...s, [nightId]: "failed" }));
    }
  }

  const nights = sortNights((list.data ?? []) as EvidenceNight[]);
  return (
    <Screen>
      <Text variant="title">Evidence log</Text>
      <Text>{EVIDENCE_INTRO}</Text>
      <Text variant="caption">{EVIDENCE_NOTE}</Text>
      {list.isPending && <Text variant="caption">Loading your nights.</Text>}
      {list.isError && (
        <Card>
          <Text>We could not load your nights.</Text>
          <Button label="Try again" onPress={() => void list.refetch()} />
        </Card>
      )}
      {list.isSuccess && nights.length === 0 && (
        <Card>
          <Text variant="body">{EMPTY_TITLE}</Text>
          <Text variant="caption">{EMPTY_BODY}</Text>
        </Card>
      )}
      {nights.map((night) => (
        <NightEvidenceCard
          key={night.nightId}
          night={night}
          verify={{
            pending: checking[night.nightId] === "pending",
            failed: checking[night.nightId] === "failed",
            result: results[night.nightId],
          }}
          report={{
            pending: reporting[night.nightId] === "pending",
            failed: reporting[night.nightId] === "failed",
            result: reports[night.nightId],
          }}
          anchorPending={anchoring[night.nightId] === "pending"}
          anchorFailed={anchoring[night.nightId] === "failed"}
          onVerify={() => void onVerify(night.nightId)}
          onReport={() => void onReport(night.nightId)}
          onAnchor={() => void onAnchor(night.nightId)}
        />
      ))}
    </Screen>
  );
}
