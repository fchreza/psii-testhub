export type ProyekDashboard = {
  id: string;
  nama: string;
  unit_bisnis: string | null;
  tahap: string;
  aplikasi: string | null;
  modul: string | null;
  jenis_pengujian: string;
  tanggal_mulai: string | Date | null;
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

export type FilterProyekDashboard = {
  /** Tahap/status proyek yang diizinkan; menerima satu nilai atau beberapa pilihan. */
  tahap?: string | readonly string[] | null;
  /** Alias untuk pemanggil yang menyebut tahap sebagai status. */
  status?: string | readonly string[] | null;
  tanggalMulai?: string | Date | null;
  tanggalSelesai?: string | Date | null;
  teks?: string | null;
};

export type HasilFilterProyekDashboard = {
  proyek: ProyekDashboard[];
  modulPerProyek: Map<string, ModulDashboard[]>;
};

function hariUTC(nilai: string | Date | null | undefined): number | null {
  if (nilai == null) return null;
  const tanggal = nilai instanceof Date ? nilai : new Date(nilai);
  if (Number.isNaN(tanggal.getTime())) return Number.NaN;
  return Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth(), tanggal.getUTCDate());
}

function normalisasiTeks(nilai: string): string {
  return nilai.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function pilihanFilter(nilai: string | readonly string[] | null | undefined): string[] {
  if (nilai == null) return [];
  return (Array.isArray(nilai) ? nilai : [nilai]).map(normalisasiTeks).filter(Boolean);
}

/**
 * Filter proyek tanpa mengubah input. Rentang tanggal memakai overlap inklusif;
 * endpoint jadwal proyek yang null diperlakukan sebagai rentang terbuka.
 */
export function filterProyekDashboard(
  proyek: readonly ProyekDashboard[],
  modulPerProyek: ReadonlyMap<string, readonly ModulDashboard[]>,
  filter: FilterProyekDashboard = {},
): HasilFilterProyekDashboard {
  const tahapDipilih = [...pilihanFilter(filter.tahap), ...pilihanFilter(filter.status)];
  const mulaiFilter = hariUTC(filter.tanggalMulai);
  const selesaiFilter = hariUTC(filter.tanggalSelesai);
  const kueri = normalisasiTeks(filter.teks?.trim() ?? "");
  const hasilProyek: ProyekDashboard[] = [];
  const hasilModul = new Map<string, ModulDashboard[]>();
  if (mulaiFilter !== null && selesaiFilter !== null && mulaiFilter > selesaiFilter) {
    return { proyek: hasilProyek, modulPerProyek: hasilModul };
  }

  for (const item of proyek) {
    const itemDenganStatus = item as ProyekDashboard & { status?: string | null };
    const tahap = normalisasiTeks(item.tahap);
    const status = normalisasiTeks(itemDenganStatus.status ?? "");
    if (tahapDipilih.length && !tahapDipilih.includes(tahap) && !tahapDipilih.includes(status)) continue;

    const mulaiProyek = hariUTC(item.tanggal_mulai);
    const selesaiProyek = hariUTC(item.target_selesai);
    if ([mulaiFilter, selesaiFilter, mulaiProyek, selesaiProyek].some(Number.isNaN)) continue;
    if (mulaiFilter !== null && selesaiProyek !== null && selesaiProyek < mulaiFilter) continue;
    if (selesaiFilter !== null && mulaiProyek !== null && mulaiProyek > selesaiFilter) continue;

    const modulTerhubung = (modulPerProyek.get(item.id) ?? []).filter((modul) => modul.project_id === item.id);
    const cocokProyek = !kueri || [
      item.nama,
      item.id,
      item.unit_bisnis,
      item.aplikasi,
      item.modul,
      item.modul_aplikasi,
      item.jenis_pengujian,
      item.tahap,
      itemDenganStatus.status,
    ].some((nilai) => nilai != null && normalisasiTeks(nilai).includes(kueri));
    const modulCocok = kueri
      ? modulTerhubung.filter((modul) => [modul.kode, modul.nama].some((nilai) => normalisasiTeks(nilai).includes(kueri)))
      : modulTerhubung;

    if (kueri && !cocokProyek && modulCocok.length === 0) continue;
    hasilProyek.push(item);
    hasilModul.set(item.id, cocokProyek || !kueri ? modulTerhubung : modulCocok);
  }

  return { proyek: hasilProyek, modulPerProyek: hasilModul };
}
