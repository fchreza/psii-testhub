import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { sesiSekarang } from "@/lib/sesi";

/**
 * GERBANG SESI DAN HAK AKSES
 *
 * KENAPA SATU BERKAS TERPISAH, bukan pemeriksaan di tiap halaman:
 * Kalau setiap halaman memeriksa sendiri, satu halaman yang lupa diperiksa
 * membuka seluruh isinya — dan tidak ada yang menyadarinya sampai ada yang
 * menemukan. Dengan satu berkas, ada SATU tempat untuk melihat dan menguji
 * apakah gerbangnya benar.
 */

export type Peran = "ADMIN" | "PIMPINAN" | "PM" | "QA" | "DEVELOPER" | "BUSINESS_USER" | "EKSTERNAL";

export type Pengguna = {
  id: string;
  email: string;
  nama: string;
  jabatan: string | null;
  peran: Peran;
};

/** Peran yang boleh melihat SELURUH proyek. */
const INTERNAL: Peran[] = ["ADMIN", "PIMPINAN", "PM", "QA", "DEVELOPER", "BUSINESS_USER"];

export function internal(peran: Peran): boolean {
  return INTERNAL.includes(peran);
}

/** Untuk halaman server component. Mengalihkan ke /masuk kalau belum ada sesi. */
export async function wajibMasuk(): Promise<Pengguna> {
  const sesi = await sesiSekarang();
  if (!sesi) redirect("/masuk");

  const [p] = (await klienMentah.unsafe(
    `SELECT id, email, nama, jabatan, peran FROM th_users WHERE id = $1::uuid AND aktif = true`,
    [sesi.userId],
  )) as unknown as Pengguna[];

  /*
   * Sesi yang sah tapi penggunanya sudah dinonaktifkan harus ditolak.
   *
   * KENAPA: tanda tangan cookie hanya membuktikan cookie itu dibuat oleh
   * server ini — bukan bahwa orangnya masih berhak masuk. Tanpa pemeriksaan
   * ini, mencabut akses seseorang tidak berpengaruh sampai cookienya
   * kedaluwarsa sendiri (14 hari).
   */
  if (!p) redirect("/masuk");
  return p;
}

/**
 * Untuk route API. Mengembalikan NextResponse 401, atau null kalau boleh lanjut.
 *
 * KENAPA TIDAK `redirect`: API yang mengalihkan akan membuat klien mengikuti
 * alihan dan menerima halaman HTML dengan status 200 — lalu menganggap
 * penyimpanannya berhasil. Status 401 yang jelas jauh lebih baik daripada
 * kegagalan yang tampak seperti keberhasilan.
 */
export async function wajibMasukApi(): Promise<{ tolak: NextResponse } | { pengguna: Pengguna }> {
  const sesi = await sesiSekarang();
  if (!sesi) {
    return { tolak: NextResponse.json({ pesan: "Belum masuk" }, { status: 401 }) };
  }
  const [p] = (await klienMentah.unsafe(
    `SELECT id, email, nama, jabatan, peran FROM th_users WHERE id = $1::uuid AND aktif = true`,
    [sesi.userId],
  )) as unknown as Pengguna[];
  if (!p) {
    return { tolak: NextResponse.json({ pesan: "Akun tidak aktif" }, { status: 401 }) };
  }
  return { pengguna: p };
}

/**
 * Apakah pengguna boleh mengakses sebuah proyek?
 *
 * KENAPA ATURAN INI ADA:
 * Pengguna eksternal (kantor vertikal, pihak luar Kemenkeu) TIDAK BOLEH melihat
 * seluruh portofolio subdit. KPPN di Makassar tidak perlu tahu proyek apa saja
 * yang sedang diuji. Jadi pengguna eksternal hanya melihat proyek yang ia
 * menjadi anggotanya, sedangkan pegawai internal melihat semuanya.
 */
export async function bolehAksesProyek(pengguna: Pengguna, projectId: string): Promise<boolean> {
  if (internal(pengguna.peran)) return true;
  const [m] = (await klienMentah.unsafe(
    `SELECT 1 AS ada FROM th_project_members WHERE project_id = $1 AND user_id = $2::uuid`,
    [projectId, pengguna.id],
  )) as unknown as { ada: number }[];
  return Boolean(m);
}

/** Syarat proyek yang boleh dilihat pengguna, untuk dipasang di klausa WHERE. */
export async function saringProyek(pengguna: Pengguna): Promise<string> {
  if (internal(pengguna.peran)) return "true";
  return `p.id IN (SELECT project_id FROM th_project_members WHERE user_id = '${pengguna.id}'::uuid)`;
}
