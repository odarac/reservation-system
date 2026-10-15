import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL must be configured.");
}

const databaseName = new URL(databaseUrl).pathname.slice(1);

if (databaseName !== "primewave_test") {
  throw new Error(
    `Tests may only run against primewave_test, not ${databaseName}.`,
  );
}

const pool = new Pool({ connectionString: databaseUrl });
const runId = randomUUID();
const password = "Integration-Test-Password-123!";
let emailCounter = 0;
let userCookie: string | null = null;
let adminCookie: string | null = null;
let userEmail = "";
let adminEmail = "";

const createdResourceIds: string[] = [];

function uniqueEmail() {
  emailCounter += 1;
  return `api-test-${runId}-${emailCounter}@example.com`;
}

function futureTime(minutesFromNow: number) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

async function api(
  path: string,
  init: RequestInit = {},
  cookie: string | null = userCookie,
) {
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (cookie) {
    headers.set("Cookie", cookie);
  }

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
}

async function responseBody(response: Response) {
  return response.json();
}

async function registerAccount(name: string) {
  const email = uniqueEmail();

  const response = await api(
    "/api/auth/register",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    },
    null,
  );

  if (response.status !== 201) {
    throw new Error(
      `Failed to register test account: ${response.status} ${await response.text()}`,
    );
  }

  const setCookie = response.headers.get("set-cookie");
  const cookieMatch = setCookie?.match(/reservation_session=([^;]+)/);

  if (!cookieMatch) {
    throw new Error("Registration did not return a session cookie.");
  }

  return {
    email,
    cookie: `reservation_session=${cookieMatch[1]}`,
  };
}

async function createResource(
  options: { active?: boolean; name?: string } = {},
) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO resources
       (name, description, type, capacity, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      options.name ?? `API Test ${runId} Resource ${createdResourceIds.length + 1}`,
      "Created by integration tests",
      "room",
      4,
      options.active ?? true,
    ],
  );

  const id = result.rows[0].id;
  createdResourceIds.push(id);
  return id;
}

function reservationPayload(
  resourceId: string,
  startTime: string,
  endTime: string,
) {
  return {
    resourceId,
    title: "Integration Test Reservation",
    startTime,
    endTime,
  };
}

async function createReservation(
  resourceId: string,
  startTime: string,
  endTime: string,
  cookie: string | null = userCookie,
) {
  return api(
    "/api/reservations",
    {
      method: "POST",
      body: JSON.stringify(
        reservationPayload(resourceId, startTime, endTime),
      ),
    },
    cookie,
  );
}

