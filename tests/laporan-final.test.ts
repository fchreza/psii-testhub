import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  bolehGenerateLaporan, bolehLihatLaporan, hitungLaporan, kesimpulanLaporan,
  layakLaporan, perluPembaruan, peringatanLaporan, sidikLaporan, teksLaporan,
} from "../lib/laporan-final";
import { bacaSumberLaporan } from "../lib/laporan-final-data";
import type { SkenarioLaporan, SumberLaporan } from "../lib/laporan-final-types";

const MIGRASI = [
  "db/migrasi-001.sql", "db/migrasi-002-peran.sql", "db/migrasi-003-pemulihan-sandi.sql",
  "db/migrasi-004-jenis-pengujian.sql", "db/migrasi-005-ketahanan-operasional.sql",
  "db/migrasi-006-akun-uji.sql", "db/migrasi-007-multi-akun-uji.sql", "db/migrasi-008-laporan-final.sql",
];
const PERAN = ["ADMIN", "PIMPINAN", "INTERNAL_PSII", "INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"];

async function databaseUji() {
  const db = new PGlite();
  for (const file of MIGRASI) await db.exec(readFileSync(file, "utf8"));
  return db;
}

function skenario(kode: string, status: SkenarioLaporan["status"], aktual: string | null, diharapkan = "Expected"): SkenarioLaporan {
  return { id: kode, kode, judul: `Judul ${kode}`, langkah: null, diharapkan, aktual, status,
    temuan: null, tindakLanjut: null, penguji: null, siapRetest: false, bukti: [] };
}

test("hanya UAT/SIT_UAT yang SELESAI layak untuk laporan akhir", () => {
  for (const jenis of ["UAT", "SIT_UAT"]) {
    assert.equal(layakLaporan(jenis, "SELESAI"), true, `${jenis} SELESAI harus layak`);
    for (const tahap of ["PERSIAPAN", "SIT", "UAT", "WAITING_SIGNOFF"]) {
      assert.equal(layakLaporan(jenis, tahap), false, `${jenis} ${tahap} belum layak`);
    }
  }
  for (const jenis of ["SIT", "OTHER", "uat", ""]) {
    assert.equal(layakLaporan(jenis, "SELESAI"), false, `${jenis} bukan jenis yang layak`);
  }
});

test("izin laporan untuk kelima peran eksplisit: generate Admin/Internal PSII, lihat tambah Pimpinan", () => {
  const bolehGenerate = new Set(["ADMIN", "INTERNAL_PSII"]);
  const bolehLihat = new Set(["ADMIN", "INTERNAL_PSII", "PIMPINAN"]);
  for (const peran of PERAN) {
    assert.equal(bolehGenerateLaporan(peran), bolehGenerate.has(peran), `${peran}: generate`);
    assert.equal(bolehLihatLaporan(peran), bolehLihat.has(peran), `${peran}: lihat`);
  }
  assert.equal(bolehGenerateLaporan("UNKNOWN"), false);
  assert.equal(bolehLihatLaporan("UNKNOWN"), false);
});

test("hitungan dan peringatan mempertahankan hasil gagal, tertunda, kosong, dan belum diuji", () => {
  const items = [
    skenario("U-1", "PASS", "berhasil"), skenario("U-2", "FAIL", "gagal"),
    skenario("U-3", "BLOCKED", null), skenario("U-4", "PENDING", "", ""),
  ];
  const hitungan = hitungLaporan(items);
  assert.deepEqual(hitungan, { total: 4, lulus: 1, gagal: 1, tertunda: 1, belum: 1 });
  const warnings = peringatanLaporan(items).join("\n");
  assert.match(warnings, /U-3: hasil aktual kosong/);
  assert.match(warnings, /U-3: pengujian belum tuntas/);
  assert.match(warnings, /U-4: hasil aktual kosong/);
  assert.match(warnings, /U-4: pengujian belum tuntas/);
  assert.match(warnings, /U-4: hasil yang diharapkan belum tercatat/);
  assert.match(kesimpulanLaporan(hitungan), /bukan persetujuan kelayakan produksi/);
  assert.match(peringatanLaporan([])[0], /Belum ada skenario UAT/);
});

test("sanitasi membuang URL, locator storage, kredensial berlabel, dan karakter kontrol", () => {
  const sanitized = teksLaporan(
    'URL https://private.example/path?token=abc s3://bucket/private/key bukti-upload/private/file.png password="supersecret" api_key=secret123 authorization: Bearer private-token\u0001',
  )!;
  for (const privateValue of ["https://private.example", "s3://bucket", "bukti-upload/private", "supersecret", "secret123", "private-token"]) {
    assert.equal(sanitized.includes(privateValue), false, `nilai sensitif ${privateValue} tidak boleh tertinggal: ${sanitized}`);
  }
  assert.match(sanitized, /\[tautan tidak disertakan\]/);
  assert.match(sanitized, /\[lokasi privat tidak disertakan\]/);
  assert.match(sanitized, /\[kredensial tidak disertakan\]/);
  assert.equal(teksLaporan(null), null);
  assert.equal(teksLaporan("  \u0001  "), null);
});

