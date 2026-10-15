import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import * as argon2 from "argon2";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const uuidSchema = z.string().uuid();

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.email().trim().toLowerCase().max(254).optional(),
    role: z.enum(["admin", "user"]).optional(),
    password: z.string().min(8).max(128).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

function isDatabaseError(
  error: unknown,
): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  );
}

function authenticationError() {
  return NextResponse.json(
    { error: "Authentication required." },
    { status: 401 },
  );
}

function permissionError() {
  return NextResponse.json(
    { error: "You do not have permission to access this user." },
    { status: 403 },
  );
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) return authenticationError();

  const { id } = await params;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 },
    );
  }

  if (currentUser.role !== "admin") {
    return permissionError();
  }

  try {
    const result = await pool.query(
      `SELECT id, name, email, role, created_at AS "createdAt"
       FROM users
       WHERE id = $1`,
      [id],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Failed to fetch user:", error);

    return NextResponse.json(
      { error: "Failed to fetch user." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) return authenticationError();

  if (currentUser.role !== "admin") {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  }

  const { id } = await params;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { name, email, role, password } = parsed.data;

  if (
    currentUser.id === id &&
    role !== undefined &&
    role !== "admin"
  ) {
    return NextResponse.json(
      { error: "You cannot remove your own administrator privileges." },
      { status: 403 },
    );
  }

  try {
    const passwordHash = password
      ? await argon2.hash(password, {
          type: argon2.argon2id,
        })
      : null;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `UPDATE users
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             role = COALESCE($3, role),
             password_hash = COALESCE($4, password_hash)
         WHERE id = $5
         RETURNING id, name, email, role,
                   created_at AS "createdAt"`,
        [
          name ?? null,
          email ?? null,
          role ?? null,
          passwordHash,
          id,
        ],
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "User not found." },
          { status: 404 },
        );
      }

      // Revoke sessions after a password reset.
      if (passwordHash !== null) {
        await client.query(
          `DELETE FROM sessions WHERE user_id = $1`,
          [id],
        );
      }

      // Also revoke sessions when removing administrator privileges.
      if (role === "user") {
        await client.query(
          `DELETE FROM sessions WHERE user_id = $1`,
          [id],
        );
      }

      await client.query("COMMIT");

      return NextResponse.json({
        user: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (isDatabaseError(error) && error.code === "23505") {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 },
      );
    }

    console.error("Failed to update user:", error);

    return NextResponse.json(
      { error: "Failed to update user." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) return authenticationError();

  if (currentUser.role !== "admin") {
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  }

  const { id } = await params;

  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query(
      `DELETE FROM users
       WHERE id = $1
       RETURNING id, name, email`,
      [id],
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "User deleted successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    if (isDatabaseError(error) && error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "Cannot delete this user because they have associated reservations.",
        },
        { status: 409 },
      );
    }

    console.error("Failed to delete user:", error);

    return NextResponse.json(
      { error: "Failed to delete user." },
      { status: 500 },
    );
  }
}