import { validasiMetadataObjek } from "@/lib/validasi-bukti";

export type MetadataBukti = {
  ukuranHarapan: number;
  tipeHarapan: string;
  ukuranAktual: number | null | undefined;
  tipeAktual: string | null | undefined;
};

/**
 * Orkestrasi finalisasi dua fase. `promosikan` harus idempoten (tujuan final
 * unik dan diverifikasi sebelum copy); `catatTransaksi` harus menyimpan metadata,
 * audit, serta status intent dalam satu transaksi database.
 */
export async function finalisasiUpload<T>(
  metadata: MetadataBukti,
  batas: number,
  operasi: {
    promosikan: () => Promise<void>;
    catatTransaksi: () => Promise<T>;
    bersihkanStaging: () => Promise<void>;
    catatGalatCleanup?: (error: unknown) => void;
  },
): Promise<T> {
  const galatMetadata = validasiMetadataObjek(
    metadata.ukuranHarapan, metadata.tipeHarapan,
    metadata.ukuranAktual, metadata.tipeAktual, batas,
  );
  if (galatMetadata) throw new Error(galatMetadata);

  await operasi.promosikan();
  const hasil = await operasi.catatTransaksi();
  try {
    await operasi.bersihkanStaging();
  } catch (error) {
    operasi.catatGalatCleanup?.(error);
  }
  return hasil;
}
