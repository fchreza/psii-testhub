import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("notifikasi perubahan tahap memakai toast fixed kanan atas tanpa komponen inline", () => {
  const source = readFileSync("components/ubah-tahap-proyek.tsx", "utf8");
  assert.match(source, /fixed inset-x-3 top-3[^\n]*sm:right-6 sm:top-6/);
  assert.match(source, /role=\{pesan\.galat \? "alert" : "status"\}/);
  assert.match(source, /aria-live=\{pesan\.galat \? "assertive" : "polite"\}/);
  assert.match(source, /aria-atomic="true"/);
  assert.doesNotMatch(source, /<Feedback/);
  assert.doesNotMatch(source, /\.focus\(/);
});

test("dashboard menyediakan filter tahap/tanggal/pencarian, state reset, dan KPI pada proyek terlihat", () => {
  const source = readFileSync("components/dashboard-interaktif.tsx", "utf8");
  const server = readFileSync("app/dashboard/page.tsx", "utf8");
  assert.match(source, /type="search"/);
  assert.match(source, /type="date"/);
  assert.match(source, /label="Tahap proyek"/);
  assert.match(source, /filterProyekDashboard\(proyek, modulPerProyek/);
  assert.match(source, /Reset filter/);
  assert.match(source, /Tanggal mulai harus sama dengan atau lebih awal/);
  assert.match(source, /Ringkasan proyek yang ditampilkan/);
  assert.match(source, /hasil\.proyek\.reduce/);
  assert.match(source, /aria-describedby="dashboard-bantuan/);
  assert.match(source, /grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4/);
  assert.match(source, /Periode mencocokkan jadwal proyek dari tanggal mulai hingga target selesai secara inklusif/);
  assert.match(server, /PERAN_PENGUJI\.includes/);
  assert.match(server, /th_project_members WHERE user_id/);
  assert.match(server, /p\.tanggal_mulai, p\.target_selesai/);
  assert.match(server, /kelompokkanModulPerProyek/);
});
