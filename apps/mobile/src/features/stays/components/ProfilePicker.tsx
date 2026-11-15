import { TRAVELLER_PROFILES, type TravellerProfile } from "@kip/shared/domain";
import { SegmentedControl } from "@/lib/ui";
import { PROFILE_LABEL, PROFILE_TITLE } from "../copy";

type Props = {
  profile: TravellerProfile;
  onChange: (profile: TravellerProfile) => void;
};

const OPTIONS = TRAVELLER_PROFILES.map((value) => ({ value, label: PROFILE_LABEL[value] }));

/** Four profiles as a segmented control. The ranking re-sorts when this changes. */
export function ProfilePicker({ profile, onChange }: Props) {
  return (
    <SegmentedControl
      options={OPTIONS}
      value={profile}
      onChange={onChange}
      accessibilityLabel={PROFILE_TITLE}
    />
  );
}
