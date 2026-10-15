import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  const fromText = request.nextUrl.searchParams.get("from");
  const toText = request.nextUrl.searchParams.get("to");
  if (!fromText || !toText) {
    return NextResponse.json({ error: "from and to are required." }, { status: 400 });
  }

  const from = new Date(fromText);
  const to = new Date(toText);
  const duration = to.getTime() - from.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 31 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Invalid date range (maximum 31 days)." }, { status: 400 });
  }

  try {
    const resourceResult = await pool.query(
      `SELECT id FROM resources WHERE id = $1 AND (is_active = TRUE OR $2::boolean = TRUE)`,
      [id, user.role === "admin"],
    );
    if (resourceResult.rowCount === 0) {
      return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    }

    const result = await pool.query(
      `SELECT start_time AS "startTime", end_time AS "endTime"
       FROM reservations
       WHERE resource_id = $1
         AND status = 'confirmed'
         AND start_time < $3::timestamptz
         AND end_time > $2::timestamptz
       ORDER BY start_time ASC`,
      [id, from.toISOString(), to.toISOString()],
    );

    return NextResponse.json({ occupied: result.rows });
  } catch (error) {
    console.error("Failed to fetch resource availability:", error);
    return NextResponse.json({ error: "Failed to fetch availability." }, { status: 500 });
  }
}