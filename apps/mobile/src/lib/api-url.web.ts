/** Web: empty means same origin, which is how the API serves the web build. */
export function apiUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? "";
}
