/** Wrap the app's screens in this to show onboarding on first launch (a `platform` change). */
export { ConsentGate } from "./components/ConsentGate";
export type { ConsentType } from "./consent";
/** Consent checks for other features: ask iOS for a permission only once `useHasConsent` is true. */
export { type ConsentState, useConsent, useHasConsent } from "./hooks/useAccount";
export { AccountScreen } from "./screens/AccountScreen";
