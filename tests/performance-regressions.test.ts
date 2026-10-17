import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { perluMuatAkunUji } from "../lib/akun-uji-state";
import {
  hitungJumlahPerModul,
  hitungStatistikSkenario,
  perbaruiSkenarioDanHitung,
} from "../lib/proyek-skenario-state";

type Baris = { id: string; status: string; module_id: string | null; versi: string };

const MIGRASI = [
  "db/migrasi-001.sql",
  "db/migrasi-002-peran.sql",
  "db/migrasi-003-pemulihan-sandi.sql",
  "db/migrasi-004-jenis-pengujian.sql",
  "db/migrasi-005-ketahanan-operasional.sql",
  "db/migrasi-006-akun-uji.sql",
  "db/migrasi-007-multi-akun-uji.sql",
];

async function databaseSintetis() {
  const db = new PGlite();
  for (const file of MIGRASI) await db.exec(readFileSync(file, "utf8"));
  return db;
}

function sqlDariSumber(sumber: string, pola: RegExp, label: string): string {
  const sql = sumber.match(pola)?.[1];
  assert.ok(sql, `SQL ${label} harus tetap tersedia pada handler`);
  return sql;
}

const skenarioRoute = readFileSync("app/api/v1/skenario/route.ts", "utf8");
const modulRoute = readFileSync("app/api/v1/proyek/[id]/modul/route.ts", "utf8");

test("edit lokal mengubah row dan statistik; draf belum disimpan tidak ikut dihitung", () => {
  const awal: Baris[] = [
    { id: "s1", status: "PENDING", module_id: "m1", versi: "1" },
    { id: "s2", status: "PASS", module_id: "m1", versi: "2" },
    { id: "s3", status: "FAIL", module_id: null, versi: "3" },
    { id: "s4", status: "BLOCKED", module_id: "m2", versi: "4" },
    { id: "draft:1", status: "PASS", module_id: "m2", versi: "draft" },
  ];
  assert.deepEqual(hitungStatistikSkenario(awal), { total: 4, lulus: 1, gagal: 1, tertunda: 1, belum: 1 });

  const hasil = perbaruiSkenarioDanHitung(awal, "s1", { status: "PASS", versi: "5" });
  assert.equal(hasil.skenario.find((item) => item.id === "s1")?.versi, "5");
  assert.deepEqual(hasil.statistik, { total: 4, lulus: 2, gagal: 1, tertunda: 1, belum: 0 });
  assert.equal(awal[0].status, "PENDING", "snapshot asal tidak dimutasi");
});

test("hitungan worksheet satu-pass mencakup tiap modul dan baris tanpa modul", () => {
  const jumlah = hitungJumlahPerModul([
    { module_id: "m1" }, { module_id: "m1" }, { module_id: "m2" },
    { module_id: null }, { module_id: null },
  ]);
  assert.deepEqual([...jumlah.entries()], [["m1", 2], ["m2", 1], [null, 2]]);
});

test("daftar akun uji tidak dimuat sebelum panel dibuka dan tidak diminta ulang setelah sukses", () => {
  assert.equal(perluMuatAkunUji(false, false, false), false);
  assert.equal(perluMuatAkunUji(true, false, false), true);
  assert.equal(perluMuatAkunUji(true, false, true), false);
  assert.equal(perluMuatAkunUji(true, true, false), false);
});

