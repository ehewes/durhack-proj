import { Button, Card, Screen, Text } from "@/lib/ui";
import { AccountSettings } from "../components/AccountSettings";
import { ConsentGate } from "../components/ConsentGate";
import { ACCOUNT_TITLE, LOAD_ERROR, LOADING, TRY_AGAIN } from "../copy";
import { useAccount } from "../hooks/useAccount";

/**
 * The Account tab. ConsentGate shows onboarding until the user has made their consent choices,
 * here and (once a route wraps the tabs in it) app-wide, so there is one onboarding.
 */
export function AccountScreen() {
  return (
    <ConsentGate>
      <AccountTab />
    </ConsentGate>
  );
}

/** Settings once the user has answered; the gate lets errors through, so they show here. */
function AccountTab() {
  const account = useAccount();
  return (
    <Screen>
      {account.status === "ready" ? (
        <AccountSettings view={account.view} />
      ) : (
        <>
          <Text variant="title">{ACCOUNT_TITLE}</Text>
          {account.status === "error" ? (
            <Card>
              <Text>{LOAD_ERROR}</Text>
              <Button label={TRY_AGAIN} onPress={account.retry} />
            </Card>
          ) : (
            <Text variant="caption">{LOADING}</Text>
          )}
        </>
      )}
    </Screen>
  );
}
