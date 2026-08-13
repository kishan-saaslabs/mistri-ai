import type { Express } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi.js";

export function mountDocs(app: Express) {
  app.get("/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });

  app.use(
    "/docs",
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: "Mistri AI API",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: "list",
      },
    }),
  );
}
