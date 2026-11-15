import type { TravellerProfile } from "@kip/shared/domain";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Notice, Section, StatusView, space, Text } from "@/lib/ui";
import { answer, type ConsentDraft, draftChoices, EMPTY_DRAFT, ONBOARDING_STEPS } from "../consent";
import {
  BACK,
  DELETED_TITLE,
  deletionSummary,
  FINISH,
  ONBOARDING_INTRO,
  ONBOARDING_TITLE,
  PROFILE_INTRO,
  PROFILE_QUESTION,
  PROFILE_TITLE,
  SAVE_ERROR,
  SAVING,
  SKIP_PROFILE,
  stepLine,
} from "../copy";
import { useFinishOnboarding, useLastDeletion } from "../hooks/useAccount";
import { ConsentQuestion } from "./ConsentQuestion";
import { ProfileQuestion } from "./ProfileQuestion";

/**
 * First launch: one step per data type, then the Quiet Stays profile, saved together at the end.
 * It never asks iOS for a permission itself; features do that once `useHasConsent` is true.
 */
export function Onboarding({ savedProfile }: { savedProfile: TravellerProfile | null }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ConsentDraft>(EMPTY_DRAFT);
  const [picked, setPicked] = useState<TravellerProfile | null>(null);
  // A profile stored by an earlier, unfinished attempt shows as chosen until the user picks.
  const profile = picked ?? savedProfile;
  const finish = useFinishOnboarding();
  const deleted = useLastDeletion();
  const current = ONBOARDING_STEPS[step] ?? "profile";
  const choices = draftChoices(draft);
  const busy = finish.isPending;

  const save = (chosen: TravellerProfile | null) => {
    if (choices) finish.mutate({ consent: choices, profile: chosen });
  };

  return (
    <>
      {deleted && step === 0 ? (
        <Notice message={`${DELETED_TITLE}. ${deletionSummary(deleted)}`} icon="checkmark.circle" />
      ) : null}
      <View style={styles.header}>
        <Text variant="footnote" numeric>
          {stepLine(step + 1, ONBOARDING_STEPS.length)}
        </Text>
        {step === 0 ? (
          <>
            <Text variant="largeTitle">{ONBOARDING_TITLE}</Text>
            <Text variant="callout" tone="secondary">
              {ONBOARDING_INTRO}
            </Text>
          </>
        ) : null}
      </View>
      {current === "profile" ? (
        <>
          <Section title={PROFILE_TITLE} footer={PROFILE_INTRO}>
            <View style={styles.pad}>
              <Text variant="headline">{PROFILE_QUESTION}</Text>
            </View>
            <ProfileQuestion value={profile} onChange={setPicked} disabled={busy} />
          </Section>
          {busy ? <StatusView kind="loading" message={SAVING} /> : null}
          {finish.isError ? <Text tone="danger">{SAVE_ERROR}</Text> : null}
          <View style={styles.actions}>
            <Button
              label={FINISH}
              onPress={() => save(profile)}
              disabled={busy || !choices || !profile}
            />
            {/* There is no way to clear a stored profile, so a stored one cannot be skipped. */}
            {savedProfile === null ? (
              <Button
                label={SKIP_PROFILE}
                variant="secondary"
                onPress={() => save(null)}
                disabled={busy || !choices}
              />
            ) : null}
          </View>
        </>
      ) : (
        <ConsentQuestion
          type={current}
          detail="full"
          answer={draft[current]}
          onAnswer={(allowed) => {
            setDraft(answer(draft, current, allowed));
            setStep(step + 1);
          }}
        />
      )}
      {step > 0 ? (
        <Button label={BACK} variant="plain" onPress={() => setStep(step - 1)} disabled={busy} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm, paddingHorizontal: space.xs },
  pad: { padding: space.md },
  actions: { gap: space.sm },
});
