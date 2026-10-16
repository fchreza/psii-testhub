import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { SQL_CADANGKAN_PERCOBAAN_LOGIN } from "../lib/pembatas-login-sql";

const MIGRASI = [
  "db/migrasi-001.sql", "db/migrasi-002-peran.sql", "db/migrasi-003-pemulihan-sandi.sql",
  "db/migrasi-004-jenis-pengujian.sql", "db/migrasi-005-ketahanan-operasional.sql",
];

test("rate limit atomik mengizinkan 10 percobaan, menolak selanjutnya, lalu reset setelah TTL", async () => {
  const db = new PGlite();
  try {
    for (const file of MIGRASI) await db.exec(readFileSync(file, "utf8"));
    const hash = "a".repeat(64);
    for (let i = 1; i <= 10; i++) {
      const result = await db.query(SQL_CADANGKAN_PERCOBAAN_LOGIN, [hash, "15 minutes", 10]);
      const row = result.rows[0] as { attempts: number; boleh: boolean };
      assert.equal(row.attempts, i);
      assert.equal(row.boleh, true);
    }
    for (let i = 0; i < 2; i++) {
      const result = await db.query(SQL_CADANGKAN_PERCOBAAN_LOGIN, [hash, "15 minutes", 10]);
      const row = result.rows[0] as { attempts: number; boleh: boolean; sisa: number };
      assert.equal(row.boleh, false);
      assert.ok(row.sisa > 0);
    }
    await db.query("UPDATE th_login_rate_limits SET window_started_at=now()-interval '16 minutes', blocked_until=NULL WHERE email_hash=$1", [hash]);
    const reset = await db.query(SQL_CADANGKAN_PERCOBAAN_LOGIN, [hash, "15 minutes", 10]);
    const rowReset = reset.rows[0] as { attempts: number; boleh: boolean };
    assert.equal(rowReset.attempts, 1);
    assert.equal(rowReset.boleh, true);
  } finally {
    await db.close();
  }
});
