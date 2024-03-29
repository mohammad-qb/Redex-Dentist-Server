import { Router } from "express";
import { ReportReasonsService } from "../services/reportReasons.service";

export const reportReasonsRouter = Router({ mergeParams: true });

const reportReasonsService = new ReportReasonsService();

//users
reportReasonsRouter.get("/", reportReasonsService.getAllReasons);

// admin
reportReasonsRouter.post("/admin/add", reportReasonsService.addReason);

reportReasonsRouter.put(
  "/admin/update/:_id",
  reportReasonsService.updateReason
);

reportReasonsRouter.get("/admin", reportReasonsService.getAllReasonsDetails);

reportReasonsRouter.delete(
  "/admin/delete/:_id",
  reportReasonsService.deleteReason
);
