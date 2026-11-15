import type { ReactNode } from "react";
import { Screen, StatusView } from "@/lib/ui";
import { LOADING } from "../copy";
import { useAccount } from "../hooks/useAccount";
import { Onboarding } from "./Onboarding";

/**
 * Shows onboarding until the user has made their consent choices, then `children`. Render it
 * inside the tRPC provider. If the account cannot load, `children` show with every consent off,
 * so nothing asks iOS for a permission.
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const account = useAccount();
  if (account.status === "loading") {
    return (
      <Screen>
        <StatusView kind="loading" message={LOADING} />
      </Screen>
    );
  }
  if (account.status === "onboarding") {
    return (
      <Screen>
        <Onboarding savedProfile={account.view.profile} />
      </Screen>
    );
  }
  return <>{children}</>;
}
