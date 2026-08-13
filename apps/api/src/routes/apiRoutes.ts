import { Router } from "express";
import { CallController, DealController, RepController } from "../controllers/callController.js";
import { requireAuth } from "../middleware/auth.js";
import { callUpload } from "../middleware/upload.js";

export const apiRouter = Router();

apiRouter.use(requireAuth);

apiRouter.get("/reps", RepController.list);

apiRouter.get("/deals", DealController.list);
apiRouter.post("/deals", DealController.create);

apiRouter.get("/calls", CallController.list);
apiRouter.get("/calls/:id", CallController.get);
apiRouter.patch("/calls/:id", CallController.update);
apiRouter.post("/calls/upload", callUpload.single("file"), CallController.upload);
apiRouter.post("/calls/link", CallController.link);
