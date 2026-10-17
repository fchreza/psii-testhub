export type ProyekDashboard = {
  id: string;
  nama: string;
  unit_bisnis: string | null;
  tahap: string;
  aplikasi: string | null;
  modul: string | null;
  jenis_pengujian: string;
  modul_aplikasi: string | null;
  target_selesai: string | Date | null;
  total: number;
  lulus: number;
  gagal: number;
  tertunda: number;
  belum: number;
};

export type ModulDashboard = {
  project_id: string;
  proyek: string;
  kode: string;
  nama: string;
  total: number;
  lulus: number;
  gagal: number;
  tertunda: number;
  belum: number;
};

/**
 * Kelompokkan hasil agregasi modul dengan ID proyek sebagai kunci relasi.
 * Jangan mengelompokkan lewat nama proyek/modul karena keduanya tidak unik.
 */
export function kelompokkanModulPerProyek(
  baris: readonly ModulDashboard[],
): Map<string, ModulDashboard[]> {
  const hasil = new Map<string, ModulDashboard[]>();
  for (const modul of baris) {
    const daftar = hasil.get(modul.project_id);
    if (daftar) daftar.push(modul);
    else hasil.set(modul.project_id, [modul]);
  }
  return hasil;
}
