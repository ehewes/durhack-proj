import { Card, Text } from "@/lib/ui";
import { REPORT_NOTE, REPORT_TITLE } from "../copy";
import { plural, type Report } from "../model";

export function ReportCard({ report }: { report: Report }) {
  return (
    <Card>
      <Text variant="body">{REPORT_TITLE}</Text>
      <Text>
        {plural(report.nights, "anchored night")}: {plural(report.events, "noise event")},{" "}
        {report.outsideHours} outside the council's recommended hours,{" "}
        {plural(report.wakeUps, "wake-up")}.
      </Text>
      <Text variant="caption">{REPORT_NOTE}</Text>
    </Card>
  );
}
