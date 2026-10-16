export const PERAN_AKUN = [
  "ADMIN",
  "PIMPINAN",
  "INTERNAL_PSII",
  "INTERNAL_KEMENKEU",
  "EKSTERNAL_KEMENKEU",
] as const;

export type Peran = (typeof PERAN_AKUN)[number];

const PEMILIK_PORTOFOLIO: Peran[] = ["ADMIN", "PIMPINAN", "INTERNAL_PSII"];
const PENGELOLA: Peran[] = ["ADMIN", "INTERNAL_PSII"];
export const PERAN_PENGUJI: Peran[] = ["INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"];

/** Role yang dapat melihat seluruh portofolio proyek. */
export function internal(peran: Peran): boolean {
  return PEMILIK_PORTOFOLIO.includes(peran);
}

/** Akses internal melewati penugasan; tester wajib menjadi anggota proyek. */
export function bolehAksesProyekPeran(peran: Peran, ditugaskan: boolean): boolean {
  return internal(peran) || ditugaskan;
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
