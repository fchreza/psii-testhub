import { createHash } from "node:crypto";
import type { HitunganLaporan, SumberLaporan, SkenarioLaporan, StatusLaporan } from "./laporan-final-types";

export const bolehGenerateLaporan = (peran: string) => peran === "ADMIN" || peran === "INTERNAL_PSII";
export const bolehLihatLaporan = (peran: string) => bolehGenerateLaporan(peran) || peran === "PIMPINAN";
export const layakLaporan = (jenis: string, tahap: string) => ["UAT", "SIT_UAT"].includes(jenis) && tahap === "SELESAI";
export const LABEL_STATUS: Record<StatusLaporan, string> = { PASS: "Lulus", FAIL: "Gagal", BLOCKED: "Tertunda", PENDING: "Belum diuji" };

/** Daftar kolom eksplisit adalah batas utama. Teks bebas juga disaring: tidak ada URL,
 * kredensial berlabel, atau locator storage yang dibawa ke snapshot/PDF. */
export function teksLaporan(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw)
    .replace(/(?:https?:\/\/|\bwww\.|\/\/(?=[a-z0-9.-]+\.[a-z]))[^\s<>"']+/gi, "[tautan tidak disertakan]")
    .replace(/\b(?:s3|r2|gs):\/\/[^\s]+/gi, "[lokasi privat tidak disertakan]")
    .replace(/\b(?:bukti|bukti-upload|evidence|uploads)\/[\w./%+=-]+/gi, "[lokasi privat tidak disertakan]")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[kredensial tidak disertakan]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "[kredensial tidak disertakan]")
    .replace(/\b(?:password|passwd|pwd|sandi|kata\s+sandi|username|user\s*name|nama\s+pengguna|token|secret|api[_ -]?key|access[_ -]?key|storage[_ -]?key|authorization)["']?\s*[:=]\s*[^\r\n,;]+/gi, "[kredensial tidak disertakan]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  return value || null;
}
export function hitungLaporan(skenario: Pick<SkenarioLaporan, "status">[]): HitunganLaporan {
  return { total: skenario.length, lulus: skenario.filter(s => s.status === "PASS").length,
    gagal: skenario.filter(s => s.status === "FAIL").length, tertunda: skenario.filter(s => s.status === "BLOCKED").length,
    belum: skenario.filter(s => s.status === "PENDING").length };
}
export function peringatanLaporan(skenario: SkenarioLaporan[]): string[] {
  const result: string[] = [];
  if (!skenario.length) result.push("Belum ada skenario UAT yang tercatat.");
  for (const s of skenario) {
    if (!s.aktual) result.push(`${s.kode}: hasil aktual kosong / belum tercatat (${LABEL_STATUS[s.status]}).`);
    if (s.status === "PENDING" || s.status === "BLOCKED") result.push(`${s.kode}: pengujian belum tuntas (${LABEL_STATUS[s.status]}).`);
    if (!s.diharapkan) result.push(`${s.kode}: hasil yang diharapkan belum tercatat.`);
  }
  return result;
}
export function kesimpulanLaporan(h: HitunganLaporan): string {
  return `UAT selesai menunjukkan proses pengujian telah ditutup, bukan bahwa semua skenario lulus. Dari ${h.total} skenario, ${h.lulus} Lulus, ${h.gagal} Gagal, ${h.tertunda} Tertunda, dan ${h.belum} Belum diuji. Hasil aktual yang kosong tetap ditampilkan sebagai belum tercatat. Temuan dan tindak lanjut terbuka tetap perlu ditangani; laporan ini bukan persetujuan kelayakan produksi, tanda tangan elektronik, atau berita acara.`;
}
export function sidikLaporan(sumber: SumberLaporan, revisi: unknown): string {
  return createHash("sha256").update(JSON.stringify({ sumber, revisi })).digest("hex");
}
export function tokenPratinjau(sidikSumber: string, versiBerikutnya: number): string {
  return createHash("sha256").update(`${sidikSumber}:${versiBerikutnya}`).digest("hex");
}
export const perluPembaruan = (tersimpan: string, sekarang: string) => tersimpan !== sekarang;
