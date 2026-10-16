import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRASI_SEBELUM_007 = [
  "db/migrasi-001.sql",
  "db/migrasi-002-peran.sql",
  "db/migrasi-003-pemulihan-sandi.sql",
  "db/migrasi-004-jenis-pengujian.sql",
  "db/migrasi-005-ketahanan-operasional.sql",
  "db/migrasi-006-akun-uji.sql",
];
const MIGRASI_007 = "db/migrasi-007-multi-akun-uji.sql";

test("migrasi 007 mempertahankan akun terenkripsi lama dan memungkinkan banyak akun per proyek", async () => {
  const db = new PGlite();
  try {
    for (const file of MIGRASI_SEBELUM_007) await db.exec(readFileSync(file, "utf8"));
    const user = await db.query("INSERT INTO th_users (email,nama) VALUES ('synthetic-admin@example.test','Admin sintetis') RETURNING id");
    const userId = (user.rows[0] as { id: string }).id;
    await db.query("INSERT INTO th_projects (id,nama) VALUES ('PRJ-321','Proyek sintetis')");
    await db.query(
      `INSERT INTO th_project_test_accounts
         (project_id,format_version,nonce,ciphertext,auth_tag,diubah_oleh)
       VALUES ('PRJ-321',1,$1,$2,$3,$4::uuid)`,
      [Buffer.alloc(12, 1), Buffer.from("opaque synthetic legacy ciphertext"), Buffer.alloc(16, 2), userId],
    );
    const sebelum = await db.query(
      `SELECT format_version, encode(nonce,'hex') AS nonce,
              encode(ciphertext,'hex') AS ciphertext, encode(auth_tag,'hex') AS auth_tag
       FROM th_project_test_accounts WHERE project_id='PRJ-321'`,
    );

    await db.exec(readFileSync(MIGRASI_007, "utf8"));

    const legacy = await db.query(
      `SELECT id::text AS id, nama_akun, format_version,
              encode(nonce,'hex') AS nonce, encode(ciphertext,'hex') AS ciphertext,
              encode(auth_tag,'hex') AS auth_tag
       FROM th_project_test_accounts WHERE project_id='PRJ-321'`,
    );
    const rowLama = legacy.rows[0] as {
      id: string; nama_akun: string; format_version: number;
      nonce: string; ciphertext: string; auth_tag: string;
    };
    assert.match(rowLama.id, /^[0-9a-f-]{36}$/i);
    assert.equal(rowLama.nama_akun, "Akun uji 1");
    assert.equal(rowLama.format_version, 1);
    assert.deepEqual(
      { format_version: rowLama.format_version, nonce: rowLama.nonce, ciphertext: rowLama.ciphertext, auth_tag: rowLama.auth_tag },
      sebelum.rows[0],
      "nonce, ciphertext, tag, dan versi lama harus identik setelah migrasi",
    );

    // Banyak baris berbeda dapat berada pada proyek yang sama; tidak ada unique limit per proyek.
    for (let i = 1; i <= 12; i++) {
      await db.query(
        `INSERT INTO th_project_test_accounts
           (project_id,nama_akun,format_version,nonce,ciphertext,auth_tag)
         VALUES ('PRJ-321',$1,2,$2,$3,$4)`,
        [`Akun sintetis ${i}`, Buffer.alloc(12, i), Buffer.from(`ciphertext-${i}`), Buffer.alloc(16, i)],
      );
    }
    const daftar = await db.query(
      `SELECT count(*)::int AS jumlah, count(DISTINCT id)::int AS id_unik,
              count(*) FILTER (WHERE format_version=2)::int AS versi_baru
       FROM th_project_test_accounts WHERE project_id='PRJ-321'`,
    );
    assert.deepEqual(daftar.rows[0], { jumlah: 13, id_unik: 13, versi_baru: 12 });

    await assert.rejects(db.query(
      `INSERT INTO th_project_test_accounts
         (project_id,nama_akun,format_version,nonce,ciphertext,auth_tag)
       VALUES ('PRJ-321','Versi invalid',3,$1,$2,$3)`,
      [Buffer.alloc(12), Buffer.from("x"), Buffer.alloc(16)],
    ));

    await db.query("DELETE FROM th_projects WHERE id='PRJ-321'");
    const count = await db.query("SELECT count(*)::int AS n FROM th_project_test_accounts WHERE project_id='PRJ-321'");
    assert.equal((count.rows[0] as { n: number }).n, 0, "akun tetap terhapus bersama proyek");
  } finally {
    await db.close();
  }
});
