import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { LangTypes } from "../@types/app.type";
import { ReservationsStatusType } from "../@types/reservations.type";
import { createNotification } from "../core/notification.core";
import { noticeTypes } from "../enums/notifications.enum";
import { reservationStatus } from "../enums/reservations.enum";
import { extractDataFromToken } from "../functions/jwt";
import response from "../helpers/response";
import {
  IReservationMatchFilter,
  ISaveReservation,
  IUpdateReservation,
} from "../interfaces/reservation.interface";
import reservationsModel from "../models/reservations.model";

export class ReservationsService {
  //users
  async addReservation(req: Request, res: Response, next: NextFunction) {
    const { lang } = req.params;
    const { date, user } = req.body;

    try {
      const { user_id, role } = extractDataFromToken(req);

      let reservation: ISaveReservation = {
        date,
        created_by: user_id,
      };

      if (role === "doctor") {
        reservation.patient = user;
        reservation.doctor = user_id;
        reservation.status = reservationStatus.APPROVED;
      }

      if (role === "patient") {
        reservation.doctor = user;
        reservation.patient = user_id;
      }

      await new reservationsModel(reservation).save();
      //send notification add review
      await createNotification({
        sender: user_id,
        notice_type: noticeTypes.RESERVATION_ADDED,
        receiver: [user],
      });
      response.addedSuccess(lang as LangTypes, res);
    } catch (error) {
      response.somethingWentWrong(lang as LangTypes, res, error as Error);
    }
  }

  async updateReservation(req: Request, res: Response, next: NextFunction) {
    const { lang, _id } = req.params;
    const { date, user } = req.body;

    try {
      const { user_id, role } = extractDataFromToken(req);

      let reservation: IUpdateReservation = {
        date,
      };

      if (role === "doctor") {
        reservation.patient = user;
        reservation.status = reservationStatus.APPROVED;
      }

      if (role === "patient") {
        reservation.doctor = user;
        reservation.status = reservationStatus.PENDING;
      }

      const result = await reservationsModel.findOneAndUpdate(
        {
          _id,
          created_by: user_id,
        },
        reservation
      );

      result
        ? response.updatedSuccess(lang as LangTypes, res)
        : response.reservationNotAvailable(lang as LangTypes, res);
    } catch (error) {
      response.somethingWentWrong(lang as LangTypes, res, error as Error);
    }
  }

  async cancelReservation(req: Request, res: Response, next: NextFunction) {
    const { lang, _id } = req.params;

    try {
      const { user_id } = extractDataFromToken(req);

      const result = await reservationsModel.findOneAndUpdate(
        { _id, created_by: user_id },
        { status: reservationStatus.CANCELED }
      );
      if (result) {
        await createNotification({
          sender: user_id,
          notice_type: noticeTypes.RESERVATION_CANCELED,
          receiver: [result.doctor],
        });
        response.reservationCanceled(lang as LangTypes, res);
      } else {
        response.reservationNotAvailable(lang as LangTypes, res);
      }
    } catch (error) {
      response.somethingWentWrong(lang as LangTypes, res, error as Error);
    }
  }

  async approveReservation(req: Request, res: Response, next: NextFunction) {
    const { lang, _id } = req.params;

    try {
      const { user_id } = extractDataFromToken(req);

      const result = await reservationsModel.findOneAndUpdate(
        { _id, created_by: user_id, doctor: user_id },
        { status: reservationStatus.APPROVED }
      );

      if (result) {
        await createNotification({
          sender: user_id,
          notice_type: noticeTypes.RESERVATION_APPROVED,
          receiver: [result.patient],
        });
        response.reservationAccepted(lang as LangTypes, res);
      } else {
        response.reservationNotAvailable(lang as LangTypes, res);
      }
    } catch (error) {
      response.somethingWentWrong(lang as LangTypes, res, error as Error);
    }
  }

  async declineReservation(req: Request, res: Response, next: NextFunction) {
    const { lang, _id } = req.params;

    try {
      const { user_id } = extractDataFromToken(req);

      const result = await reservationsModel.findOneAndUpdate(
        { _id, created_by: user_id, doctor: user_id },
        { status: reservationStatus.DECLINED }
      );

      if (result) {
        await createNotification({
          sender: user_id,
          notice_type: noticeTypes.RESERVATION_DECLINED,
          receiver: [result.patient],
        });
        response.reservationRejected(lang as LangTypes, res);
      } else {
        response.reservationNotAvailable(lang as LangTypes, res);
      }
    } catch (error) {
      response.somethingWentWrong(lang as LangTypes, res, error as Error);
    }
  }

