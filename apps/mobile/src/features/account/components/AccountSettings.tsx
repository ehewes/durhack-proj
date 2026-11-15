import type { AccountView } from "@kip/shared/account";
import { router } from "expo-router";
import { StyleSheet } from "react-native";
import { Row, Section, space, Text } from "@/lib/ui";
import { CONSENT_TYPES, withChoice } from "../consent";
import {
  ACCOUNT_INTRO,
  CONSENT_HEADING,
  CONSENT_NOTE,
  DEMO_EVIDENCE,
  DEMO_EVIDENCE_DETAIL,
  DEMO_HEADING,
  DEMO_LIVE,
  DEMO_LIVE_DETAIL,
  PROFILE_HEADING,
  SAVE_CHANGE_ERROR,
} from "../copy";
import { useDeleteEverything, useSaveConsent, useSaveProfile } from "../hooks/useAccount";
import { ConsentQuestion } from "./ConsentQuestion";
import { DeleteEverything } from "./DeleteEverything";
import { ProfileQuestion } from "./ProfileQuestion";

/** The Account tab after onboarding: change any consent or the profile, or delete everything. */
export function AccountSettings({ view }: { view: AccountView }) {
  const saveConsent = useSaveConsent();
  const saveProfile = useSaveProfile();
  const remove = useDeleteEverything();
  // One account write at a time. Each save returns the whole account and setConsent needs all
  // three answers, so overlapping writes could bring back a consent the user just turned off,
  // or recreate the account after a delete.
  const saving = saveConsent.isPending || saveProfile.isPending;
  const writing = saving || remove.isPending;
  // A change shows straight away while it saves, and falls back to the stored answer if it fails.
  const consent = (saveConsent.isPending && saveConsent.variables) || view.consent;
  const profile =
    saveProfile.isPending && saveProfile.variables ? saveProfile.variables.profile : view.profile;

  return (
    <>
      <Text variant="subheadline" tone="secondary" style={styles.intro}>
        {ACCOUNT_INTRO}
      </Text>
      <Text variant="headline" accessibilityRole="header" style={styles.intro}>
        {CONSENT_HEADING}
      </Text>
      {CONSENT_TYPES.map((type) => (
        <ConsentQuestion
          key={type}
          type={type}
          detail="summary"
          answer={consent[type]}
          disabled={writing}
          onAnswer={(allowed) => {
            if (allowed !== consent[type]) saveConsent.mutate(withChoice(consent, type, allowed));
          }}
        />
      ))}
      <Text variant="footnote" style={styles.intro}>
        {CONSENT_NOTE}
      </Text>
      {saveConsent.isError ? <Text tone="danger">{SAVE_CHANGE_ERROR}</Text> : null}
      <Section title={PROFILE_HEADING}>
        <ProfileQuestion
          value={profile}
          disabled={writing}
          onChange={(next) => {
            if (next !== profile) saveProfile.mutate({ profile: next });
          }}
        />
      </Section>
      {saveProfile.isError ? <Text tone="danger">{SAVE_CHANGE_ERROR}</Text> : null}
      <Section title={DEMO_HEADING}>
        <Row
          title={DEMO_EVIDENCE}
          subtitle={DEMO_EVIDENCE_DETAIL}
          leading="checkmark.seal"
          chevron
          accessibilityRole="link"
          onPress={() => router.push("/evidence")}
        />
        <Row
          title={DEMO_LIVE}
          subtitle={DEMO_LIVE_DETAIL}
          leading="waveform"
          chevron
          accessibilityRole="link"
          onPress={() => router.push("/live")}
        />
      </Section>
      <DeleteEverything remove={remove} disabled={saving} />
    </>
  );
}

const styles = StyleSheet.create({ intro: { paddingHorizontal: space.md } });
