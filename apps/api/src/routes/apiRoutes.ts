import { Router } from "express";
import rateLimit from "express-rate-limit";
import { CallController, DealController } from "../controllers/callController.js";
import { ConversationController } from "../controllers/conversationController.js";
import { SearchController } from "../controllers/searchController.js";
import { UserController } from "../controllers/userController.js";
import { requireAuth } from "../middleware/auth.js";
import { callUpload } from "../middleware/upload.js";

export const apiRouter = Router();

const addUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

apiRouter.use(requireAuth);

apiRouter.get("/users", UserController.list);
apiRouter.post("/users", addUserLimiter, UserController.create);

apiRouter.get("/deals", DealController.list);
apiRouter.post("/deals", DealController.create);
apiRouter.get("/deals/:id/calls", DealController.listCalls);
apiRouter.get("/deals/:id/users", DealController.listUsers);
apiRouter.post("/deals/:id/users", DealController.addUser);

apiRouter.get("/calls", CallController.list);
apiRouter.post("/calls/uploads/presign", CallController.presignUpload);
apiRouter.post("/calls/uploads/complete", CallController.completeUpload);
apiRouter.post("/calls/upload", callUpload.single("file"), CallController.upload);
apiRouter.post("/calls/link", CallController.link);
apiRouter.get("/calls/:id/file", CallController.file);
apiRouter.get("/calls/:id", CallController.get);
apiRouter.get("/calls/:id/audio", CallController.audio);
apiRouter.patch("/calls/:id", CallController.update);
apiRouter.get("/calls/:id/transcriptions", CallController.transcriptions);
apiRouter.post("/calls/:id/transcribe", CallController.retranscribe);
apiRouter.post("/calls/:id/infer-and-rename", CallController.inferAndRename);
apiRouter.get("/calls/:id/insights", CallController.insights);

apiRouter.post("/search", SearchController.search);

apiRouter.get("/conversations", ConversationController.list);
apiRouter.post("/conversations", ConversationController.create);
apiRouter.get("/conversations/search", ConversationController.search);
apiRouter.delete("/conversations/:id", ConversationController.remove);
apiRouter.get("/conversations/:id/messages", ConversationController.listMessages);
apiRouter.post("/conversations/:id/messages", ConversationController.postMessage);
