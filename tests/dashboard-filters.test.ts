import test from "node:test";
import assert from "node:assert/strict";
import {
  filterProyekDashboard,
  type ModulDashboard,
  type ProyekDashboard,
} from "../lib/dashboard";

function proyek(
  id: string,
  overrides: Partial<ProyekDashboard> = {},
): ProyekDashboard {
  return {
    id,
    nama: "Proyek",
    unit_bisnis: "Unit",
    tahap: "Berjalan",
    aplikasi: "Aplikasi",
    modul: "Modul proyek",
    jenis_pengujian: "Regresi",
    tanggal_mulai: "2025-03-10",
    modul_aplikasi: null,
    target_selesai: "2025-03-20",
    total: 0,
    lulus: 0,
    gagal: 0,
    tertunda: 0,
    belum: 0,
    ...overrides,
  };
}

function modul(projectId: string, kode: string, nama: string): ModulDashboard {
  return {
    project_id: projectId,
    proyek: "Nama proyek sama",
    kode,
    nama,
    total: 1,
    lulus: 0,
    gagal: 0,
    tertunda: 0,
    belum: 1,
  };
}

test("filter tahap/status memilih parent proyek saja", () => {
  const items = [
    proyek("A", { tahap: "Perencanaan" }),
    proyek("B", { tahap: "Berjalan" }),
    proyek("C", { tahap: "Selesai" }),
  ];
  const hasil = filterProyekDashboard(items, new Map(), { status: "berjalan" });
  assert.deepEqual(hasil.proyek.map((item) => item.id), ["B"]);
});

test("rentang tanggal inklusif menerima batas awal, batas akhir, dan overlap", () => {
  const items = [
    proyek("awal", { tanggal_mulai: "2025-03-01", target_selesai: "2025-03-10" }),
    proyek("akhir", { tanggal_mulai: "2025-03-20", target_selesai: "2025-03-31" }),
    proyek("overlap", { tanggal_mulai: "2025-03-12", target_selesai: "2025-03-18" }),
    proyek("sebelum", { tanggal_mulai: "2025-02-01", target_selesai: "2025-03-09" }),
    proyek("sesudah", { tanggal_mulai: "2025-03-21", target_selesai: "2025-04-01" }),
  ];
  const hasil = filterProyekDashboard(items, new Map(), {
    tanggalMulai: new Date("2025-03-10T00:00:00Z"),
    tanggalSelesai: "2025-03-20",
  });
  assert.deepEqual(hasil.proyek.map((item) => item.id), ["awal", "akhir", "overlap"]);
});

test("endpoint jadwal proyek null diperlakukan sebagai rentang terbuka", () => {
  const items = [
    proyek("tanpa-awal", { tanggal_mulai: null, target_selesai: "2025-03-16" }),
    proyek("tanpa-akhir", { tanggal_mulai: "2025-03-18", target_selesai: null }),
    proyek("tanpa-keduanya", { tanggal_mulai: null, target_selesai: null }),
    proyek("tak-beririsan", { tanggal_mulai: "2025-04-01", target_selesai: null }),
  ];
  const hasil = filterProyekDashboard(items, new Map(), {
    tanggalMulai: "2025-03-15",
    tanggalSelesai: "2025-03-20",
  });
  assert.deepEqual(hasil.proyek.map((item) => item.id), ["tanpa-awal", "tanpa-akhir", "tanpa-keduanya"]);
});

test("search project case-insensitive dan diakritik-insensitive mempertahankan semua modul", () => {
  const item = proyek("PRJ-Á", {
    nama: "Validasi Kualitas",
    unit_bisnis: "Layanan Médik",
    aplikasi: "Portal Uji",
    modul: "Pengelolaan",
    jenis_pengujian: "UAT",
    tahap: "Berjalan",
  });
  const modules = new Map([[item.id, [modul(item.id, "A", "Login"), modul(item.id, "B", "Laporan")]]]);
  const hasil = filterProyekDashboard([item], modules, { teks: "MEDIK" });
  assert.deepEqual(hasil.proyek.map((value) => value.id), ["PRJ-Á"]);
  assert.deepEqual(hasil.modulPerProyek.get(item.id)?.map((value) => value.kode), ["A", "B"]);
});

test("search module hanya memunculkan modul cocok dan tidak mengasosiasikan proyek bernama sama", () => {
  const pertama = proyek("PRJ-1", { nama: "Nama sama" });
  const kedua = proyek("PRJ-2", { nama: "Nama sama" });
  const modules = new Map<string, ModulDashboard[]>([
    [pertama.id, [modul(pertama.id, "AUTH", "Autentikasi"), modul(pertama.id, "RPT", "Laporan")]],
    [kedua.id, [modul(kedua.id, "AUTH", "Autentikasi eksternal"), modul(kedua.id, "CFG", "Konfigurasi")]],
  ]);
  const hasil = filterProyekDashboard([pertama, kedua], modules, { teks: "autentikasi eksternal" });
  assert.deepEqual(hasil.proyek.map((item) => item.id), ["PRJ-2"]);
  assert.deepEqual(hasil.modulPerProyek.get("PRJ-2")?.map((item) => item.nama), ["Autentikasi eksternal"]);
  assert.equal(hasil.modulPerProyek.has("PRJ-1"), false);
});

test("search project_id cocok dan hanya modul milik project_id yang dapat ditampilkan", () => {
  const item = proyek("PRJ-TARGET");
  const modules = new Map<string, ModulDashboard[]>([[item.id, [
    modul("PRJ-TARGET", "A", "Modul benar"),
    modul("PRJ-LAIN", "B", "Modul palsu"),
  ]]]);
  const hasil = filterProyekDashboard([item], modules, { teks: "prj-target" });
  assert.deepEqual(hasil.proyek.map((value) => value.id), [item.id]);
  assert.deepEqual(hasil.modulPerProyek.get(item.id)?.map((value) => value.nama), ["Modul benar"]);
});

test("kombinasi tahap, tanggal, dan search diterapkan bersama pada parent", () => {
  const cocok = proyek("cocok", { nama: "Sistem Audit", tahap: "Berjalan", tanggal_mulai: "2025-03-15" });
  const bedaTahap = proyek("tahap", { nama: "Sistem Audit", tahap: "Selesai" });
  const bedaTanggal = proyek("tanggal", { nama: "Sistem Audit", tanggal_mulai: "2025-04-01" });
  const lain = proyek("lain", { nama: "Sistem Arsip" });
  const hasil = filterProyekDashboard([cocok, bedaTahap, bedaTanggal, lain], new Map(), {
    tahap: "Berjalan",
    tanggalMulai: "2025-03-10",
    tanggalSelesai: "2025-03-20",
    teks: "audit",
  });
  assert.deepEqual(hasil.proyek.map((item) => item.id), ["cocok"]);
});

test("periode terbalik menghasilkan hasil kosong dan pencarian mencakup nama aplikasi/modul aplikasi", () => {
  const item = proyek("app-modul", { modul_aplikasi: "Rekonsiliasi" });
  assert.equal(filterProyekDashboard([item], new Map(), {
    tanggalMulai: "2025-03-21", tanggalSelesai: "2025-03-10",
  }).proyek.length, 0);
  assert.deepEqual(filterProyekDashboard([item], new Map(), { teks: "rekonsiliasi" }).proyek.map((x) => x.id), ["app-modul"]);
});
