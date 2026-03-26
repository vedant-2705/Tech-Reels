/**
 * Migration: 016_seed_badges
 *
 * Seeds the badge catalogue. All badges the gamification module evaluates
 * must exist here before the badge_evaluation_queue worker runs.
 *
 * criteria JSONB shape (read by BadgeCriteriaRegistry):
 *   { "type": "challenge_correct_count", "threshold": N }
 *   { "type": "accuracy_streak",         "threshold": N }
 *   { "type": "topic_master",            "tagId": null  }   <- stub
 *
 * Badge codes are the stable identifier used in application code.
 * Never rename a code after it has been awarded to users.
 *
 * UUIDs are hardcoded v4 constants so the seed is idempotent across
 * environments (dev / staging / prod share the same badge IDs).
 *
 * event_trigger: the badge_evaluation_queue event string that causes
 * this badge to be evaluated. Stored in criteria for the registry
 * to filter which badges to check per event.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    INSERT INTO badges (id, code, name, description, icon_url, criteria, is_active, created_at, updated_at)
    VALUES

      -- -----------------------------------------------------------------------
      -- Challenge correct count badges
      -- -----------------------------------------------------------------------

      (
        '01900000-0000-7000-8000-000000000001',
        'first_correct',
        'First Blood',
        'Answer your first challenge correctly.',
        'https://cdn.techreel.io/badges/first_correct.png',
        '{"type": "challenge_correct_count", "threshold": 1, "event_trigger": "challenge_correct"}'::jsonb,
        true,
        now(), now()
      ),

      (
        '01900000-0000-7000-8000-000000000002',
        'challenge_10',
        'On a Roll',
        'Answer 10 challenges correctly.',
        'https://cdn.techreel.io/badges/challenge_10.png',
        '{"type": "challenge_correct_count", "threshold": 10, "event_trigger": "challenge_correct"}'::jsonb,
        true,
        now(), now()
      ),

      (
        '01900000-0000-7000-8000-000000000003',
        'challenge_50',
        'Half Century',
        'Answer 50 challenges correctly.',
        'https://cdn.techreel.io/badges/challenge_50.png',
        '{"type": "challenge_correct_count", "threshold": 50, "event_trigger": "challenge_correct"}'::jsonb,
        true,
        now(), now()
      ),

      (
        '01900000-0000-7000-8000-000000000004',
        'challenge_master',
        'Challenge Master',
        'Answer 100 challenges correctly.',
        'https://cdn.techreel.io/badges/challenge_master.png',
        '{"type": "challenge_correct_count", "threshold": 100, "event_trigger": "challenge_correct"}'::jsonb,
        true,
        now(), now()
      ),

      -- -----------------------------------------------------------------------
      -- Accuracy streak badges
      -- Accuracy streak = N consecutive correct answers (no incorrect in between)
      -- -----------------------------------------------------------------------

      (
        '01900000-0000-7000-8000-000000000005',
        'accuracy_streak_5',
        'Sharp Mind',
        'Answer 5 challenges in a row correctly.',
        'https://cdn.techreel.io/badges/accuracy_streak_5.png',
        '{"type": "accuracy_streak", "threshold": 5, "event_trigger": "challenge_correct"}'::jsonb,
        true,
        now(), now()
      ),

      (
        '01900000-0000-7000-8000-000000000006',
        'accuracy_streak_20',
        'Unstoppable',
        'Answer 20 challenges in a row correctly.',
        'https://cdn.techreel.io/badges/accuracy_streak_20.png',
        '{"type": "accuracy_streak", "threshold": 20, "event_trigger": "challenge_correct"}'::jsonb,
        true,
        now(), now()
      ),

      -- -----------------------------------------------------------------------
      -- Reel watch badges
      -- -----------------------------------------------------------------------

      (
        '01900000-0000-7000-8000-000000000007',
        'first_watch',
        'First Watch',
        'Watch your first reel to completion.',
        'https://cdn.techreel.io/badges/first_watch.png',
        '{"type": "challenge_correct_count", "threshold": 0, "event_trigger": "reel_watched"}'::jsonb,
        false,
        now(), now()
      ),

      -- -----------------------------------------------------------------------
      -- Topic master badges (stub - evaluate returns false until implemented)
      -- One generic row: actual per-tag badges created dynamically when tags
      -- are added. tagId is null here as a template reference only.
      -- -----------------------------------------------------------------------

      (
        '01900000-0000-7000-8000-000000000008',
        'topic_master_template',
        'Topic Master',
        'Master a specific topic by achieving top affinity score.',
        'https://cdn.techreel.io/badges/topic_master.png',
        '{"type": "topic_master", "tagId": null, "event_trigger": "challenge_correct"}'::jsonb,
        false,
        now(), now()
      )

    ON CONFLICT (code) DO NOTHING;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
    DELETE FROM badges WHERE code IN (
      'first_correct',
      'challenge_10',
      'challenge_50',
      'challenge_master',
      'accuracy_streak_5',
      'accuracy_streak_20',
      'first_watch',
      'topic_master_template'
    );
  `);
};
