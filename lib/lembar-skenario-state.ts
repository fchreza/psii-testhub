type RefNilai<T> = { current: T };

/**
 * Mendeteksi apakah isi array benar-benar berubah, bukan hanya wadah arraynya.
 * Parent dapat mem-filter daftar di setiap render; objek skenario tetap
 * referensi yang sama dan tidak boleh dianggap sebagai snapshot server baru.
 */
export function daftarSamaReferensi<T>(sebelumnya: readonly T[], berikutnya: readonly T[]): boolean {
  return sebelumnya.length === berikutnya.length
    && sebelumnya.every((item, index) => item === berikutnya[index]);
}

/** Menandai refresh untuk dicoba setelah draf selesai bila request datang terlalu awal. */
export function tundaRefreshJikaDrafAktif(
  drafAktif: RefNilai<boolean>,
  refreshTertunda: RefNilai<boolean>,
): boolean {
  if (!drafAktif.current) return false;
  refreshTertunda.current = true;
  return true;
}

/** Mengonsumsi refresh yang tertunda tepat saat tidak ada draf lagi. */
export function ambilRefreshTertundaJikaAman(
  drafAktif: RefNilai<boolean>,
  refreshTertunda: RefNilai<boolean>,
): boolean {
  if (drafAktif.current || !refreshTertunda.current) return false;
  refreshTertunda.current = false;
  return true;
}
