import type { AccountView } from "@kip/shared/account";
import { Text } from "@/lib/ui";
import { CONSENT_TYPES, withChoice } from "../consent";
import {
  ACCOUNT_INTRO,
  ACCOUNT_TITLE,
  CONSENT_HEADING,
  CONSENT_NOTE,
  PROFILE_HEADING,
  SAVE_CHANGE_ERROR,
} from "../copy";
import { useDeleteEverything, useSaveConsent, useSaveProfile } from "../hooks/useAccount";
import { ConsentQuestion } from "./ConsentQuestion";
import { DeleteEverything } from "./DeleteEverything";
import { Heading } from "./Heading";
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
      <Text variant="title">{ACCOUNT_TITLE}</Text>
      <Text variant="caption">{ACCOUNT_INTRO}</Text>
      <Heading>{CONSENT_HEADING}</Heading>
      <Text variant="caption">{CONSENT_NOTE}</Text>
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
      {saveConsent.isError ? <Text>{SAVE_CHANGE_ERROR}</Text> : null}
      <Heading>{PROFILE_HEADING}</Heading>
      <ProfileQuestion
        value={profile}
        disabled={writing}
        onChange={(next) => {
          if (next !== profile) saveProfile.mutate({ profile: next });
        }}
      />
      {saveProfile.isError ? <Text>{SAVE_CHANGE_ERROR}</Text> : null}
      <DeleteEverything remove={remove} disabled={saving} />
    </>
  );
}
