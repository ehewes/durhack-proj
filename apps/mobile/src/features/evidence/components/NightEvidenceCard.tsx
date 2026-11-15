import type { ReportOutput, VerifyOutput } from "@kip/shared/evidence";
import { Linking, StyleSheet, View } from "react-native";
import { Button, Card, space, Text, useColors } from "@/lib/ui";
import { MATCH_BODY, MISMATCH_BODY, MISMATCH_OTHER_NIGHT, NOT_ANCHORED_BODY } from "../copy";
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
  const colors = useColors();
  const { evidence } = night;
  const signature = evidence.memoSignature;
  const result = verify.result;
  return (
    <Card>
      <Text variant="body">{night.night}</Text>
      <Text variant="caption">
        {plural(night.eventCount, "noise event")}, {night.outsideRecommendedHoursCount} outside the
        council's recommended hours
      </Text>
      {signature ? (
        <>
          {evidence.hash && <Text variant="caption">Hash {shortHash(evidence.hash)}</Text>}
          <Button
            variant="secondary"
            label="Open in Solana Explorer"
            onPress={() => void Linking.openURL(explorerUrl(signature))}
          />
          <Button
            label={verify.pending ? "Checking" : "Check this night"}
            disabled={verify.pending}
            onPress={onVerify}
          />
          <Button
            variant="secondary"
            label={report.pending ? "Preparing report" : "Show report"}
            disabled={report.pending}
            onPress={onReport}
          />
        </>
      ) : (
        <Button
          label={anchorPending ? "Anchoring" : "Anchor this night"}
          disabled={anchorPending}
          onPress={onAnchor}
        />
      )}
      {anchorFailed && <Text variant="caption">We could not anchor this night. Try again.</Text>}
      {verify.failed && <Text variant="caption">We could not check this night. Try again.</Text>}
      {report.failed && <Text variant="caption">We could not prepare the report. Try again.</Text>}
      {report.result && <ReportCard report={report.result} />}
      {result && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.result,
            { borderColor: result.status === "mismatch" ? colors.text : colors.border },
          ]}
        >
          <Text variant="body">{verifyHeadline(result.status)}</Text>
          <Text variant="caption">{BODY[result.status]}</Text>
          {result.anchoredHash ? (
            <Text variant="caption">Anchored {shortHash(result.anchoredHash)}</Text>
          ) : (
            result.status === "mismatch" && <Text variant="caption">{MISMATCH_OTHER_NIGHT}</Text>
          )}
          <Text variant="caption">Now {shortHash(result.currentHash)}</Text>
          <Text variant="caption">{result.note}</Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  result: { borderLeftWidth: 3, paddingLeft: space.sm, gap: space.xs },
});
