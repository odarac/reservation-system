import { NextResponse } from "next/server";
import argon2 from "argon2";
import { z } from "zod";
import { pool } from "@/lib/db";
import { createSession } from "@/lib/auth";

const schema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const result = await pool.query<{
    id: string;
    name: string;
    email: string;
    role: "admin" | "user";
    password_hash: string | null;
  }>(
    `SELECT id, name, email, role, password_hash
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [parsed.data.email],
  );

  const user = result.rows[0];

  if (
    !user?.password_hash ||
    !(await argon2.verify(user.password_hash, parsed.data.password))
  ) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  await createSession(user.id);

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}