describe("Reservation API integration tests", () => {
  beforeAll(async () => {
    await pool.query("SELECT 1");

    // Register separate regular-user and administrator accounts.
    const regularAccount = await registerAccount("Integration Test User");
    userEmail = regularAccount.email;
    userCookie = regularAccount.cookie;

    const adminAccount = await registerAccount("Integration Test Admin");
    adminEmail = adminAccount.email;
    adminCookie = adminAccount.cookie;

    // Promote only the dedicated test account directly in the test database.
    await pool.query(
      "UPDATE users SET role = 'admin' WHERE email = $1",
      [adminEmail],
    );
  });

  afterAll(async () => {
    try {
      // Remove reservations belonging to test resources or test accounts.
      await pool.query(
        `DELETE FROM reservations
         WHERE resource_id = ANY($1::uuid[])
            OR user_id IN (
              SELECT id
              FROM users
              WHERE email IN ($2, $3)
            )`,
        [createdResourceIds, userEmail, adminEmail],
      );

      // Sessions are removed through ON DELETE CASCADE.
      await pool.query(
        "DELETE FROM users WHERE email IN ($1, $2)",
        [userEmail, adminEmail],
      );

      if (createdResourceIds.length > 0) {
        await pool.query(
          "DELETE FROM resources WHERE id = ANY($1::uuid[])",
          [createdResourceIds],
        );
      }
    } finally {
      await pool.end();
    }
  });

  describe("Authentication and authorization", () => {
    it("rejects reservation requests without authentication", async () => {
      const response = await api("/api/reservations", {}, null);
      expect(response.status).toBe(401);
    });

    it("allows an authenticated user to retrieve their profile", async () => {
      const response = await api("/api/auth/me");

      expect(response.status).toBe(200);

      const body = await responseBody(response);
      expect(body.user.email).toBe(userEmail);
      expect(body.user.role).toBe("user");
    });

    it("rejects unauthenticated access to the current-user endpoint", async () => {
      const response = await api("/api/auth/me", {}, null);
      expect(response.status).toBe(401);
    });

    it("rejects regular users from listing all users", async () => {
      const response = await api("/api/users");
      expect(response.status).toBe(403);
    });

    it("allows administrators to list users", async () => {
      const response = await api("/api/users", {}, adminCookie);

      expect(response.status).toBe(200);

      const body = await responseBody(response);
      expect(body.users.some(
        (user: { email: string }) => user.email === userEmail,
      )).toBe(true);
    });

    it("does not allow users to retrieve another user's profile", async () => {
      const otherUser = await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE email = $1",
        [adminEmail],
      );

      const response = await api(
        `/api/users/${otherUser.rows[0].id}`,
      );

      expect(response.status).toBe(403);
    });

    it("allows administrators to retrieve another user's profile", async () => {
      const target = await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE email = $1",
        [userEmail],
      );

      const response = await api(
        `/api/users/${target.rows[0].id}`,
        {},
        adminCookie,
      );

      expect(response.status).toBe(200);
    });

    it("rejects regular users from creating resources", async () => {
      const response = await api("/api/resources", {
        method: "POST",
        body: JSON.stringify({
          name: `Forbidden Resource ${runId}`,
          type: "room",
          capacity: 2,
        }),
      });

      expect(response.status).toBe(403);
    });

    it("rejects regular users from updating resources", async () => {
      const resourceId = await createResource();

      const response = await api(
        `/api/resources/${resourceId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: "Unauthorized Update" }),
        },
      );

      expect(response.status).toBe(403);
    });

    it("rejects regular users from deactivating resources", async () => {
      const resourceId = await createResource();

      const response = await api(
        `/api/resources/${resourceId}`,
        { method: "DELETE" },
      );

      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/resources", () => {
    it("returns active resources to authenticated users", async () => {
      const resourceId = await createResource();

      const response = await api("/api/resources");

      expect(response.status).toBe(200);

      const body = await responseBody(response);

      expect(body.resources.some(
        (resource: { id: string }) => resource.id === resourceId,
      )).toBe(true);
    });

    it("rejects unauthenticated resource listing", async () => {
      const response = await api("/api/resources", {}, null);
      expect(response.status).toBe(401);
    });

    it("does not list inactive resources", async () => {
      const resourceId = await createResource({ active: false });

      const response = await api("/api/resources");
      expect(response.status).toBe(200);

      const body = await responseBody(response);

      expect(body.resources.some(
        (resource: { id: string }) => resource.id === resourceId,
      )).toBe(false);
    });
  });

  describe("Resource management", () => {
    it("allows an administrator to create a resource", async () => {
      const response = await api(
        "/api/resources",
        {
          method: "POST",
          body: JSON.stringify({
            name: `Admin Resource ${runId}`,
            description: "Created by an admin integration test",
            type: "room",
            capacity: 6,
          }),
        },
        adminCookie,
      );

      expect(response.status).toBe(201);

      const body = await responseBody(response);
      expect(body.resource.id).toBeTruthy();

      createdResourceIds.push(body.resource.id);
    });

    it("allows an administrator to update a resource", async () => {
      const resourceId = await createResource();

      const response = await api(
        `/api/resources/${resourceId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: `Updated Resource ${runId}`,
            capacity: 8,
          }),
        },
        adminCookie,
      );

      expect(response.status).toBe(200);

      const body = await responseBody(response);
      expect(body.resource.name).toBe(`Updated Resource ${runId}`);
      expect(body.resource.capacity).toBe(8);
    });

    it("allows an administrator to deactivate a resource", async () => {
      const resourceId = await createResource();

      const response = await api(
        `/api/resources/${resourceId}`,
        { method: "DELETE" },
        adminCookie,
      );

      expect(response.status).toBe(200);

      const body = await responseBody(response);
      expect(body.resource.isActive).toBe(false);
    });
  });

  describe("POST /api/reservations", () => {
    it("creates a reservation with valid input", async () => {
      const resourceId = await createResource();

      const response = await createReservation(
        resourceId,
        futureTime(60),
        futureTime(120),
      );

      expect(response.status).toBe(201);

      const body = await responseBody(response);
      expect(body.reservation.id).toBeTruthy();
      expect(body.reservation.resourceId).toBe(resourceId);
    });

    it("assigns the reservation to the authenticated user", async () => {
      const resourceId = await createResource();

      const response = await createReservation(
        resourceId,
        futureTime(130),
        futureTime(160),
      );

      expect(response.status).toBe(201);

      const body = await responseBody(response);
      const result = await pool.query(
        "SELECT user_id FROM reservations WHERE id = $1",
        [body.reservation.id],
      );

      const expectedUser = await pool.query<{ id: string }>(
        "SELECT id FROM users WHERE email = $1",
        [userEmail],
      );

      expect(result.rows[0].user_id).toBe(expectedUser.rows[0].id);
    });

    it("rejects an invalid time range", async () => {
      const resourceId = await createResource();

      const response = await createReservation(
        resourceId,
        futureTime(220),
        futureTime(200),
      );

      expect(response.status).toBe(400);
    });

    it("rejects a malformed request", async () => {
      const response = await api("/api/reservations", {
        method: "POST",
        body: JSON.stringify({ title: "" }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects a nonexistent resource", async () => {
      const response = await createReservation(
        randomUUID(),
        futureTime(240),
        futureTime(270),
      );

      expect(response.status).toBe(404);
    });

    it("rejects overlapping reservations", async () => {
      const resourceId = await createResource();
      const startTime = futureTime(300);
      const endTime = futureTime(360);

      const first = await createReservation(resourceId, startTime, endTime);
      expect(first.status).toBe(201);

      const second = await createReservation(resourceId, startTime, endTime);
      expect(second.status).toBe(409);
    });

    it("allows adjacent reservations", async () => {
      const resourceId = await createResource();
      const start = futureTime(390);
      const middle = futureTime(420);
      const end = futureTime(450);

      const first = await createReservation(resourceId, start, middle);
      const second = await createReservation(resourceId, middle, end);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
    });

    it("allows only one of two simultaneous overlapping bookings", async () => {
      const resourceId = await createResource();
      const startTime = futureTime(480);
      const endTime = futureTime(540);

      const responses = await Promise.all([
        createReservation(resourceId, startTime, endTime),
        createReservation(resourceId, startTime, endTime),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201,
        409,
      ]);
    });

    it("rejects bookings for inactive resources", async () => {
      const resourceId = await createResource({ active: false });

      const response = await createReservation(
        resourceId,
        futureTime(570),
        futureTime(600),
      );

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/reservations", () => {
    it("lists reservations filtered by resource", async () => {
      const resourceId = await createResource();

      const created = await createReservation(
        resourceId,
        futureTime(630),
        futureTime(660),
      );

      expect(created.status).toBe(201);

      const response = await api(
        `/api/reservations?resourceId=${encodeURIComponent(resourceId)}`,
      );

      expect(response.status).toBe(200);

      const body = await responseBody(response);

      expect(body.reservations.length).toBeGreaterThan(0);
      expect(
        body.reservations.every(
          (reservation: { resourceId: string }) =>
            reservation.resourceId === resourceId,
        ),
      ).toBe(true);
    });

    it("rejects unauthenticated reservation listing", async () => {
      const response = await api("/api/reservations", {}, null);
      expect(response.status).toBe(401);
    });

    it("rejects invalid resource ID filters", async () => {
      const response = await api("/api/reservations?resourceId=invalid");
      expect(response.status).toBe(400);
    });
  });

  describe("Reservation lifecycle and ownership", () => {
    it("allows a user to update their own reservation", async () => {
      const resourceId = await createResource();

      const created = await createReservation(
        resourceId,
        futureTime(690),
        futureTime(720),
      );

      expect(created.status).toBe(201);

      const body = await responseBody(created);

      const response = await api(
        `/api/reservations/${body.reservation.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title: "Updated Integration Test",
          }),
        },
      );

      expect(response.status).toBe(200);

      const updated = await responseBody(response);
      expect(updated.reservation.title).toBe("Updated Integration Test");
    });

    it("prevents a user from updating another user's reservation", async () => {
      const resourceId = await createResource();

      const created = await createReservation(
        resourceId,
        futureTime(750),
        futureTime(780),
        adminCookie,
      );

      expect(created.status).toBe(201);

      const body = await responseBody(created);

      const response = await api(
        `/api/reservations/${body.reservation.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Unauthorized Update" }),
        },
      );

      expect(response.status).toBe(403);
    });

    it("allows an administrator to update another user's reservation", async () => {
      const resourceId = await createResource();

      const created = await createReservation(
        resourceId,
        futureTime(810),
        futureTime(840),
      );

      expect(created.status).toBe(201);

      const body = await responseBody(created);

      const response = await api(
        `/api/reservations/${body.reservation.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Admin Update" }),
        },
        adminCookie,
      );

      expect(response.status).toBe(200);
    });

    it("prevents a user from cancelling another user's reservation", async () => {
      const resourceId = await createResource();

      const created = await createReservation(
        resourceId,
        futureTime(870),
        futureTime(900),
        adminCookie,
      );

      expect(created.status).toBe(201);

      const body = await responseBody(created);

      const response = await api(
        `/api/reservations/${body.reservation.id}`,
        { method: "DELETE" },
      );

      expect(response.status).toBe(403);
    });

    it("cancels a reservation and releases its time slot", async () => {
      const resourceId = await createResource();
      const startTime = futureTime(930);
      const endTime = futureTime(960);

      const created = await createReservation(resourceId, startTime, endTime);
      expect(created.status).toBe(201);

      const body = await responseBody(created);

      const cancelled = await api(
        `/api/reservations/${body.reservation.id}`,
        { method: "DELETE" },
      );

      expect(cancelled.status).toBe(200);

      const replacement = await createReservation(
        resourceId,
        startTime,
        endTime,
      );

      expect(replacement.status).toBe(201);
    });

    it("returns 404 for a nonexistent reservation", async () => {
      const response = await api(
        `/api/reservations/${randomUUID()}`,
      );

      expect(response.status).toBe(404);
    });

    it("rejects unauthenticated reservation updates", async () => {
      const response = await api(
        `/api/reservations/${randomUUID()}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Unauthorized" }),
        },
        null,
      );

      expect(response.status).toBe(401);
    });
  });
});