export type KursorRiwayat = { pada: string; id: string };

export function originSama(origin: string | null, urlPermintaan: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(urlPermintaan).origin;
  } catch {
    return false;
  }
}

export function validasiMetadataObjek(
  ukuranHarapan: number,
  tipeHarapan: string,
  ukuranAktual: number | null | undefined,
  tipeAktual: string | null | undefined,
  batas: number,
): string | null {
  if (!Number.isInteger(ukuranHarapan) || ukuranHarapan <= 0 || ukuranHarapan > batas) {
    return "Ukuran yang diminta tidak sah.";
  }
  if (ukuranAktual !== ukuranHarapan) return "Ukuran berkas di penyimpanan tidak sesuai dengan ukuran yang diminta.";
  if (tipeAktual !== tipeHarapan) return "Jenis berkas di penyimpanan tidak sesuai dengan jenis yang diminta.";
  return null;
}

export function perluAlasanHapusBuktiTerakhir(
  status: string,
  tindakLanjut: string | null | undefined,
  alasan: string | null | undefined,
): boolean {
  return (status === "FAIL" || status === "BLOCKED")
    && !tindakLanjut?.trim()
    && !alasan?.trim();
}

export function versiMasihAktual(versiKirim: string | null | undefined, versiDatabase: string): boolean {
  return typeof versiKirim === "string" && versiKirim.length > 0 && versiKirim === versiDatabase;
}

export function enkodeKursorRiwayat(kursor: KursorRiwayat): string {
  return Buffer.from(JSON.stringify(kursor), "utf8").toString("base64url");
}

export function parseKursorRiwayat(nilai: string | null): KursorRiwayat | null {
  if (!nilai || nilai.length > 512 || !/^[A-Za-z0-9_-]+$/.test(nilai)) return null;
  try {
    const hasil = JSON.parse(Buffer.from(nilai, "base64url").toString("utf8")) as Partial<KursorRiwayat>;
    if (typeof hasil.pada !== "string" || !Number.isFinite(Date.parse(hasil.pada))) return null;
    if (typeof hasil.id !== "string" || !/^[1-9]\d{0,18}$/.test(hasil.id)) return null;
    return { pada: hasil.pada, id: hasil.id };
  } catch {
    return null;
  }
}
