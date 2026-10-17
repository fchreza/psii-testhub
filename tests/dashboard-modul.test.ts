import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kelompokkanModulPerProyek, type ModulDashboard } from "../lib/dashboard";

const dashboard = readFileSync("app/dashboard/page.tsx", "utf8");
const tampilan = readFileSync("components/kemajuan-proyek-dashboard.tsx", "utf8");

function modul(projectId: string, proyek: string, kode: string, nama: string): ModulDashboard {
  return {
    project_id: projectId,
    proyek,
    kode,
    nama,
    total: 4,
    lulus: 2,
    gagal: 1,
    tertunda: 0,
    belum: 1,
  };
}

test("modul dari beberapa proyek tetap berada di kelompok project_id yang benar", () => {
  const baris = [
    modul("PRJ-A", "Proyek dengan nama sama", "A", "Login"),
    modul("PRJ-A", "Proyek dengan nama sama", "B", "Administrasi"),
    modul("PRJ-B", "Proyek dengan nama sama", "A", "Login eksternal"),
    modul("PRJ-B", "Proyek dengan nama sama", "C", "Pelaporan"),
  ];

  const kelompok = kelompokkanModulPerProyek(baris);
  assert.deepEqual([...kelompok.keys()], ["PRJ-A", "PRJ-B"]);
  assert.deepEqual(kelompok.get("PRJ-A")?.map((m) => m.nama), ["Login", "Administrasi"]);
  assert.deepEqual(kelompok.get("PRJ-B")?.map((m) => m.nama), ["Login eksternal", "Pelaporan"]);
  assert.ok(kelompok.get("PRJ-A")?.every((m) => m.project_id === "PRJ-A"));
  assert.ok(kelompok.get("PRJ-B")?.every((m) => m.project_id === "PRJ-B"));
});

test("query mencocokkan project_id skenario dengan pemilik modul dan UI menampilkan modul di disclosure proyek induk", () => {
  assert.match(dashboard, /LEFT JOIN th_scenarios s ON s\.module_id = m\.id AND s\.project_id = p\.id/);
  assert.match(dashboard, /kelompokkanModulPerProyek\(perModul\)/);
  assert.doesNotMatch(dashboard, /section aria-label="Kemajuan per modul"/);
  assert.match(tampilan, /modulPerProyek\.get\(p\.id\)/);
  assert.match(tampilan, /<details className="group">/);
  assert.match(tampilan, /untuk proyek/);
});
