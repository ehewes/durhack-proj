import type { HttpRoutes } from "../../http";

export const worksHttp: HttpRoutes = (app) => {
  app.post("/sns/street-manager", (c) => c.json({ error: "not implemented" }, 501));
};
