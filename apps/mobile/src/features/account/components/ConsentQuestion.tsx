import { StyleSheet, View } from "react-native";
import { hairline, Section, space, Text, useColors } from "@/lib/ui";
import type { ConsentType } from "../consent";
import { CONSENT_COPY, DONT_ALLOW, IPHONE_CONFIRMS } from "../copy";
import { Choice } from "./Choice";

type Props = {
  type: ConsentType;
  /** null until the user answers */
  answer: boolean | null;
  onAnswer: (allowed: boolean) => void;
  /** "full" asks the question with the whole explanation; "summary" is the Account tab's line */
  detail: "full" | "summary";
  disabled?: boolean;
};

/** One data type, asked on its own with its own yes and no, as a grouped section. */
export function ConsentQuestion({ type, answer, onAnswer, detail, disabled = false }: Props) {
  const colors = useColors();
  const copy = CONSENT_COPY[type];
  return (
    <Section title={copy.name} footer={detail === "full" ? IPHONE_CONFIRMS : copy.summary}>
      {detail === "full" ? (
        <View style={styles.explain}>
          <Text variant="headline">{copy.question}</Text>
          {copy.explain.map((paragraph) => (
            <Text key={paragraph} variant="subheadline">
              {paragraph}
            </Text>
          ))}
        </View>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={copy.name}>
        <Choice
          label={copy.allow}
          selected={answer === true}
          onPress={() => onAnswer(true)}
          disabled={disabled}
        />
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
        <Choice
          label={DONT_ALLOW}
          selected={answer === false}
          onPress={() => onAnswer(false)}
          disabled={disabled}
        />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  explain: { padding: space.md, gap: space.sm },
  separator: { height: hairline, marginLeft: space.md },
});
