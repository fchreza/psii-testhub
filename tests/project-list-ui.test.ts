import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const formBaru = readFileSync("components/tombol-proyek-baru.tsx", "utf8");
const daftarProyek = readFileSync("components/daftar-proyek.tsx", "utf8");
const tautanBuka = readFileSync("components/tautan-buka-proyek.tsx", "utf8");
const spinner = readFileSync("components/indikator-proses.tsx", "utf8");

test("form proyek baru memakai dropdown aplikasi dengan tiga pilihan yang ditetapkan dan tetap opsional", () => {
  const field = formBaru.match(/<Field id="p-aplikasi" label="Aplikasi" optional>([\s\S]*?)<\/Field>/)?.[1];
  assert.ok(field, "field Aplikasi harus berupa Field opsional");
  assert.match(field, /<Select id="p-aplikasi"/);
  const values = [...field.matchAll(/<option value="([^"]*)">([^<]+)<\/option>/g)]
    .map(([, value, label]) => [value, label.trim()]);
  assert.deepEqual(values, [
    ["", "— Pilih aplikasi —"],
    ["OMSPAN TKD", "OMSPAN TKD"],
    ["SPAN Extension", "SPAN Extension"],
    ["SPAN", "SPAN"],
  ]);
});

test("daftar proyek memakai grid kartu responsif tanpa kolom atau scroll horizontal yang memotong informasi", () => {
  assert.match(daftarProyek, /grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4/);
  assert.doesNotMatch(daftarProyek, /<table|overflow-x-auto/);
  assert.match(daftarProyek, /role="region" aria-label="Daftar proyek pengujian"/);
  for (const field of ["Aplikasi / modul", "Jenis pengujian", "Periode", "Kelulusan", "Kendala"]) {
    assert.ok(daftarProyek.includes(field), `kolom ${field} tetap ditampilkan`);
  }
  for (const label of ["Persiapan", "Sedang SIT", "Sedang UAT", "Menunggu tanda tangan", "Selesai"]) {
    assert.ok(daftarProyek.includes(`"${label}"`), `label tahap ${label} tetap ditampilkan`);
  }
});

test("semua tahap memiliki warna visual berbeda tanpa mengganti kode tahap", () => {
  const tahap = ["PERSIAPAN", "SIT", "UAT", "WAITING_SIGNOFF", "SELESAI"];
  const style = tahap.map((kode) => {
    const match = daftarProyek.match(new RegExp(`${kode}: "([^"]+)"`));
    assert.ok(match, `tahap ${kode} harus memiliki kelas warna`);
    return match[1];
  });
  assert.equal(new Set(style).size, tahap.length, "setiap tahap harus memakai kelas warna tersendiri");
});

test("tautan buka proyek mengumumkan pemuatan dan spinner menghormati prefers-reduced-motion", () => {
  assert.match(tautanBuka, /role="status"/);
  assert.match(tautanBuka, /aria-live="polite"/);
  assert.match(tautanBuka, /aria-busy="true"/);
  assert.match(tautanBuka, /Membuka proyek/);
  assert.match(spinner, /motion-safe:animate-spin/);
  assert.match(spinner, /motion-reduce:animate-none/);
});
