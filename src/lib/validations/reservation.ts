import { z } from "zod";

const uuidSchema = z.string().uuid();
const dateTimeSchema = z.iso.datetime({ offset: true });

export const createReservationSchema = z
  .object({
    resourceId: uuidSchema,
    title: z.string().trim().min(1).max(160),
    startTime: dateTimeSchema,
    endTime: dateTimeSchema,
  })
  .refine(
    (data) =>
      new Date(data.endTime).getTime() >
      new Date(data.startTime).getTime(),
    {
      message: "End time must be after start time.",
      path: ["endTime"],
    },
  );

export type CreateReservationInput = z.infer<
  typeof createReservationSchema
>;