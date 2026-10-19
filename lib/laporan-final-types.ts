export type StatusLaporan = "PASS" | "FAIL" | "BLOCKED" | "PENDING";
export type HitunganLaporan = { total: number; lulus: number; gagal: number; tertunda: number; belum: number };
export type SkenarioLaporan = {
  id: string; kode: string; judul: string; langkah: string | null; diharapkan: string | null;
  aktual: string | null; status: StatusLaporan; temuan: string | null; tindakLanjut: string | null;
  penguji: string | null; siapRetest: boolean; bukti: string[];
};
export type ModulLaporan = { id: string | null; kode: string; nama: string; hitungan: HitunganLaporan; skenario: SkenarioLaporan[] };
export type SumberLaporan = {
  proyek: { id: string; nama: string; aplikasi: string | null; jenisPengujian: string; tahap: string;
    unit: string | null; pic: string | null; ruangLingkup: string | null; lingkungan: string | null;
    tanggalMulai: string | null; targetSelesai: string | null; selesaiPada: string | null; dasarRegulasi: string | null };
  hitungan: HitunganLaporan; modul: ModulLaporan[]; peringatan: string[]; kesimpulan: string;
};
export type SnapshotLaporan = SumberLaporan & {
  format: 1; dokumenId: string; versi: number; dibuatPada: string; dibuatOleh: string; sidikSumber: string;
};
export type VersiLaporan = { id: string; versi: number; dibuatPada: string; dibuatOleh: string; perluPembaruan: boolean };
export type PratinjauLaporan = { sumber: SumberLaporan; sidikSumber: string; versiBerikutnya: number };
