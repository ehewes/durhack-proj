import type { ReportOutput } from "@kip/shared/evidence";
import { StyleSheet, View } from "react-native";
import { Row, Section, space, Text } from "@/lib/ui";
import { DRAFT_GEMINI, DRAFT_TEMPLATE, REPORT_NO_EVENTS, REPORT_TITLE } from "../copy";
import { plural } from "../model";

/** The council report for one night: the qualifying events as rows, then the complaint draft. */
export function ReportCard({ report }: { report: ReportOutput }) {
  const empty = report.events.length === 0;
  return (
    <Section
      title={
        empty
          ? REPORT_TITLE
          : `${REPORT_TITLE}: ${plural(report.events.length, "construction event")} outside the council's recommended hours`
      }
      footer={report.note}
    >
      {empty ? (
        <View style={styles.pad}>
          <Text variant="subheadline">{REPORT_NO_EVENTS}</Text>
        </View>
      ) : null}
      {report.events.map((e) => (
        <Row
          key={e.id}
          title={e.localTime}
          leading="hammer"
          value={`${Math.round(e.relativeDb)} relative dB`}
        />
      ))}
      {!empty && report.draft ? (
        <View style={styles.pad}>
          <Text variant="subheadline">{report.draft}</Text>
          <Text variant="footnote">
            {report.draftSource === "gemini" ? DRAFT_GEMINI : DRAFT_TEMPLATE}
          </Text>
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({ pad: { padding: space.md, gap: space.sm } });
