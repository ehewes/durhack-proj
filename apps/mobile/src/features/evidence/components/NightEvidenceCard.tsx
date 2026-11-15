import type { ReportOutput, VerifyOutput } from "@kip/shared/evidence";
import { Linking, StyleSheet, View } from "react-native";
import { Icon, Row, Section, space, Text } from "@/lib/ui";
import {
  ANCHOR_ERROR,
  MATCH_BODY,
  MISMATCH_BODY,
  MISMATCH_OTHER_NIGHT,
  NOT_ANCHORED_BODY,
  REPORT_ERROR,
  VERIFY_ERROR,
} from "../copy";
import { type EvidenceNight, explorerUrl, plural, shortHash, verifyHeadline } from "../model";
import { ReportCard } from "./ReportCard";

type Props = {
  night: EvidenceNight;
  verify: { pending: boolean; failed: boolean; result: VerifyOutput | undefined };
  report: { pending: boolean; failed: boolean; result: ReportOutput | undefined };
  anchorPending: boolean;
  anchorFailed: boolean;
  onVerify: () => void;
  onReport: () => void;
  onAnchor: () => void;
};

const BODY = { match: MATCH_BODY, mismatch: MISMATCH_BODY, "not-anchored": NOT_ANCHORED_BODY };
const SEAL = {
  match: "checkmark.seal.fill",
  mismatch: "xmark.seal.fill",
  "not-anchored": "seal",
} as const;

/** One night: its hash on Solana, the tamper check and the council report, as a grouped section. */
export function NightEvidenceCard({
  night,
  verify,
  report,
  anchorPending,
  anchorFailed,
  onVerify,
  onReport,
  onAnchor,
}: Props) {
  const { evidence } = night;
  const signature = evidence.memoSignature;
  const result = verify.result;
  const errors = [
    anchorFailed ? ANCHOR_ERROR : null,
    verify.failed ? VERIFY_ERROR : null,
    report.failed ? REPORT_ERROR : null,
  ].filter((e): e is string => e !== null);
  return (
    <>
      <Section
        title={night.night}
        footer={`${plural(night.eventCount, "noise event")}, ${night.outsideRecommendedHoursCount} outside the council's recommended hours`}
      >
        {signature ? (
          <>
            {evidence.hash ? (
              <Row title="Log hash" leading="number" value={shortHash(evidence.hash)} />
            ) : null}
            <Row
              title="Open in Solana Explorer"
              leading="arrow.up.right.square"
              tone="accent"
              chevron
              accessibilityRole="link"
              onPress={() => void Linking.openURL(explorerUrl(signature))}
            />
            <Row
              title={verify.pending ? "Checking" : "Check this night"}
              leading="checkmark.shield"
              tone="accent"
              onPress={verify.pending ? undefined : onVerify}
            />
            <Row
              title={report.pending ? "Preparing report" : "Show report"}
              leading="doc.text"
              tone="accent"
              onPress={report.pending ? undefined : onReport}
            />
          </>
        ) : (
          <Row
            title={anchorPending ? "Anchoring" : "Anchor this night"}
            leading="link"
            tone="accent"
            onPress={anchorPending ? undefined : onAnchor}
          />
        )}
        {result ? (
          <View accessibilityLiveRegion="polite" style={styles.result}>
            <View style={styles.headline}>
              <Icon
                name={SEAL[result.status]}
                size={22}
                tone={result.status === "mismatch" ? "danger" : "accent"}
              />
              <Text variant="headline">{verifyHeadline(result.status)}</Text>
            </View>
            <Text variant="subheadline">{BODY[result.status]}</Text>
            {result.anchoredHash ? (
              <Text variant="footnote" numeric>{`Anchored ${shortHash(result.anchoredHash)}`}</Text>
            ) : (
              result.status === "mismatch" && <Text variant="footnote">{MISMATCH_OTHER_NIGHT}</Text>
            )}
            <Text variant="footnote" numeric>{`Now ${shortHash(result.currentHash)}`}</Text>
            <Text variant="footnote">{result.note}</Text>
          </View>
        ) : null}
        {errors.length > 0 ? (
          <View style={styles.result}>
            {errors.map((e) => (
              <Text key={e} variant="subheadline" tone="danger">
                {e}
              </Text>
            ))}
          </View>
        ) : null}
      </Section>
      {report.result ? <ReportCard report={report.result} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  result: { padding: space.md, gap: space.xs },
  headline: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
