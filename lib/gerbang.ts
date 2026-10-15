import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { sesiSekarang } from "@/lib/sesi";

export const PERAN_AKUN = [
  "ADMIN",
  "PIMPINAN",
  "INTERNAL_PSII",
  "INTERNAL_KEMENKEU",
  "EKSTERNAL_KEMENKEU",
] as const;

export type Peran = (typeof PERAN_AKUN)[number];

export type Pengguna = {
  id: string;
  email: string;
  nama: string;
  jabatan: string | null;
  peran: Peran;
};

const PEMILIK_PORTOFOLIO: Peran[] = ["ADMIN", "PIMPINAN", "INTERNAL_PSII"];
const PENGELOLA: Peran[] = ["ADMIN", "INTERNAL_PSII"];
export const PERAN_PENGUJI: Peran[] = ["INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"];

/** Role yang dapat melihat seluruh portofolio proyek. */
export function internal(peran: Peran): boolean {
  return PEMILIK_PORTOFOLIO.includes(peran);
}

export function bolehKelolaPengguna(peran: Peran): boolean {
  return peran === "ADMIN";
}

/** Admin dan Internal PSII dapat mengelola struktur proyek/skenario. */
export function bolehKelolaProyek(peran: Peran): boolean {
  return PENGELOLA.includes(peran);
}

/** Semua selain Pimpinan dapat menjalankan dan mengisi pengujian. */
export function bolehUbahEksekusi(peran: Peran): boolean {
  return peran !== "PIMPINAN";
}

/** Perubahan master skenario (buat/hapus dan definisi) hanya untuk pengelola. */
export function bolehKelolaSkenario(peran: Peran): boolean {
  return PENGELOLA.includes(peran);
}

/** Untuk halaman server component. Mengalihkan ke /masuk kalau belum ada sesi. */
export async function wajibMasuk(): Promise<Pengguna> {
  const sesi = await sesiSekarang();
  if (!sesi) redirect("/masuk");

  const [p] = (await klienMentah.unsafe(
    `SELECT id, email, nama, jabatan, peran, sesi_versi FROM th_users WHERE id = $1::uuid AND aktif = true`,
    [sesi.userId],
  )) as unknown as (Pengguna & { sesi_versi: number })[];

  // Mencabut akun harus berlaku segera, tidak menunggu cookie kedaluwarsa.
  if (!p || Number(p.sesi_versi) !== sesi.versi) redirect("/masuk");
  return p;
}

/** Halaman admin sengaja disamarkan sebagai tidak ditemukan untuk peran lain. */
export async function wajibAdmin(): Promise<Pengguna> {
  const pengguna = await wajibMasuk();
  if (!bolehKelolaPengguna(pengguna.peran)) notFound();
  return pengguna;
}

/** Halaman administrasi boleh dilihat Pimpinan, tetapi aksi tulis tetap Admin-only. */
export async function wajibAdminAtauPimpinan(): Promise<Pengguna> {
  const pengguna = await wajibMasuk();
  if (pengguna.peran !== "ADMIN" && pengguna.peran !== "PIMPINAN") notFound();
  return pengguna;
}

/** Pemeriksaan sesi untuk route API. */
export async function wajibMasukApi(): Promise<{ tolak: NextResponse } | { pengguna: Pengguna }> {
  const sesi = await sesiSekarang();
  if (!sesi) {
    return { tolak: NextResponse.json({ pesan: "Belum masuk" }, { status: 401 }) };
  }
  const [p] = (await klienMentah.unsafe(
    `SELECT id, email, nama, jabatan, peran, sesi_versi FROM th_users WHERE id = $1::uuid AND aktif = true`,
    [sesi.userId],
  )) as unknown as (Pengguna & { sesi_versi: number })[];
  if (!p || Number(p.sesi_versi) !== sesi.versi) {
    return { tolak: NextResponse.json({ pesan: "Akun tidak aktif" }, { status: 401 }) };
  }
  return { pengguna: p };
}

/** Internal PSII/Pimpinan/Admin melihat portofolio penuh; tester hanya proyek yang ditugaskan. */
export async function bolehAksesProyek(pengguna: Pengguna, projectId: string): Promise<boolean> {
  if (internal(pengguna.peran)) return true;
  const [m] = (await klienMentah.unsafe(
    `SELECT 1 AS ada FROM th_project_members WHERE project_id = $1 AND user_id = $2::uuid`,
    [projectId, pengguna.id],
  )) as unknown as { ada: number }[];
  return Boolean(m);
}

/** Klausa cakupan portofolio untuk query yang memakai alias proyek `p`. */
export async function saringProyek(pengguna: Pengguna): Promise<string> {
  if (internal(pengguna.peran)) return "true";
  // user.id berasal dari DB dan bertipe UUID, bukan masukan request.
  return `p.id IN (SELECT project_id FROM th_project_members WHERE user_id = '${pengguna.id}'::uuid)`;
}
