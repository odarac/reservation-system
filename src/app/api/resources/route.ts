import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";

const resourceTypes = [
  "room",
  "equipment",
  "workstation",
  "other",
] as const;

const createResourceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  type: z.enum(resourceTypes),
  capacity: z.number().int().min(1).max(10000).optional(),
});

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  try {
    const result = await pool.query(
      `SELECT id, name, description, type, capacity,
              is_active AS "isActive",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
       FROM resources
       WHERE is_active = TRUE
       ORDER BY name ASC
       LIMIT 100`,
    );

    return NextResponse.json({ resources: result.rows });
  } catch (error) {
    console.error("Failed to fetch resources:", error);

    return NextResponse.json(
      { error: "Failed to fetch resources." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const parsed = createResourceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    const { name, description, type, capacity } = parsed.data;

    const result = await pool.query(
      `INSERT INTO resources (name, description, type, capacity)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, type, capacity,
                 is_active AS "isActive",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      [name, description ?? null, type, capacity ?? 1]
    );

    return NextResponse.json(
      { resource: result.rows[0] },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create resource:", error);
    return NextResponse.json(
      { error: "Failed to create resource." },
      { status: 500 }
    );
  }
}