test("edit biasa tidak meminta ringkasan penuh; konflik, struktur, visibility, dan refresh manual tetap tersedia", () => {
  const tabel = readFileSync("components/tabel-skenario.tsx", "utf8");
  const area = readFileSync("components/area-skenario-proyek.tsx", "utf8");
  assert.match(tabel, /if \(j\.konflik === true \|\| r\.status === 409\) onDataMutasi\?\.\(\)/);
  assert.match(tabel, /if \("moduleId" in tambalan\) onDataMutasi\?\.\(\);\s*else onSkenarioBerubah\?\./);
  assert.match(tabel, /const UKURAN_HALAMAN = 100/);
  assert.match(tabel, /slice\(awalHalaman, awalHalaman \+ UKURAN_HALAMAN\)/);
  assert.match(area, /ringkasan\?fase=/);
  assert.match(area, /visibilitychange/);
  assert.match(area, /onClick=\{\(\) => void segarkan\(true\)\}/);
  assert.match(area, /onDibuat=\{\(baru\) => \{[\s\S]*?refreshSetelahMutasi\(\);/);
});

test("edit metadata memakai respons lokal, bukan router.refresh", () => {
  const editor = readFileSync("components/editor-metadata-proyek.tsx", "utf8");
  const route = readFileSync("app/api/v1/proyek/route.ts", "utf8");
  assert.match(editor, /hasil\.metadata/);
  assert.doesNotMatch(editor, /router\.refresh\(\)/);
  assert.match(route, /metadata: hasil\.metadata/);
});

test("SQL insert skenario mengembalikan versi xmin dan menyimpan audit dalam CTE atomik", async () => {
  const db = await databaseSintetis();
  try {
    const user = await db.query("INSERT INTO th_users (email,nama) VALUES ('perf@example.test','Synthetic User') RETURNING id");
    const userId = (user.rows[0] as { id: string }).id;
    await db.query("INSERT INTO th_projects (id,nama) VALUES ('PRJ-901','Synthetic Project')");
    const sql = sqlDariSumber(
      skenarioRoute,
      /const baru = await tx\.unsafe\(\s*`([\s\S]*?)`,\s*\[projectId, isi\.moduleId/,
      "insert skenario dengan audit",
    );
    const params = ["PRJ-901", null, "S-01", "SIT", "Synthetic scenario", null, null, null, null, 0, userId];
    const inserted = await db.query(sql, params);
    assert.equal(inserted.rows.length, 1);
    assert.equal((inserted.rows[0] as { kode: string }).kode, "S-01");
    assert.equal(typeof (inserted.rows[0] as { versi: string }).versi, "string");
    const aggregateSql = sqlDariSumber(
      skenarioRoute,
      /const \[urut\] = \(await tx\.unsafe\(\s*`([\s\S]*?)`,\s*\[projectId, fase,/,
      "agregat kode dan urutan skenario",
    );
    const aggregate = await db.query(aggregateSql, ["PRJ-901", "SIT", "S-%"]);
    assert.deepEqual(aggregate.rows[0], { n: 1, posisi: 1 });

    const badParams = [...params];
    badParams[2] = "S-02";
    badParams[10] = "00000000-0000-4000-8000-000000000000";
    await assert.rejects(db.query(sql, badParams), /foreign key|violates/i);
    const scenarios = await db.query("SELECT kode FROM th_scenarios WHERE project_id='PRJ-901' ORDER BY kode");
    const audits = await db.query("SELECT aksi FROM th_audit_logs WHERE project_id='PRJ-901' AND aksi='tambah_skenario'");
    assert.deepEqual((scenarios.rows as { kode: string }[]).map((item) => item.kode), ["S-01"]);
    assert.equal(audits.rows.length, 1, "satu audit untuk satu insert yang berhasil");
  } finally {
    await db.close();
  }
});

test("SQL insert worksheet menyimpan audit dan baris dalam satu statement", async () => {
  const db = await databaseSintetis();
  try {
    const user = await db.query("INSERT INTO th_users (email,nama) VALUES ('module@example.test','Synthetic User') RETURNING id");
    const userId = (user.rows[0] as { id: string }).id;
    await db.query("INSERT INTO th_projects (id,nama) VALUES ('PRJ-902','Synthetic Project')");
    const sql = sqlDariSumber(
      modulRoute,
      /const \[modul\] = \(await tx\.unsafe\(\s*`([\s\S]*?)`,\s*\[projectId, kode, nama\.nama/,
      "insert worksheet dengan audit",
    );
    const summarySql = sqlDariSumber(
      modulRoute,
      /const \[ringkasan\] = \(await tx\.unsafe\(\s*`([\s\S]*?)`,\s*\[projectId\],\s*\)/,
      "agregat kode worksheet dan posisi",
    );
    const summaryAwal = await db.query(summarySql, ["PRJ-902"]);
    assert.deepEqual(summaryAwal.rows[0], { kode_terpakai: [], posisi: 0 });
    const inserted = await db.query(sql, ["PRJ-902", "L001", "Synthetic worksheet", 0, userId]);
    assert.equal(inserted.rows.length, 1);
    assert.equal((inserted.rows[0] as { kode: string }).kode, "L001");
    const summaryAkhir = await db.query(summarySql, ["PRJ-902"]);
    assert.deepEqual(summaryAkhir.rows[0], { kode_terpakai: ["L001"], posisi: 1 });

    await assert.rejects(
      db.query(sql, ["PRJ-902", "L002", "Rolled back worksheet", 1, "00000000-0000-4000-8000-000000000000"]),
      /foreign key|violates/i,
    );
    const rows = await db.query("SELECT kode FROM th_modules WHERE project_id='PRJ-902' ORDER BY kode");
    const audits = await db.query("SELECT aksi FROM th_audit_logs WHERE project_id='PRJ-902' AND aksi='tambah_modul'");
    assert.deepEqual((rows.rows as { kode: string }[]).map((item) => item.kode), ["L001"]);
    assert.equal(audits.rows.length, 1);
  } finally {
    await db.close();
  }
});
