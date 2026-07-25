-- Data-only migration (no column type change - "kind" was always a plain String, never a
-- real Postgres enum). Trip A/B are not distinct categories once a manual trip is closed -
-- only the free-text "label" column still distinguishes them. See schema.prisma's comment
-- on Trip.kind and cloud/DESIGN.md §10.
UPDATE "trips" SET "kind" = 'manual' WHERE "kind" IN ('manual_a', 'manual_b');
