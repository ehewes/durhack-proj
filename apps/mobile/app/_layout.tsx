import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { createClient, createQueryClient, TRPCProvider } from "@/lib/trpc";

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [trpcClient] = useState(createClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="live" options={{ headerShown: true, title: "Live" }} />
          <Stack.Screen name="evidence" options={{ headerShown: true, title: "Evidence log" }} />
        </Stack>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
