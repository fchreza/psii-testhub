import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { temukanKekuranganSkema } from "../lib/skema";
import { sebabBlokirHapusSkenario } from "../lib/keamanan-hapus-skenario";

const MIGRASI = [
  "db/migrasi-001.sql",
  "db/migrasi-002-peran.sql",
  "db/migrasi-003-pemulihan-sandi.sql",
  "db/migrasi-004-jenis-pengujian.sql",
  "db/migrasi-005-ketahanan-operasional.sql",
  "db/migrasi-006-akun-uji.sql",
  "db/migrasi-007-multi-akun-uji.sql",
];

async function databaseUji() {
  const db = new PGlite();
  for (const file of MIGRASI) await db.exec(readFileSync(file, "utf8"));
  return db;
}

test("migrasi 001–007 terpasang bersih dan seluruh skema wajib tersedia", async () => {
  const db = await databaseUji();
  try {
    const [tabel, kolom, indeks, peran] = await Promise.all([
      db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'th_%'"),
      db.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'th_%'"),
      db.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'th_%'"),
      db.query("SELECT DISTINCT peran FROM th_users"),
    ]);
    const hilang = temukanKekuranganSkema({
      tabel: (tabel.rows as { tablename: string }[]).map((x) => x.tablename),
      kolom: kolom.rows as { table_name: string; column_name: string }[],
      indeks: (indeks.rows as { indexname: string }[]).map((x) => x.indexname),
      peran: (peran.rows as { peran: string }[]).map((x) => x.peran),
    });
    assert.deepEqual(hilang, []);
    const check = await db.query("SELECT status FROM th_evidence WHERE false");
    assert.equal(check.rows.length, 0);
  } finally {
    await db.close();
  }
});

test("schema gate fails closed on a missing table/column/index or legacy role", () => {
  const missing = temukanKekuranganSkema({
    tabel: [], kolom: [], indeks: [], peran: ["PM"],
  });
  assert.ok(missing.includes("tabel th_evidence_uploads"));
  assert.ok(missing.includes("kolom th_evidence.status"));
  assert.ok(missing.includes("indeks th_evidence_status_idx"));
  assert.ok(missing.includes("role legacy PM"));
});

test("bukti dan intent upload melindungi cascade; audit penghapusan tetap tersimpan", async () => {
  const db = await databaseUji();
  try {
    const user = await db.query("INSERT INTO th_users (email,nama) VALUES ('tester@example.test','Tester') RETURNING id");
    const userId = (user.rows[0] as { id: string }).id;
    await db.query("INSERT INTO th_projects (id,nama) VALUES ('PRJ-001','Project')");

    const withEvidence = await db.query(
      "INSERT INTO th_scenarios (project_id,kode,judul) VALUES ('PRJ-001','SIT-001','With evidence') RETURNING id",
    );
    const evidenceScenarioId = (withEvidence.rows[0] as { id: string }).id;
    await db.query(
      "INSERT INTO th_evidence (scenario_id,path,status,deleted_at) VALUES ($1,'bukti/tombstone.png','DELETED',now())",
      [evidenceScenarioId],
    );
    const evidenceCount = await db.query("SELECT count(*)::int AS n FROM th_evidence WHERE scenario_id=$1", [evidenceScenarioId]);
    const noIntent = await db.query("SELECT count(*)::int AS n FROM th_evidence_uploads WHERE scenario_id=$1", [evidenceScenarioId]);
    assert.equal(sebabBlokirHapusSkenario(
      (evidenceCount.rows[0] as { n: number }).n,
      (noIntent.rows[0] as { n: number }).n,
    ), "bukti", "tombstone tetap mencegah ON DELETE CASCADE");

    const withUpload = await db.query(
      "INSERT INTO th_scenarios (project_id,kode,judul) VALUES ('PRJ-001','SIT-002','With upload history') RETURNING id",
    );
    const uploadScenarioId = (withUpload.rows[0] as { id: string }).id;
    await db.query(
      `INSERT INTO th_evidence_uploads
         (user_id,project_id,scenario_id,idempotency_key,staging_path,final_path,nama_asli,tipe,ukuran,status,expires_at)
       VALUES ($1::uuid,'PRJ-001',$2::uuid,gen_random_uuid(),'bukti-upload/stage.png','bukti/final.png','stage.png','image/png',10,'EXPIRED',now())`,
      [userId, uploadScenarioId],
    );
    const uploadCount = await db.query("SELECT count(*)::int AS n FROM th_evidence_uploads WHERE scenario_id=$1", [uploadScenarioId]);
    assert.equal(sebabBlokirHapusSkenario(0, (uploadCount.rows[0] as { n: number }).n), "unggahan");

    const clean = await db.query(
      "INSERT INTO th_scenarios (project_id,kode,judul) VALUES ('PRJ-001','SIT-003','Clean') RETURNING id",
    );
    const cleanId = (clean.rows[0] as { id: string }).id;
    await db.query(
      `INSERT INTO th_audit_logs (user_id,project_id,scenario_id,aksi,kolom,nilai_lama)
       VALUES ($1::uuid,'PRJ-001',$2::uuid,'ubah_status','status','PENDING')`, [userId, cleanId],
    );
    await db.exec("BEGIN");
    await db.query(
      `INSERT INTO th_audit_logs (user_id,project_id,scenario_id,aksi,kolom,nilai_lama)
       VALUES ($1::uuid,'PRJ-001',$2::uuid,'hapus_skenario','judul','SIT-003 — Clean')`, [userId, cleanId],
    );
    await db.query("DELETE FROM th_scenarios WHERE id=$1::uuid", [cleanId]);
    await db.exec("COMMIT");
    const history = await db.query(
      "SELECT aksi FROM th_audit_logs WHERE scenario_id=$1::uuid ORDER BY id", [cleanId],
    );
    assert.deepEqual((history.rows as { aksi: string }[]).map((x) => x.aksi), ["ubah_status", "hapus_skenario"]);
  } finally {
    await db.close();
  }
});

