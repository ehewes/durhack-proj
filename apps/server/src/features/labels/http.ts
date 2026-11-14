import type { HttpRoutes } from "../../http";

export const labelsHttp: HttpRoutes = (app) => {
  app.post("/upload/clip", (c) => c.json({ error: "not implemented" }, 501));
};
