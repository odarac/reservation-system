import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const resourceTypes = [
  "room",
  "equipment",
  "workstation",
  "other",
] as const;

const uuidSchema = z.string().uuid();

const updateResourceSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    type: z.enum(resourceTypes).optional(),
    capacity: z.number().int().min(1).max(10000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { id } = await params;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid resource ID." },
      { status: 400 }
    );
  }

  try {
    const result = await pool.query(
      `SELECT id, name, description, type, capacity,
              is_active AS "isActive",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
       FROM resources
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Resource not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ resource: result.rows[0] });
  } catch (error) {
    console.error("Failed to fetch resource:", error);
    return NextResponse.json(
      { error: "Failed to fetch resource." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {

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

  const { id } = await params;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid resource ID." },
      { status: 400 }
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

  const parsed = updateResourceSchema.safeParse(body);

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
    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query("BEGIN");
      transactionOpen = true;

      const current = await client.query(
        `SELECT *
         FROM resources
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );

      if (current.rowCount === 0) {
        await client.query("ROLLBACK");
        transactionOpen = false;

        return NextResponse.json(
          { error: "Resource not found." },
          { status: 404 }
        );
      }

      const existing = current.rows[0];
      const updates = parsed.data;

      const result = await client.query(
        `UPDATE resources
         SET name = $1,
             description = $2,
             type = $3,
             capacity = $4,
             is_active = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING id, name, description, type, capacity,
                   is_active AS "isActive",
                   created_at AS "createdAt",
                   updated_at AS "updatedAt"`,
        [
          updates.name ?? existing.name,
          updates.description === undefined
            ? existing.description
            : updates.description,
          updates.type ?? existing.type,
          updates.capacity ?? existing.capacity,
          updates.isActive ?? existing.is_active,
          id,
        ]
      );

      await client.query("COMMIT");
      transactionOpen = false;

      return NextResponse.json({ resource: result.rows[0] });
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Failed to roll back resource update:", rollbackError);
        }
      }

      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to update resource:", error);
    return NextResponse.json(
      { error: "Failed to update resource." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
) {

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

  const { id } = await params;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid resource ID." },
      { status: 400 }
    );
  }

  try {
    const result = await pool.query(
      `UPDATE resources
       SET is_active = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, description, type, capacity,
                 is_active AS "isActive",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Resource not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Resource deactivated successfully.",
      resource: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to deactivate resource:", error);
    return NextResponse.json(
      { error: "Failed to deactivate resource." },
      { status: 500 }
    );
  }
}