test("audit+metadata dapat di-rollback bersama, dan update versi stale ditolak oleh optimistic concurrency", async () => {
  const db = await databaseUji();
  try {
    const user = await db.query("INSERT INTO th_users (email,nama) VALUES ('tester@example.test','Tester') RETURNING id");
    const userId = (user.rows[0] as { id: string }).id;
    await db.query("INSERT INTO th_projects (id,nama) VALUES ('PRJ-001','Project')");
    const created = await db.query("INSERT INTO th_scenarios (project_id,kode,judul) VALUES ('PRJ-001','SIT-001','Scenario') RETURNING id,xmin::text AS versi");
    const scenarioId = (created.rows[0] as { id: string }).id;
    const version = (created.rows[0] as { versi: string }).versi;

    await db.exec("BEGIN");
    await db.query("INSERT INTO th_evidence (scenario_id,path,status) VALUES ($1,'bukti/final.png','READY')", [scenarioId]);
    await assert.rejects(db.query("INSERT INTO th_audit_logs (aksi) VALUES (NULL)"));
    await db.exec("ROLLBACK");
    const evidenceCount = await db.query("SELECT count(*)::int AS n FROM th_evidence WHERE scenario_id=$1", [scenarioId]);
    const auditCount = await db.query("SELECT count(*)::int AS n FROM th_audit_logs WHERE scenario_id=$1", [scenarioId]);
    assert.equal((evidenceCount.rows[0] as { n: number }).n, 0);
    assert.equal((auditCount.rows[0] as { n: number }).n, 0);

    const updated = await db.query("UPDATE th_scenarios SET judul='New title' WHERE id=$1 AND xmin::text=$2 RETURNING xmin::text AS versi", [scenarioId, version]);
    assert.equal(updated.rows.length, 1);
    const stale = await db.query("UPDATE th_scenarios SET judul='Stale overwrite' WHERE id=$1 AND xmin::text=$2 RETURNING id", [scenarioId, version]);
    assert.equal(stale.rows.length, 0);
    const latest = await db.query("SELECT judul FROM th_scenarios WHERE id=$1", [scenarioId]);
    assert.equal((latest.rows[0] as { judul: string }).judul, "New title");
    assert.ok(userId);
  } finally {
    await db.close();
  }
});
