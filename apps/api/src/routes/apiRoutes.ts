import { Router } from "express";
import { CallController, DealController } from "../controllers/callController.js";
import { requireAuth } from "../middleware/auth.js";
import { callUpload } from "../middleware/upload.js";

export const apiRouter = Router();

apiRouter.use(requireAuth);

apiRouter.get("/deals", DealController.list);
apiRouter.post("/deals", DealController.create);
apiRouter.get("/deals/:id/calls", DealController.listCalls);

apiRouter.get("/calls", CallController.list);
apiRouter.post("/calls/upload", callUpload.single("file"), CallController.upload);
apiRouter.post("/calls/link", CallController.link);
apiRouter.get("/calls/:id", CallController.get);
apiRouter.patch("/calls/:id", CallController.update);
apiRouter.get("/calls/:id/transcriptions", CallController.transcriptions);
apiRouter.post("/calls/:id/transcribe", CallController.retranscribe);
