/**
 * @module modules/tags/entities/tag.entity
 * @description
 * TypeScript interface representing a row in the `tags` table.
 * This is a plain structural type - not an ORM entity.
 * All persistence is handled via raw SQL in TagsRepository.
 */

/**
 * Represents a single tag row as returned from the database.
 *
 * Schema reference (migration 001–012, tags table):
 *   id          UUID PRIMARY KEY
 *   name        VARCHAR(50) UNIQUE NOT NULL
 *   category    VARCHAR(30) NOT NULL  (no DB CHECK - validated in DTO)
 *   created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
 *   updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
 */
export interface Tag extends Record<string, unknown> {
    id: string;
    name: string;
    category: string;
    created_at: Date;
    updated_at: Date;
}