test("sanitasi membuang signed URL berawalan www dan protocol-relative", () => {
  for (const url of ["www.example.invalid/path?X-Amz-Signature=private-signature", "//private.example.invalid/path?X-Amz-Credential=private-key"]) {
    assert.equal(teksLaporan(`Bukti: ${url}`), "Bukti: [tautan tidak disertakan]");
  }
});

test("fingerprint berubah untuk revisi sumber meski konten sama; status stale hanya jika sidik berbeda", () => {
  const payload = { nilai: "sama" };
  const before = sidikLaporan(payload as unknown as SumberLaporan, { revisi: "42" });
  const sameRevision = sidikLaporan(payload as unknown as SumberLaporan, { revisi: "42" });
  const newRevisionSameContent = sidikLaporan(payload as unknown as SumberLaporan, { revisi: "43" });
  assert.equal(before, sameRevision);
  assert.notEqual(before, newRevisionSameContent);
  assert.equal(perluPembaruan(before, sameRevision), false);
  assert.equal(perluPembaruan(before, newRevisionSameContent), true);
});

test("sumber laporan whitelist UAT dan sanitasi teks bebas; revisi MVCC menandai stale meski tampilan sama", async () => {
  const db = await databaseUji();
  try {
    const user = await db.query("INSERT INTO th_users (email,nama) VALUES ('synthetic@example.test','Penguji synthetic') RETURNING id");
    const userId = (user.rows[0] as { id: string }).id;
    await db.query(`INSERT INTO th_projects (id,nama,aplikasi,jenis_pengujian,tahap,lingkungan,ruang_lingkup)
      VALUES ('PRJ-008','Proyek synthetic','https://private.example/app','UAT','SELESAI','UAT','api_key=supersecret s3://bucket/private')`);
    const module = await db.query("INSERT INTO th_modules (project_id,kode,nama) VALUES ('PRJ-008','A','Modul A') RETURNING id");
    const moduleId = (module.rows[0] as { id: string }).id;
    const uat = await db.query(`INSERT INTO th_scenarios
      (project_id,module_id,kode,fase,judul,langkah_pengujian,hasil_diharapkan,hasil_aktual,status,penguji_id,catatan_tindak_lanjut)
      VALUES ('PRJ-008',$1,'UAT-1','UAT','Scenario','Visit https://private.example/x','Expected password=hunter2','api_key=secret123 PASS','PASS',$2,'uploads/private/record authorization: Bearer secret') RETURNING id`, [moduleId, userId]);
    const scenarioId = (uat.rows[0] as { id: string }).id;
    await db.query("INSERT INTO th_evidence (scenario_id,path,nama_asli) VALUES ($1,'s3://private-bucket/object','private-object.png')", [scenarioId]);
    await db.query("INSERT INTO th_scenarios (project_id,kode,fase,judul,status) VALUES ('PRJ-008','SIT-1','SIT','SIT excluded','FAIL')");
    // Canary secrets in columns which are intentionally outside the report SELECT whitelist.
    await db.query("UPDATE th_projects SET alamat_server='https://host-secret.example/path' WHERE id='PRJ-008'");

    const queryDb = { unsafe: async (query: string, params?: never[]) => (await db.query(query, params as unknown[] ?? [])).rows };
    const one = await bacaSumberLaporan(queryDb, "PRJ-008");
    assert.ok(one);
    assert.equal(one.sumber.hitungan.total, 1, "hanya fase UAT masuk; SIT tidak ikut");
    assert.equal(one.sumber.hitungan.lulus, 1);
    const serialized = JSON.stringify(one.sumber);
    for (const forbidden of ["private.example", "supersecret", "hunter2", "secret123", "private-bucket", "private-object.png", "host-secret.example", "uploads/private", "Bearer secret"]) {
      assert.equal(serialized.includes(forbidden), false, `data sensitif/leak whitelist: ${forbidden}`);
    }
    const item = one.sumber.modul[0].skenario[0];
    assert.equal(item.temuan, null, "temuan yang tidak memiliki kolom tersendiri tidak dikarang");
    const evidence = await db.query("SELECT id::text AS id FROM th_evidence WHERE scenario_id=$1", [scenarioId]);
    assert.deepEqual(item.bukti, ["BUKTI-" + (evidence.rows[0] as { id: string }).id]);

    await db.query("UPDATE th_projects SET nama=nama WHERE id='PRJ-008'");
    const two = await bacaSumberLaporan(queryDb, "PRJ-008");
    assert.ok(two);
    assert.deepEqual(two.sumber, one.sumber, "nilai yang ditampilkan tetap sama");
    assert.notEqual(two.sidikSumber, one.sidikSumber, "xmin revisi proyek ikut fingerprint meski konten sama");
    assert.equal(perluPembaruan(one.sidikSumber, two.sidikSumber), true);
    assert.equal(await bacaSumberLaporan(queryDb, "PRJ-MISSING"), null);
  } finally {
    await db.close();
  }
});
