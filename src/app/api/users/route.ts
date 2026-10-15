import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { NextRequest } from "next/server";
import { z } from "zod";
import * as argon2 from "argon2"; 

export const dynamic = "force-dynamic";

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

export async function GET() {
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

  try {
    const result = await pool.query(
      `SELECT id, name, email, role,
              created_at AS "createdAt"
       FROM users
       ORDER BY name ASC
       LIMIT 100`,
    );

    return NextResponse.json({ users: result.rows });
  } catch (error) {
    console.error("Failed to fetch users:", error);

    return NextResponse.json(
      { error: "Failed to fetch users." },
      { status: 500 },
    );
  }
}

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "user"]),
});

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (currentUser.role !== "admin") {
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
      { status: 400 },
    );
  }

  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { name, email, password, role } = parsed.data;

  try {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role,
                 created_at AS "createdAt"`,
      [name, email, passwordHash, role],
    );

    return NextResponse.json(
      { user: result.rows[0] },
      { status: 201 },
    );
  } catch (error) {
    if (isDatabaseError(error) && error.code === "23505") {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 },
      );
    }

    console.error("Failed to create user:", error);

    return NextResponse.json(
      { error: "Failed to create user." },
      { status: 500 },
    );
  }
}