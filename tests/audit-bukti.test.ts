import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { bacaAuditBukti, serialisasiAuditBukti } from "../lib/audit-bukti";

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

test("metadata audit menyimpan outcome dan alasan aman tanpa URL/kredensial/kunci storage", () => {
  assert.deepEqual(bacaAuditBukti(serialisasiAuditBukti("uploaded")), {
    version: 1, outcome: "uploaded", reason: null,
  });
  const aman = serialisasiAuditBukti(
    "pending",
    "Coba ulang https://bucket.example/bukti/secret?X-Amz-Signature=abc AKIA1234567890ABCDEF Bearer token123 password=rahasia bukti/PRJ/secret.png",
  );
  const metadata = bacaAuditBukti(aman);
  assert.equal(metadata?.outcome, "pending");
  assert.ok(metadata?.reason?.includes("[URL disembunyikan]"));
  assert.ok(metadata?.reason?.includes("[kredensial disembunyikan]"));
  assert.ok(metadata?.reason?.includes("[token disembunyikan]"));
  assert.ok(metadata?.reason?.includes("password=[disembunyikan]"));
  assert.ok(metadata?.reason?.includes("[kunci penyimpanan disembunyikan]"));
  assert.ok(!aman.includes("X-Amz-Signature"));
  assert.ok(!aman.includes("AKIA1234567890ABCDEF"));
  assert.ok(!aman.includes("token123"));
  assert.ok(!aman.includes("rahasia"));
  assert.ok(!aman.includes("bukti/PRJ/secret.png"));
  assert.equal(bacaAuditBukti("bukan-json"), null);
  assert.equal(bacaAuditBukti('{"version":1,"outcome":"unknown","reason":null}'), null);
});

