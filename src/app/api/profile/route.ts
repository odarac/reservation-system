import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";
import * as argon2 from "argon2";

export const dynamic = "force-dynamic";

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.email().trim().toLowerCase().max(254).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128).optional(),
}).strict().refine(
  (data) => data.name !== undefined || data.email !== undefined || data.newPassword !== undefined,
  { message: "Provide at least one field to update." },
).refine(
  (data) => !data.newPassword || !!data.currentPassword,
  { message: "Current password is required to change your password.", path: ["currentPassword"] },
);

function isDatabaseError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string";
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const result = await pool.query(
      `SELECT id, name, email, role FROM users WHERE id = $1`,
      [currentUser.id],
    );
    if (!result.rowCount) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Failed to load profile:", error);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, email, currentPassword, newPassword } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1 FOR UPDATE`,
      [currentUser.id],
    );
    if (!existing.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    let passwordHash: string | null = null;
    if (newPassword) {
      const valid = await argon2.verify(existing.rows[0].password_hash, currentPassword!);
      if (!valid) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
      }
      passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    }

    const result = await client.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           password_hash = COALESCE($3, password_hash)
       WHERE id = $4
       RETURNING id, name, email, role`,
      [name ?? null, email ?? null, passwordHash, currentUser.id],
    );

    if (passwordHash !== null) {
      await client.query(`DELETE FROM sessions WHERE user_id = $1`, [currentUser.id]);
    }

    await client.query("COMMIT");
    return NextResponse.json({ user: result.rows[0], passwordChanged: passwordHash !== null });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* connection may have failed */ }
    if (isDatabaseError(error) && error.code === "23505") {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    console.error("Failed to update profile:", error);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  } finally {
    client.release();
  }
}