import "dotenv/config";
import argon2 from "argon2";
import { Pool } from "pg";

const { DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } =
  process.env;

if (!DATABASE_URL || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    "Set DATABASE_URL, ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD.",
  );
}

if (ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD.length > 128) {
  throw new Error("ADMIN_PASSWORD must be between 12 and 128 characters.");
}

const email = ADMIN_EMAIL.trim().toLowerCase();
const name = ADMIN_NAME.trim();

if (!name || !zEmailIsValid(email)) {
  throw new Error("Provide a valid admin name and email.");
}

function zEmailIsValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const adminPassword: string = ADMIN_PASSWORD;
async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const passwordHash = await argon2.hash(adminPassword, {
      type: argon2.argon2id,
    });

    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, 'admin')
      ON CONFLICT (LOWER(email))
      DO UPDATE SET
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = 'admin'`,
      [name, email, passwordHash],
    );

    console.log(`Administrator provisioned: ${email}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to provision administrator:", error);
  process.exitCode = 1;
});