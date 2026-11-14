import type { HttpRoutes } from "../../http";
import { loadFeatureModule } from "./load";
import type { StreetManagerPost } from "./post";

export const worksHttp: HttpRoutes = (app) => {
  app.post("/sns/street-manager", async (c) => {
    const service = await loadFeatureModule<{
      receiveStreetManagerPost: (rawBody: string) => Promise<StreetManagerPost>;
    }>("./service");
    const result = await service.receiveStreetManagerPost(await c.req.text());
    return c.json(result.body, result.status);
  });
};
