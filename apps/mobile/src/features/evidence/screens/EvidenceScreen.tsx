import { EVIDENCE_NOTE, type ReportOutput, type VerifyOutput } from "@kip/shared/evidence";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTRPC, useTRPCClient } from "@/lib/trpc";
import { Screen, Section, StatusView, space, Text } from "@/lib/ui";
import { NightEvidenceCard } from "../components/NightEvidenceCard";
import { EMPTY_BODY, EMPTY_TITLE, EVIDENCE_INTRO, LOAD_ERROR, LOADING, TRY_AGAIN } from "../copy";
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
    <Screen underHeader>
      <View style={styles.intro}>
        <Text variant="subheadline" tone="secondary">
          {EVIDENCE_INTRO}
        </Text>
        <Text variant="footnote">{EVIDENCE_NOTE}</Text>
      </View>
      {list.isPending && <StatusView kind="loading" message={LOADING} />}
      {list.isError && (
        <Section>
          <View style={styles.pad}>
            <StatusView
              kind="error"
              message={LOAD_ERROR}
              retryLabel={TRY_AGAIN}
              onRetry={() => void list.refetch()}
            />
          </View>
        </Section>
      )}
      {list.isSuccess && nights.length === 0 && (
        <Section>
          <View style={styles.pad}>
            <StatusView kind="empty" title={EMPTY_TITLE} message={EMPTY_BODY} />
          </View>
        </Section>
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

const styles = StyleSheet.create({
  intro: { gap: space.xs, paddingHorizontal: space.xs },
  pad: { paddingHorizontal: space.md },
});
