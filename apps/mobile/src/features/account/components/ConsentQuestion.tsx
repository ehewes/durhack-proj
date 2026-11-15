import { StyleSheet, View } from "react-native";
import { Card, space, Text } from "@/lib/ui";
import type { ConsentType } from "../consent";
import { CONSENT_COPY, DONT_ALLOW, IPHONE_CONFIRMS } from "../copy";
import { Choice } from "./Choice";
import { Heading } from "./Heading";

type Props = {
  type: ConsentType;
  /** null until the user answers */
  answer: boolean | null;
  onAnswer: (allowed: boolean) => void;
  /** "full" asks the question with the whole explanation; "summary" is the Account tab's line */
  detail: "full" | "summary";
  disabled?: boolean;
};

/** One data type, asked on its own with its own yes and no. */
export function ConsentQuestion({ type, answer, onAnswer, detail, disabled = false }: Props) {
  const copy = CONSENT_COPY[type];
  return (
    <Card>
      <Heading>{copy.name}</Heading>
      {detail === "full" ? (
        <>
          <Text>{copy.question}</Text>
          {copy.explain.map((paragraph) => (
            <Text key={paragraph}>{paragraph}</Text>
          ))}
          <Text variant="caption">{IPHONE_CONFIRMS}</Text>
        </>
      ) : (
        <Text variant="caption">{copy.summary}</Text>
      )}
      <View accessibilityRole="radiogroup" accessibilityLabel={copy.name} style={styles.choices}>
        <Choice
          label={copy.allow}
          selected={answer === true}
          onPress={() => onAnswer(true)}
          disabled={disabled}
        />
        <Choice
          label={DONT_ALLOW}
          selected={answer === false}
          onPress={() => onAnswer(false)}
          disabled={disabled}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  choices: { gap: space.sm, marginTop: space.xs },
});
