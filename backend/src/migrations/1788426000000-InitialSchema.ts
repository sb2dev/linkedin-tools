/** The whole schema in one migration. */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1788426000000 implements MigrationInterface {
  name = 'InitialSchema1788426000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() is core from PostgreSQL 13; the extension keeps 12 working too.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE "profiles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "linkedin_username" character varying(255) NOT NULL,
        "linkedin_url" text NOT NULL,
        "linkedin_id" bigint,
        "full_name" text NOT NULL,
        "first_name" text,
        "last_name" text,
        "middle_name" text,
        "middle_initial" text,
        "gender" text,
        "birth_year" integer,
        "birth_date" text,
        "job_title" text,
        "job_role" text,
        "job_sub_role" text,
        "job_industry" text,
        "job_levels" text array NOT NULL DEFAULT '{}',
        "job_summary" text,
        "job_start_date" text,
        "job_last_updated" text,
        "company_id" text,
        "company_name" text,
        "company_website" text,
        "company_size" text,
        "company_industry" text,
        "company_founded" integer,
        "company_linkedin_url" text,
        "company_linkedin_id" bigint,
        "company_facebook_url" text,
        "company_twitter_url" text,
        "company_location" jsonb,
        "location_name" text,
        "locality" text,
        "metro" text,
        "region" text,
        "country" text,
        "continent" text,
        "street_address" text,
        "postal_code" text,
        "address_line2" text,
        "location_last_updated" text,
        "geo" jsonb,
        "facebook_url" text,
        "facebook_username" text,
        "facebook_id" bigint,
        "twitter_url" text,
        "twitter_username" text,
        "github_url" text,
        "github_username" text,
        "connections" integer,
        "salary_band" text,
        "years_experience" real,
        "summary" text,
        "skills" text array NOT NULL DEFAULT '{}',
        "interests" text array NOT NULL DEFAULT '{}',
        "location_names" text array NOT NULL DEFAULT '{}',
        "region_names" text array NOT NULL DEFAULT '{}',
        "country_names" text array NOT NULL DEFAULT '{}',
        "experience" jsonb,
        "education" jsonb,
        "certifications" jsonb,
        "languages" jsonb,
        "social_profiles" jsonb,
        "addresses" jsonb,
        "contact" jsonb,
        "source_version" jsonb,
        "quality" jsonb NOT NULL,
        "content_hash" character varying(64) NOT NULL,
        "raw" jsonb NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
      )
    `);

    // The business key. Also what ON CONFLICT (linkedin_username) arbitrates on during an import.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "profiles_username_uq" ON "profiles" ("linkedin_username")`,
    );
    // Change detection: an upload asks "which of these hashes do you already have?".
    await queryRunner.query(`CREATE INDEX "profiles_content_hash_idx" ON "profiles" ("content_hash")`);
    // Containment queries over the skills array, which no b-tree index can serve.
    await queryRunner.query(`CREATE INDEX "profiles_skills_gin_idx" ON "profiles" USING GIN ("skills")`);

    await queryRunner.query(`
      CREATE TABLE "import_sessions" (
        "id" uuid NOT NULL,
        "filename" text NOT NULL,
        "size_bytes" bigint NOT NULL,
        "checksum" character varying(64) NOT NULL,
        "status" text NOT NULL,
        "counts" jsonb NOT NULL,
        "preview" jsonb NOT NULL,
        "file" bytea NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "committed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "import_sessions_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "import_sessions_status_chk"
          CHECK ("status" IN ('previewed', 'committed', 'expired'))
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "import_sessions_created_at_idx" ON "import_sessions" ("created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "import_rejections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "import_session_id" uuid NOT NULL,
        "line_number" integer NOT NULL,
        "reason" text NOT NULL,
        "label" text NOT NULL,
        "raw_excerpt" text NOT NULL,
        CONSTRAINT "import_rejections_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "import_rejections_session_fkey" FOREIGN KEY ("import_session_id")
          REFERENCES "import_sessions" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "import_rejections_session_reason_idx"
         ON "import_rejections" ("import_session_id", "reason")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "import_rejections"`);
    await queryRunner.query(`DROP TABLE "import_sessions"`);
    await queryRunner.query(`DROP TABLE "profiles"`);
  }
}
