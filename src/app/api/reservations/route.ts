import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { createReservationSchema } from "@/lib/validations/reservation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const validation = createReservationSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: "Invalid reservation details.",
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const { resourceId, title, startTime, endTime } =
    validation.data;

  const client = await pool.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const resource = await client.query(
      `SELECT id
       FROM resources
       WHERE id = $1 AND is_active = TRUE
       FOR SHARE`,
      [resourceId]
    );

    if (resource.rowCount === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Resource not found or inactive." },
        { status: 404 }
      );
    }

    const reservation = await client.query(
      `INSERT INTO reservations (
         resource_id,
         user_id,
         title,
         start_time,
         end_time
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING
         id,
         resource_id AS "resourceId",
         user_id AS "userId",
         title,
         start_time AS "startTime",
         end_time AS "endTime",
         status,
         created_at AS "createdAt"`,
      [
        resourceId,
        user.id,
        title,
        startTime,
        endTime,
      ]
    );

    await client.query("COMMIT");
    transactionOpen = false;

    return NextResponse.json(
      {
        reservation: reservation.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to roll back reservation:", rollbackError);
      }
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23P01"
    ) {
      return NextResponse.json(
        {
          error: "This resource is already reserved during that time.",
        },
        { status: 409 },
      );
    }

    console.error("Failed to create reservation:", error);

    return NextResponse.json(
      { error: "Unable to create reservation." },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);

  const resourceId = searchParams.get("resourceId");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const mine = searchParams.get("mine") === "true";

  const uuidSchema = z.string().uuid();
  const dateSchema = z.iso.datetime({ offset: true });

  if (resourceId && !uuidSchema.safeParse(resourceId).success) {
    return NextResponse.json(
      { error: "Invalid resourceId." },
      { status: 400 },
    );
  }

  if (status && !["confirmed", "cancelled"].includes(status)) {
    return NextResponse.json(
      { error: "Status must be confirmed or cancelled." },
      { status: 400 },
    );
  }

  if (from && !dateSchema.safeParse(from).success) {
    return NextResponse.json(
      { error: "Invalid from date. Include a timezone offset." },
      { status: 400 },
    );
  }

  if (to && !dateSchema.safeParse(to).success) {
    return NextResponse.json(
      { error: "Invalid to date. Include a timezone offset." },
      { status: 400 },
    );
  }

  if (from && to && new Date(to) <= new Date(from)) {
    return NextResponse.json(
      { error: "The to date must be after the from date." },
      { status: 400 },
    );
  }

  try {
    const values: unknown[] = [];
    const conditions: string[] = [];

    // Regular users can only retrieve their own reservations.
    // Admins can retrieve all reservations unless mine=true.
    if (user.role !== "admin" || mine) {
      values.push(user.id);
      conditions.push(`r.user_id = $${values.length}`);
    }

    if (resourceId) {
      values.push(resourceId);
      conditions.push(`r.resource_id = $${values.length}`);
    }

    if (status) {
      values.push(status);
      conditions.push(`r.status = $${values.length}`);
    }

    if (from) {
      values.push(from);
      conditions.push(`r.end_time > $${values.length}`);
    }

    if (to) {
      values.push(to);
      conditions.push(`r.start_time < $${values.length}`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

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
       ${whereClause}
       ORDER BY r.start_time ASC
       LIMIT 100`,
      values,
    );

    return NextResponse.json({
      reservations: result.rows,
    });
  } catch (error) {
    console.error("Failed to fetch reservations:", error);

    return NextResponse.json(
      { error: "Unable to retrieve reservations." },
      { status: 500 },
    );
  }
}
