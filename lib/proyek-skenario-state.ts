import type { Skenario } from "@/components/tabel-skenario";

export type StatistikSkenario = {
  total: number;
  lulus: number;
  gagal: number;
  tertunda: number;
  belum: number;
};

/** Statistik hanya menghitung skenario tersimpan; draf lokal belum menjadi data proyek. */
export function hitungStatistikSkenario(skenario: readonly Pick<Skenario, "id" | "status">[]): StatistikSkenario {
  const hasil: StatistikSkenario = { total: 0, lulus: 0, gagal: 0, tertunda: 0, belum: 0 };
  for (const item of skenario) {
    if (item.id.startsWith("draft:")) continue;
    hasil.total += 1;
    if (item.status === "PASS") hasil.lulus += 1;
    else if (item.status === "FAIL") hasil.gagal += 1;
    else if (item.status === "BLOCKED") hasil.tertunda += 1;
    else if (item.status === "PENDING") hasil.belum += 1;
  }
  return hasil;
}

/** Memperbarui row tanpa mutasi dan menghitung ulang statistik dari snapshot terbaru. */
export function perbaruiSkenarioDanHitung<T extends Pick<Skenario, "id" | "status">>(
  skenario: readonly T[],
  id: string,
  tambalan: Partial<T>,
): { skenario: T[]; statistik: StatistikSkenario } {
  const berikutnya = skenario.map((baris) => baris.id === id ? { ...baris, ...tambalan } : baris);
  return { skenario: berikutnya, statistik: hitungStatistikSkenario(berikutnya) };
}

/** Satu pemindaian membangun hitungan untuk seluruh worksheet dan skenario tanpa worksheet. */
export function hitungJumlahPerModul(skenario: readonly Pick<Skenario, "module_id">[]): Map<string | null, number> {
  const jumlah = new Map<string | null, number>();
  for (const item of skenario) {
    jumlah.set(item.module_id, (jumlah.get(item.module_id) ?? 0) + 1);
  }
  return jumlah;
}
