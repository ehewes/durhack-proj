import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { createClient, createQueryClient, TRPCProvider } from "@/lib/trpc";
import { useLargeTitleOptions } from "@/lib/ui";

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [trpcClient] = useState(createClient);
  const live = useLargeTitleOptions("Live noise");
  const evidence = useLargeTitleOptions("Evidence log");
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="live" options={live} />
          <Stack.Screen name="evidence" options={evidence} />
        </Stack>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
