import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

function authenticationError() {
  return NextResponse.json(
    { error: "Authentication required." },
    { status: 401 },
  );
}

function permissionError() {
  return NextResponse.json(
    { error: "You can only modify your own reservations." },
    { status: 403 },
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return authenticationError();
  }

  const { id } = await params;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid reservation ID." },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query(
      `SELECT
         r.id,
         r.resource_id AS "resourceId",
         res.name AS "resourceName",
         r.user_id AS "userId",
         u.name AS "userName",
         r.title,
         r.start_time AS "startTime",
         r.end_time AS "endTime",
         r.status,
         r.created_at AS "createdAt",
         r.updated_at AS "updatedAt"
       FROM reservations r
       JOIN resources res ON res.id = r.resource_id
       JOIN users u ON u.id = r.user_id
       WHERE r.id = $1`,
      [id],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Reservation not found." },
        { status: 404 },
      );
    }

    const reservation = result.rows[0];

    // Only the reservation owner or an admin can view its details.
    if (user.role !== "admin" && reservation.userId !== user.id) {
      return permissionError();
    }

    return NextResponse.json({
      reservation,
    });
  } catch (error) {
    console.error("Failed to fetch reservation:", error);

    return NextResponse.json(
      { error: "Unable to retrieve reservation." },
      { status: 500 },
    );
  }
}

const updateReservationSchema = z
  .object({
    resourceId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(160).optional(),
    startTime: z.iso.datetime({ offset: true }).optional(),
    endTime: z.iso.datetime({ offset: true }).optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: "Provide at least one field to update." },
  )
  .refine(
    (data) =>
      !data.startTime ||
      !data.endTime ||
      new Date(data.endTime) > new Date(data.startTime),
    {
      message: "End time must be after start time.",
      path: ["endTime"],
    },
  );

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return authenticationError();
  }

  const { id } = await params;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid reservation ID." },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const validation = updateReservationSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: "Invalid update details.",
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const updates = validation.data;
  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const existing = await client.query(
      `SELECT *
       FROM reservations
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { error: "Reservation not found." },
        { status: 404 },
      );
    }

    const current = existing.rows[0];

    // Authorization is checked against the authenticated session,
    // never against a user ID supplied by the client.
    if (user.role !== "admin" && current.user_id !== user.id) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return permissionError();
    }

    if (current.status !== "confirmed") {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { error: "Cancelled reservations cannot be updated." },
        { status: 409 },
      );
    }

    const resourceId = updates.resourceId ?? current.resource_id;
    const title = updates.title ?? current.title;
    const startTime = updates.startTime ?? current.start_time;
    const endTime = updates.endTime ?? current.end_time;

    if (new Date(endTime) <= new Date(startTime)) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { error: "End time must be after start time." },
        { status: 400 },
      );
    }

    const resource = await client.query(
      `SELECT id
       FROM resources
       WHERE id = $1 AND is_active = TRUE
       FOR SHARE`,
      [resourceId],
    );

    if (resource.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { error: "Resource not found or inactive." },
        { status: 404 },
      );
    }

    const result = await client.query(
      `UPDATE reservations
       SET resource_id = $1,
           title = $2,
           start_time = $3,
           end_time = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING
         id,
         resource_id AS "resourceId",
         user_id AS "userId",
         title,
         start_time AS "startTime",
         end_time AS "endTime",
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [resourceId, title, startTime, endTime, id],
    );

    await client.query("COMMIT");
    transactionOpen = false;

    return NextResponse.json({
      reservation: result.rows[0],
    });
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to roll back reservation update:", rollbackError);
      }
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23P01"
    ) {
      return NextResponse.json(
        { error: "This resource is already reserved during that time." },
        { status: 409 },
      );
    }

    console.error("Failed to update reservation:", error);

    return NextResponse.json(
      { error: "Unable to update reservation." },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return authenticationError();
  }

  const { id } = await params;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid reservation ID." },
      { status: 400 },
    );
  }

  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const existing = await client.query(
      `SELECT id, user_id, status
       FROM reservations
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    if (existing.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { error: "Reservation not found." },
        { status: 404 },
      );
    }

    const current = existing.rows[0];

    if (user.role !== "admin" && current.user_id !== user.id) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return permissionError();
    }

    if (current.status === "cancelled") {
      await client.query("ROLLBACK");
      transactionOpen = false;

      return NextResponse.json(
        { error: "Reservation is already cancelled." },
        { status: 409 },
      );
    }

    const result = await client.query(
      `UPDATE reservations
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         resource_id AS "resourceId",
         user_id AS "userId",
         title,
         start_time AS "startTime",
         end_time AS "endTime",
         status,
         updated_at AS "updatedAt"`,
      [id],
    );

    await client.query("COMMIT");
    transactionOpen = false;

    return NextResponse.json({
      message: "Reservation cancelled successfully.",
      reservation: result.rows[0],
    });
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to roll back reservation cancellation:", rollbackError);
      }
    }

    console.error("Failed to cancel reservation:", error);

    return NextResponse.json(
      { error: "Unable to cancel reservation." },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}