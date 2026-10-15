# Schedulio

Schedulio is a resource reservation system built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, and **PostgreSQL**. Users can browse resources, check availability, manage their reservations, and update their profiles. Administrators can also manage resources and user accounts.

## Prerequisites

- **Node.js** and **npm** (use a current Node.js LTS release)
- **Docker Desktop** with Docker Compose enabled
- **Git** (if cloning the project)

The commands below should be run from the **project root** (the directory containing `package.json` and `compose.yaml` or `docker-compose.yml`).

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment variables

Create a `.env.local` file in the project root. Set the database URLs and the credentials used by the admin provisioning script:

```dotenv
# Application database (Docker Compose exposes PostgreSQL on localhost:5432)
DATABASE_URL=postgresql://primewave:YOUR_DB_PASSWORD@localhost:5432/primewave

# Separate database for automated tests
TEST_DATABASE_URL=postgresql://primewave:YOUR_DB_PASSWORD@localhost:5432/primewave_test

# Initial administrator account (used by the provisioning script)
ADMIN_NAME=System Administrator
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-password
```

Replace `YOUR_DB_PASSWORD` with the password configured for PostgreSQL in your Docker Compose file. If your Compose configuration uses a different host port, username, or database name, adjust the URLs accordingly.

**Important:** Do not commit `.env.local` or real credentials to version control. The test database must be separate from the application database because tests may create, modify, or delete records.

## 3. Start PostgreSQL

Start the database service:

```bash
docker compose up -d db
```

Check that it is running:

```bash
docker compose ps
```

The project's Compose database service is named `db`; its PostgreSQL database is `primewave` and its database user is `primewave`. If your local Compose configuration differs, use the names defined there.

### Create the test database

Run this once after the PostgreSQL container has started:

```bash
docker compose exec db psql -U primewave -d postgres -c "CREATE DATABASE primewave_test;"
```

If the database already exists, you can skip this step.

### Apply database migrations

The project contains SQL migration files in `db/migrations/`. Apply them **in filename order** to both databases.

From a Bash-compatible terminal (such as Git Bash or WSL):

```bash
# Application database
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U primewave -d primewave < db/migrations/001_init.sql
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U primewave -d primewave < db/migrations/002_auth.sql

# Test database
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U primewave -d primewave_test < db/migrations/001_init.sql
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U primewave -d primewave_test < db/migrations/002_auth.sql
```

For **PowerShell**, use a pipeline instead of `<`:

```powershell
Get-Content db/migrations/001_init.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U primewave -d primewave
Get-Content db/migrations/002_auth.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U primewave -d primewave
Get-Content db/migrations/001_init.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U primewave -d primewave_test
Get-Content db/migrations/002_auth.sql -Raw | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U primewave -d primewave_test
```

If there are additional migration files, apply those in order too. These commands are for **initial database setup**; do not blindly rerun non-idempotent migrations against an existing database.

## 4. Create the administrator account

Once the application database has been migrated and the `ADMIN_*` values are set in `.env.local`, run:

```bash
npx tsx --env-file=.env.local scripts/create-admin.ts
```

Alternatively, you can use:

```bash
npm run admin:create
```

The provisioning script creates the administrator using the supplied name, email, and password, hashes the password using Argon2id, and assigns the `admin` role. In this project, the script is designed to update the matching account if the email already exists, so keep the admin credentials secure.

You can then sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## 5. Run the application

Start the Next.js development server:

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

Sign in using the administrator account created above. Administrators can create resources and manage users; regular users can view resources, check booking availability, create and manage their own reservations, and edit their own profile.

## 6. Run automated tests

Ensure PostgreSQL is running and `TEST_DATABASE_URL` points to the **test** database with its migrations applied. Then run:

```bash
npm test
```

This invokes the project's configured test script in `package.json`. Review the terminal output for passing/failing tests. If the test suite requires any additional setup or test-specific variables, follow the instructions in the test files or test configuration.

**Never point `TEST_DATABASE_URL` at the main `primewave` database.**

## Common commands

| Task | Command |
| --- | --- |
| Install packages | `npm install` |
| Start database | `docker compose up -d db` |
| Check containers | `docker compose ps` |
| Start development server | `npm run dev` |
| Run tests | `npm test` |
| Create/update initial admin | `npx tsx --env-file=.env.local scripts/create-admin.ts` |
| Stop Compose services | `docker compose down` |

> **Data safety:** `docker compose down` normally preserves named database volumes. Avoid `docker compose down -v` unless you intentionally want to remove persisted database data.

## Troubleshooting

- **Database connection refused:** Verify Docker Desktop is running, `docker compose ps` shows the database service, and `DATABASE_URL` matches the configured port and credentials.
- **Tables do not exist:** Apply the SQL migrations to the database referenced by your connection URL.
- **Admin login fails:** Check the `ADMIN_*` values and rerun the admin provisioning script, then try signing in again.
- **Tests fail with database errors:** Confirm that `primewave_test` exists, has the same migrations applied, and is referenced by `TEST_DATABASE_URL`.
- **Port 3000 is already in use:** Stop the process using it or follow the alternate local URL printed by Next.js.

## Project structure (key paths)

```text
src/
  app/
    (dashboard)/      # Dashboard, resources, reservations, users, profile
    api/              # API routes and authentication
  components/         # Shared UI and forms
  lib/                # Database and authentication helpers
db/
  migrations/          # SQL schema migrations
scripts/
  create-admin.ts      # Administrator provisioning