import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRASI = [
  "db/migrasi-001.sql", "db/migrasi-002-peran.sql", "db/migrasi-003-pemulihan-sandi.sql",
  "db/migrasi-004-jenis-pengujian.sql", "db/migrasi-005-ketahanan-operasional.sql",
  "db/migrasi-006-akun-uji.sql", "db/migrasi-007-multi-akun-uji.sql", "db/migrasi-008-laporan-final.sql",
];

async function databaseSintetis() {
  const db = new PGlite();
  for (const file of MIGRASI) await db.exec(readFileSync(file, "utf8"));
  await db.query("INSERT INTO th_projects (id,nama) VALUES ('PRJ-FINAL','Proyek synthetic only')");
  return db;
}

async function simpan(db: PGlite, versi: number, pdf: Buffer, snapshot: object) {
  return db.query(
    `INSERT INTO th_final_reports (project_id,versi,dibuat_pada,dibuat_oleh,nama_penyusun,sidik_sumber,snapshot,pdf)
     VALUES ('PRJ-FINAL',$1,now(),gen_random_uuid(),'Penyusun synthetic',$2,$3::jsonb,$4) RETURNING id`,
    [versi, ("a".repeat(63) + versi.toString(16)).slice(-64), JSON.stringify(snapshot), pdf],
  );
}

test("migrasi lokal 001–008 terpasang; snapshot tidak dapat diubah/dihapus dan versi proyek unik", async () => {
  const db = await databaseSintetis();
  try {
    const pdf = Buffer.from("%PDF-1.7 synthetic fixture v1", "utf8");
    const snapshot = { format: 1, proyek: { id: "PRJ-FINAL", nama: "Proyek synthetic" }, skenario: [{ status: "FAIL" }] };
    const inserted = await simpan(db, 1, pdf, snapshot);
    const id = (inserted.rows[0] as { id: string }).id;
    await assert.rejects(db.query("UPDATE th_final_reports SET nama_penyusun='diubah' WHERE id=$1", [id]), /immutable/i);
    await assert.rejects(db.query("DELETE FROM th_final_reports WHERE id=$1", [id]), /immutable/i);
    await assert.rejects(simpan(db, 1, Buffer.from("duplicate"), snapshot), /unique|duplicate key/i);
    const count = await db.query("SELECT count(*)::int AS n FROM th_final_reports WHERE project_id='PRJ-FINAL'");
    assert.equal((count.rows[0] as { n: number }).n, 1);
  } finally {
    await db.close();
  }
});

test("penghapusan proyek dibatasi untuk mempertahankan riwayat laporan", async () => {
  const db = await databaseSintetis();
  try {
    await simpan(db, 1, Buffer.from("%PDF synthetic"), { versi: 1 });
    await assert.rejects(db.query("DELETE FROM th_projects WHERE id='PRJ-FINAL'"), /foreign key|still referenced/i);
    const history = await db.query("SELECT count(*)::int AS n FROM th_final_reports WHERE project_id='PRJ-FINAL'");
    assert.equal((history.rows[0] as { n: number }).n, 1);
  } finally {
    await db.close();
  }
});

test("rollback versi baru aman; versi baru tidak mengubah bytea PDF atau JSON snapshot lama", async () => {
  const db = await databaseSintetis();
  try {
    const pdf1 = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x10, 0x11]);
    const snapshot1 = { format: 1, versi: 1, nested: { outcomes: ["FAIL", "PASS"], marker: "old-json" } };
    const first = await simpan(db, 1, pdf1, snapshot1);
    const firstId = (first.rows[0] as { id: string }).id;

    await db.exec("BEGIN");
    await simpan(db, 2, Buffer.from("rolled back"), { versi: 2 });
    await db.exec("ROLLBACK");
    let rows = await db.query(
      "SELECT id::text AS id,versi,snapshot,encode(pdf,'hex') AS pdf FROM th_final_reports WHERE project_id='PRJ-FINAL' ORDER BY versi",
    );
    assert.equal(rows.rows.length, 1, "rollback membatalkan hanya versi yang sedang dibuat");

    await simpan(db, 2, Buffer.from("%PDF synthetic version 2"), { format: 1, versi: 2, marker: "new-json" });
    rows = await db.query(
      "SELECT id::text AS id,versi,snapshot,encode(pdf,'hex') AS pdf FROM th_final_reports WHERE project_id='PRJ-FINAL' ORDER BY versi",
    );
    assert.equal(rows.rows.length, 2);
    const old = rows.rows[0] as { id: string; versi: number; snapshot: unknown; pdf: string };
    assert.equal(old.id, firstId);
    assert.equal(old.versi, 1);
    assert.deepEqual(old.snapshot, snapshot1, "JSON snapshot lama identik byte-semantically sebagai JSON");
    assert.equal(old.pdf, pdf1.toString("hex"), "bytea PDF lama identik");
    assert.deepEqual(rows.rows.map((row) => (row as { versi: number }).versi), [1, 2]);
  } finally {
    await db.close();
  }
});