  async addNoteToReservation(req: Request, res: Response, next: NextFunction) {
    const { lang, _id } = req.params;
    const { note } = req.body;

    try {
      const { user_id } = extractDataFromToken(req);

      const result = await reservationsModel.findOneAndUpdate(
        { _id, doctor: user_id },
        { note }
      );

      result
        ? response.addedSuccess(lang as LangTypes, res)
        : response.reservationNotAvailable(lang as LangTypes, res);
    } catch (error) {
      response.somethingWentWrong(lang as LangTypes, res, error as Error);
    }
  }

  async getAllUserReservations(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    const { lang } = req.params;
    const { skip } = req.query;
    const { status, user } = req.body;

    try {
      const { user_id, role } = extractDataFromToken(req);

      let filter: IReservationMatchFilter = {};

      const ObjectId = mongoose.Types.ObjectId;

      let type = "doctor";

      if (role === "doctor") {
        filter.doctor = new ObjectId(user_id);
        type = "patient";
      }
      if (role === "patient") {
        filter.patient = new ObjectId(user_id);
      }

      const result = await reservationsModel
        .aggregate([])
        .match({
          ...filter,
          status: status?.length > 0 ? { $in: status } : { $ne: null },
        })
        .lookup({
          as: `${type}`,
          localField: `${type}`,
          foreignField: "_id",
          from: "users",
        })
        .unwind(`${type}`)
        .lookup({
          as: `${type}.city`,
          localField: `${type}.city`,
          foreignField: "_id",
          from: "cities",
        })
        .unwind(`${type}.city`)
        .project({
          _id: 1,
          user: {
            _id: `$${type}._id`,
            name: `$${type}.name`,
            image_url: `$${type}.image_url`,
            city:
              lang === "ar" ? `$${type}.city.city_ar` : `$${type}.city.city_en`,
            address: `$${type}.address`,
          },
          date: "$date",
          note: "$note",
          status: "$status",
        })
        .match({
          "user.name": user ? { $regex: user, $options: "i" } : { $ne: null },
        })
        .skip(skip ? parseInt(skip as string) : 0)
        .limit(5);

      response.getSuccess(res, result);
    } catch (error) {
      response.somethingWentWrong(lang as LangTypes, res, error as Error);
    }
  }

  async getReservation(req: Request, res: Response, next: NextFunction) {
    const { lang, reservation_id } = req.params;

    try {
      const result = await reservationsModel
        .findById(
          { _id: reservation_id },
          {
            _id: 1,
            status: 1,
            patient: 1,
            doctor: 1,
            date: 1,
            note: 1,
          }
        )
        .populate({ path: "patient", select: "_id name image_url" })
        .populate({ path: "doctor", select: "_id name image_url" });

      response.getSuccess(res, result);
    } catch (error) {
      response.somethingWentWrong(lang as LangTypes, res, error as Error);
    }
  }

  //admin
  async getReservationsCount(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await reservationsModel.count();
      response.retrieveSuccess(res, result);
    } catch (error) {
      response.somethingWentWrong("ar", res, error as Error);
    }
  }

  async getAllReservations(req: Request, res: Response, next: NextFunction) {
    const { search, day, month, year, status, skip } = req.query;

    try {
      const results = await reservationsModel
        .aggregate([])
        .match({ status: status ? status : { $ne: null } })
        .lookup({
          as: "patient",
          from: "users",
          localField: "patient",
          foreignField: "_id",
        })
        .unwind("patient")
        .lookup({
          as: "doctor",
          from: "users",
          localField: "doctor",
          foreignField: "_id",
        })
        .unwind("doctor")
        .project({
          _id: 1,
          status: 1,
          doctor: 1,
          patient: 1,
          date: 1,
          month: { $month: "$date" },
          day: { $dayOfMonth: "$date" },
          year: { $year: "$date" },
        })
        .match({
          $or: [
            {
              "doctor.name": search
                ? { $regex: search, $options: "i" }
                : { $ne: null },
            },
            {
              "doctor.phone": search
                ? { $regex: search, $options: "i" }
                : { $ne: null },
            },
            {
              "patient.name": search
                ? { $regex: search, $options: "i" }
                : { $ne: null },
            },
            {
              "patient.phone": search
                ? { $regex: search, $options: "i" }
                : { $ne: null },
            },
          ],
          day: day ? day : { $ne: -1 },
          month: month ? month : { $ne: -1 },
          year: year ? year : { $ne: -1 },
        })
        .project({
          _id: "$_id",
          status: "$status",
          doctor: {
            _id: "$doctor._id",
            image_url: "$doctor.image_url",
            name: "$doctor.name",
          },
          patient: {
            _id: "$patient._id",
            image_url: "$patient.image_url",
            name: "$patient.name",
          },
          date: "$date",
          month: "$month",
          day: "$day",
          year: "$year",
        })
        .skip(skip ? parseInt(skip as string) : 0)
        .limit(20);
      response.getSuccess(res, results);
    } catch (error) {
      response.somethingWentWrong("ar", res, error as Error);
    }
  }
}
