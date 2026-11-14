import { Button, Card, Screen, Text } from "@/lib/ui";
import { AccountSettings } from "../components/AccountSettings";
import { Onboarding } from "../components/Onboarding";
import { ACCOUNT_TITLE, LOAD_ERROR, LOADING, TRY_AGAIN } from "../copy";
import { useAccount } from "../hooks/useAccount";

/** The Account tab: onboarding until the user has made their consent choices, then settings. */
export function AccountScreen() {
  const account = useAccount();
  return (
    <Screen>
      {account.status === "loading" ? (
        <>
          <Text variant="title">{ACCOUNT_TITLE}</Text>
          <Text variant="caption">{LOADING}</Text>
        </>
      ) : null}
      {account.status === "error" ? (
        <>
          <Text variant="title">{ACCOUNT_TITLE}</Text>
          <Card>
            <Text>{LOAD_ERROR}</Text>
            <Button label={TRY_AGAIN} onPress={account.retry} />
          </Card>
        </>
      ) : null}
      {account.status === "onboarding" ? <Onboarding savedProfile={account.view.profile} /> : null}
      {account.status === "ready" ? <AccountSettings view={account.view} /> : null}
    </Screen>
  );
}
