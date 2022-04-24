import { Request, Response, NextFunction } from "express";
import { extractDataFromToken } from "../functions/jwt";
import response from "../helpers/response";
import notifications from "../models/notifications";

export class NotificationsService {
  async getAllUserNotifications(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const { skip, limit } = req.query;
    const { user_id } = extractDataFromToken(req);

    try {
      const result = await Promise.all([
        notifications
          .find({ receiver: { $in: [user_id] } })
          .skip(skip ? parseInt(skip as string) : 0)
          .limit(limit ? parseInt(limit as string) : 20)
          .populate({ path: "sender", select: "_id name image_url" })
          .sort({ _id: -1 }),
        notifications.count({ receiver: { $in: [user_id] } }),
      ]);
      response.getSuccess(res, result[0], result[1]);
    } catch (error) {
      response.somethingWentWrong(res, error as Error);
    }
  }

  async checkMissingNotifications(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const { user_id } = extractDataFromToken(req);
    try {
      const result = await notifications.findOne({
        receiver: { $in: [user_id] },
        read_by: { $nin: [user_id] },
      });

      result
        ? res.status(200).json({ success: true, response: { missing: true } })
        : res.status(200).json({ success: true, response: { missing: false } });
    } catch (error) {
      response.somethingWentWrong(res, error as Error);
    }
  }

  async setNotificationsAsRead(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const { _ids } = req.body;
    const { user_id } = extractDataFromToken(req);

    try {
      await notifications.updateMany(
        { _id: { $in: _ids }, receiver: { $in: [user_id] } },
        { $addToSet: { read_by: user_id } }
      );
      response.updatedSuccess(res);
    } catch (error) {
      response.somethingWentWrong(res, error as Error);
    }
  }
}