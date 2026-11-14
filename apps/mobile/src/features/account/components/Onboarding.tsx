import type { TravellerProfile } from "@kip/shared/domain";
import { useState } from "react";
import { Button, Card, Text } from "@/lib/ui";
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
import { Heading } from "./Heading";
import { ProfileQuestion } from "./ProfileQuestion";

/**
 * First launch: one step per data type, then the Quiet Stays profile, saved together at the end.
 * It never asks iOS for a permission itself; features do that once `useHasConsent` is true.
 */
export function Onboarding({ savedProfile }: { savedProfile: TravellerProfile | null }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ConsentDraft>(EMPTY_DRAFT);
  const [profile, setProfile] = useState<TravellerProfile | null>(savedProfile);
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
        <Card>
          <Heading>{DELETED_TITLE}</Heading>
          <Text>{deletionSummary(deleted)}</Text>
        </Card>
      ) : null}
      <Text variant="caption">{stepLine(step + 1, ONBOARDING_STEPS.length)}</Text>
      {step === 0 ? (
        <>
          <Text variant="title">{ONBOARDING_TITLE}</Text>
          <Text>{ONBOARDING_INTRO}</Text>
        </>
      ) : null}
      {current === "profile" ? (
        <>
          <Card>
            <Heading>{PROFILE_TITLE}</Heading>
            <Text>{PROFILE_QUESTION}</Text>
            <Text variant="caption">{PROFILE_INTRO}</Text>
            <ProfileQuestion value={profile} onChange={setProfile} disabled={busy} />
          </Card>
          {busy ? <Text variant="caption">{SAVING}</Text> : null}
          {finish.isError ? <Text>{SAVE_ERROR}</Text> : null}
          <Button
            label={FINISH}
            onPress={() => save(profile)}
            disabled={busy || !choices || !profile}
          />
          <Button
            label={SKIP_PROFILE}
            variant="secondary"
            onPress={() => save(null)}
            disabled={busy || !choices}
          />
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
        <Button
          label={BACK}
          variant="secondary"
          onPress={() => setStep(step - 1)}
          disabled={busy}
        />
      ) : null}
    </>
  );
}
