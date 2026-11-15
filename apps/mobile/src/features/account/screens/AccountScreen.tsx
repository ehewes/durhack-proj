import { StyleSheet, View } from "react-native";
import { Screen, Section, StatusView, space } from "@/lib/ui";
import { AccountSettings } from "../components/AccountSettings";
import { LOAD_ERROR, LOADING, TRY_AGAIN } from "../copy";
import { useAccount } from "../hooks/useAccount";

/**
 * The Account tab. The tabs layout already wraps every tab in ConsentGate, so onboarding is done
 * by the time this shows; errors come through here.
 */
export function AccountScreen() {
  const account = useAccount();
  return (
    <Screen underHeader>
      {account.status === "ready" ? (
        <AccountSettings view={account.view} />
      ) : account.status === "error" ? (
        <Section>
          <View style={styles.pad}>
            <StatusView
              kind="error"
              message={LOAD_ERROR}
              retryLabel={TRY_AGAIN}
              onRetry={account.retry}
            />
          </View>
        </Section>
      ) : (
        <StatusView kind="loading" message={LOADING} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ pad: { paddingHorizontal: space.md } });
