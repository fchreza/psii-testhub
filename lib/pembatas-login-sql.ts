/** Satu upsert atomik mencegah race saat beberapa instance menerima login serentak. */
export const SQL_CADANGKAN_PERCOBAAN_LOGIN = `
  INSERT INTO th_login_rate_limits (email_hash, attempts, window_started_at, blocked_until, updated_at)
  VALUES ($1, 1, now(), NULL, now())
  ON CONFLICT (email_hash) DO UPDATE SET
    attempts = CASE
      WHEN th_login_rate_limits.window_started_at <= now() - $2::interval THEN 1
      WHEN th_login_rate_limits.blocked_until > now() THEN th_login_rate_limits.attempts
      ELSE th_login_rate_limits.attempts + 1
    END,
    window_started_at = CASE
      WHEN th_login_rate_limits.window_started_at <= now() - $2::interval THEN now()
      ELSE th_login_rate_limits.window_started_at
    END,
    blocked_until = CASE
      WHEN th_login_rate_limits.window_started_at <= now() - $2::interval THEN NULL
      WHEN th_login_rate_limits.blocked_until > now() THEN th_login_rate_limits.blocked_until
      WHEN th_login_rate_limits.attempts + 1 > $3 THEN now() + $2::interval
      ELSE NULL
    END,
    updated_at = now()
  RETURNING attempts,
    (attempts <= $3 AND (blocked_until IS NULL OR blocked_until <= now())) AS boleh,
    CASE WHEN blocked_until > now()
      THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (blocked_until - now())) / 60))::int
      ELSE 0 END AS sisa
`;
