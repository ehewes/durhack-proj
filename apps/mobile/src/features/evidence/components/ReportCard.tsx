import type { ReportOutput } from "@kip/shared/evidence";
import { Card, Text } from "@/lib/ui";
import { DRAFT_GEMINI, DRAFT_TEMPLATE, REPORT_NO_EVENTS, REPORT_TITLE } from "../copy";
import { plural } from "../model";

export function ReportCard({ report }: { report: ReportOutput }) {
  return (
    <Card>
      <Text variant="body">{REPORT_TITLE}</Text>
      {report.events.length === 0 ? (
        <Text>{REPORT_NO_EVENTS}</Text>
      ) : (
        <>
          <Text>
            {plural(report.events.length, "construction event")} outside the council's recommended
            hours:
          </Text>
          {report.events.map((e) => (
            <Text key={e.id}>
              {e.localTime}, {Math.round(e.relativeDb)} relative dB
            </Text>
          ))}
          {report.draft && (
            <>
              <Text>{report.draft}</Text>
              <Text variant="caption">
                {report.draftSource === "gemini" ? DRAFT_GEMINI : DRAFT_TEMPLATE}
              </Text>
            </>
          )}
        </>
      )}
      <Text variant="caption">{report.note}</Text>
    </Card>
  );
}