test("event upload dan hapus terhubung ke ID bukti dan status selesai mengikuti transaksi tombstone", async () => {
  const db = await databaseUji();
  try {
    const user = await db.query("INSERT INTO th_users (email,nama) VALUES ('audit@example.test','Auditor') RETURNING id");
    const userId = (user.rows[0] as { id: string }).id;
    await db.query("INSERT INTO th_projects (id,nama) VALUES ('AUD-001','Proyek sintetis')");
    const scenario = await db.query(
      "INSERT INTO th_scenarios (project_id,kode,judul) VALUES ('AUD-001','SIT-001','Skenario sintetis') RETURNING id",
    );
    const scenarioId = (scenario.rows[0] as { id: string }).id;
    const evidence = await db.query(
      `INSERT INTO th_evidence (scenario_id,path,nama_asli,tipe,ukuran,diunggah_oleh,status)
       VALUES ($1::uuid,'bukti/server-generated-key.png','private-name.png','image/png',10,$2::uuid,'READY') RETURNING id`,
      [scenarioId, userId],
    );
    const evidenceId = (evidence.rows[0] as { id: string }).id;

    await db.query(
      `INSERT INTO th_audit_logs (user_id,project_id,scenario_id,aksi,kolom,nilai_lama,nilai_baru)
       VALUES ($1::uuid,'AUD-001',$2::uuid,'unggah_bukti','evidence_event',$3,$4)`,
      [userId, scenarioId, evidenceId, serialisasiAuditBukti("uploaded")],
    );
    await db.exec("BEGIN");
    await db.query("UPDATE th_evidence SET status='DELETE_PENDING' WHERE id=$1::uuid", [evidenceId]);
    const pending = await db.query(
      `INSERT INTO th_audit_logs (user_id,project_id,scenario_id,aksi,kolom,nilai_lama,nilai_baru)
       VALUES ($1::uuid,'AUD-001',$2::uuid,'hapus_bukti','evidence_event',$3,$4) RETURNING id`,
      [userId, scenarioId, evidenceId, serialisasiAuditBukti("pending", "Alasan sintetis")],
    );
    await db.exec("COMMIT");
    const pendingId = (pending.rows[0] as { id: string }).id;
    await db.query("UPDATE th_audit_logs SET pada='2020-01-01T00:00:00Z'::timestamptz WHERE id=$1::bigint", [pendingId]);

    await db.exec("BEGIN");
    await db.query("UPDATE th_evidence SET status='DELETED', deleted_at=now() WHERE id=$1::uuid", [evidenceId]);
    await db.query("SELECT 1 / 0").catch(() => undefined);
    await db.exec("ROLLBACK");
    const afterRollback = await db.query("SELECT status FROM th_evidence WHERE id=$1::uuid", [evidenceId]);
    assert.equal((afterRollback.rows[0] as { status: string }).status, "DELETE_PENDING");

    await db.exec("BEGIN");
    await db.query("UPDATE th_evidence SET status='DELETED', deleted_at=now() WHERE id=$1::uuid", [evidenceId]);
    await db.query("UPDATE th_audit_logs SET nilai_baru=$2, pada=now() WHERE id=$1::bigint", [pendingId, serialisasiAuditBukti("deleted", "Alasan sintetis")]);
    await db.exec("COMMIT");

    const history = await db.query(
      `SELECT user_id::text AS user_id, project_id, scenario_id::text AS scenario_id,
              aksi, kolom, nilai_lama, nilai_baru, pada
       FROM th_audit_logs WHERE scenario_id=$1::uuid ORDER BY id`, [scenarioId],
    );
    const events = history.rows as {
      user_id: string; project_id: string; scenario_id: string; aksi: string; kolom: string;
      nilai_lama: string | null; nilai_baru: string | null; pada: Date | string;
    }[];
    assert.equal(events.length, 2);
    for (const event of events) {
      assert.equal(event.user_id, userId);
      assert.equal(event.project_id, "AUD-001");
      assert.equal(event.scenario_id, scenarioId);
      assert.equal(event.kolom, "evidence_event");
      assert.equal(event.nilai_lama, evidenceId);
      assert.ok(event.pada);
      assert.ok(!event.nilai_baru?.includes("private-name.png"));
      assert.ok(!event.nilai_baru?.includes("server-generated-key"));
    }
    assert.equal(events[0].aksi, "unggah_bukti");
    assert.equal(bacaAuditBukti(events[0].nilai_baru)?.outcome, "uploaded");
    assert.equal(events[1].aksi, "hapus_bukti");
    assert.equal(bacaAuditBukti(events[1].nilai_baru)?.outcome, "deleted");
    assert.ok(new Date(events[1].pada).getTime() > Date.parse("2020-01-01T00:00:00Z"));
    const finalEvidence = await db.query("SELECT status FROM th_evidence WHERE id=$1::uuid", [evidenceId]);
    assert.equal((finalEvidence.rows[0] as { status: string }).status, "DELETED");
  } finally {
    await db.close();
  }
});

test("jalur implementasi memakai outcome dan ID bukti, bukan nama/path dalam audit baru", () => {
  const upload = readFileSync("lib/bukti-operasi.ts", "utf8");
  const deleteRoute = readFileSync("app/api/v1/bukti/route.ts", "utf8");
  const adminCleanup = readFileSync("app/api/v1/skenario/route.ts", "utf8");
  const historyUI = readFileSync("components/panel-skenario.tsx", "utf8");
  const evidenceUI = readFileSync("components/bukti-skenario.tsx", "utf8");
  assert.match(upload, /'unggah_bukti', 'evidence_event', \$4, \$5/);
  assert.match(upload, /evidence\.id, serialisasiAuditBukti\("uploaded"\)/);
  assert.match(deleteRoute, /'hapus_bukti', 'evidence_event', \$4, \$5/);
  assert.match(deleteRoute, /bukti\.id, serialisasiAuditBukti\("pending"/);
  assert.match(adminCleanup, /serialisasiAuditBukti\("pending"/);
  assert.match(adminCleanup, /serialisasiAuditBukti\("deleted"/);
  assert.match(upload, /SET nilai_baru = \$2, pada = now\(\)/);
  assert.match(historyUI, /bacaAuditBukti/);
  assert.match(historyUI, /CACHE_RIWAYAT\.delete\(skenario\.id\)/);
  assert.match(historyUI, /Penghapusan bukti tertunda/);
  assert.match(evidenceUI, /onRiwayatBerubah\?\.\(\)/);
  assert.match(historyUI, /ID bukti tidak tersedia \(riwayat lama\)/);
});
