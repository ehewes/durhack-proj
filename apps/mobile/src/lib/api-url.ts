/** iOS: the API's absolute URL. Fails loudly instead of calling a relative /trpc that can't resolve. */
export function apiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) throw new Error("EXPO_PUBLIC_API_URL is not set: copy .env.example to .env");
  return url;
}
