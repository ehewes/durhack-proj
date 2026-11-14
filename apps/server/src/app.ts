import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { briefingHttp } from "./features/briefing";
import { labelsHttp } from "./features/labels";
import { worksHttp } from "./features/works";
import { createContext } from "./trpc/init";
import { appRouter } from "./trpc/router";

export function createApp({ webDist }: { webDist?: string } = {}): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  // The web build is same-origin in production; CORS covers the Expo dev server.
  app.use("/trpc/*", cors());
  app.use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      createContext: (_opts, c) => createContext({ req: c.req.raw }),
    }),
  );

  // Plain routes, one line per feature that has them. Written in M0.
  briefingHttp(app);
  labelsHttp(app);
  worksHttp(app);

  if (webDist) {
    app.use("/*", serveStatic({ root: webDist }));
    // Single-page app: unknown paths get index.html so deep links work
    app.get("*", serveStatic({ root: webDist, path: "index.html" }));
  }
  return app;
}
