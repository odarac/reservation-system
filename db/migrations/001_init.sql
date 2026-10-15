BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    description TEXT,
    type VARCHAR(30) NOT NULL
        CHECK (type IN ('room', 'equipment', 'workstation', 'other')),
    capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT resources_name_not_blank
        CHECK (LENGTH(TRIM(name)) > 0)
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_name_not_blank
        CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT users_email_not_blank
        CHECK (LENGTH(TRIM(email)) > 0)
);

CREATE UNIQUE INDEX users_email_lower_unique
    ON users (LOWER(email));

CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL
        REFERENCES resources(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(160) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT reservations_title_not_blank
        CHECK (LENGTH(TRIM(title)) > 0),

    CONSTRAINT reservations_valid_time_range
        CHECK (end_time > start_time),

    CONSTRAINT reservations_no_overlap
        EXCLUDE USING gist (
            resource_id WITH =,
            tstzrange(start_time, end_time, '[)') WITH &&
        )
        WHERE (status = 'confirmed')
);

CREATE INDEX reservations_resource_start_idx
    ON reservations (resource_id, start_time);

CREATE INDEX reservations_user_start_idx
    ON reservations (user_id, start_time);

COMMIT;