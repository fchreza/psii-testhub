import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { sesiSekarang } from "@/lib/sesi";
import { internal, bolehAksesProyekPeran, bolehKelolaPengguna, type Peran } from "@/lib/aturan-peran";
export {
  PERAN_AKUN, PERAN_PENGUJI, internal, bolehKelolaPengguna,
  bolehKelolaProyek, bolehUbahEksekusi, bolehKelolaSkenario, bolehAksesProyekPeran,
} from "@/lib/aturan-peran";
export type { Peran } from "@/lib/aturan-peran";

export type Pengguna = {
  id: string;
  email: string;
  nama: string;
  jabatan: string | null;
  peran: Peran;
};

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
  return bolehAksesProyekPeran(pengguna.peran, Boolean(m));
}

/** Klausa cakupan portofolio untuk query yang memakai alias proyek `p`. */
export async function saringProyek(pengguna: Pengguna): Promise<string> {
  if (internal(pengguna.peran)) return "true";
  // user.id berasal dari DB dan bertipe UUID, bukan masukan request.
  return `p.id IN (SELECT project_id FROM th_project_members WHERE user_id = '${pengguna.id}'::uuid)`;
}
