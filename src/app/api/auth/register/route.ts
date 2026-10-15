import { NextResponse } from "next/server";
import argon2 from "argon2";
import { z } from "zod";
import { pool } from "@/lib/db";
import { createSession } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(12).max(128),
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
      {
        error: "Invalid registration details.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { name, email, password } = parsed.data;
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  try {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id`,
      [name, email, passwordHash],
    );

    const userId = result.rows[0].id;
    await createSession(userId);

    return NextResponse.json(
      {
        user: {
          id: userId,
          name,
          email,
          role: "user",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    throw error;
  }
}