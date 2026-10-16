import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRASI = [
  "db/migrasi-001.sql",
  "db/migrasi-002-peran.sql",
  "db/migrasi-003-pemulihan-sandi.sql",
  "db/migrasi-004-jenis-pengujian.sql",
  "db/migrasi-005-ketahanan-operasional.sql",
  "db/migrasi-006-akun-uji.sql",
];

test("akun uji terenkripsi tersimpan dengan ukuran nonce/tag dan terhapus bersama proyek", async () => {
  const db = new PGlite();
  try {
    for (const file of MIGRASI) await db.exec(readFileSync(file, "utf8"));
    const user = await db.query("INSERT INTO th_users (email,nama) VALUES ('synthetic-admin@example.test','Admin sintetis') RETURNING id");
    const userId = (user.rows[0] as { id: string }).id;
    await db.query("INSERT INTO th_projects (id,nama) VALUES ('PRJ-321','Proyek sintetis')");
    await db.query(
      `INSERT INTO th_project_test_accounts
         (project_id,format_version,nonce,ciphertext,auth_tag,diubah_oleh)
       VALUES ('PRJ-321',1,$1,$2,$3,$4::uuid)`,
      [Buffer.alloc(12, 1), Buffer.from("opaque synthetic ciphertext"), Buffer.alloc(16, 2), userId],
    );
    const row = await db.query(
      `SELECT format_version, octet_length(nonce) AS nonce_size,
              octet_length(ciphertext) AS ciphertext_size, octet_length(auth_tag) AS tag_size
       FROM th_project_test_accounts WHERE project_id='PRJ-321'`,
    );
    assert.deepEqual(row.rows[0], { format_version: 1, nonce_size: 12, ciphertext_size: 27, tag_size: 16 });
    await assert.rejects(db.query(
      `INSERT INTO th_project_test_accounts (project_id,format_version,nonce,ciphertext,auth_tag)
       VALUES ('PRJ-321',1,$1,$2,$3)`,
      [Buffer.alloc(11), Buffer.from("x"), Buffer.alloc(16)],
    ));

    await db.query("DELETE FROM th_projects WHERE id='PRJ-321'");
    const count = await db.query("SELECT count(*)::int AS n FROM th_project_test_accounts WHERE project_id='PRJ-321'");
    assert.equal((count.rows[0] as { n: number }).n, 0);
  } finally {
    await db.close();
  }
});
