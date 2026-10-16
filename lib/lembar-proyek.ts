export type HasilValidasiNamaLembar =
  | { ok: true; nama: string }
  | { ok: false; pesan: string };

/** Normalisasi nama tab satu baris; tidak memotong diam-diam agar data tidak berubah tanpa sadar. */
export function validasiNamaLembar(nilai: unknown): HasilValidasiNamaLembar {
  if (typeof nilai !== "string") {
    return { ok: false, pesan: "Nama kelompok/modul/menu wajib berupa teks." };
  }
  const nama = nilai.trim().replace(/\s+/gu, " ");
  if (!nama) return { ok: false, pesan: "Nama kelompok/modul/menu wajib diisi." };
  if (nama.length > 200) return { ok: false, pesan: "Nama kelompok/modul/menu maksimal 200 karakter." };
  return { ok: true, nama };
}

/** Kode lembar otomatis, singkat, deterministik, dan tidak bertabrakan dengan kode impor yang sudah ada. */
export function kodeLembarBerikutnya(kodeTerpakai: readonly string[]): string {
  const terpakai = new Set(kodeTerpakai.map((kode) => kode.trim().toLocaleUpperCase("en-US")));
  for (let urutan = 1; urutan <= 999_999_999; urutan++) {
    const kode = `L${String(urutan).padStart(3, "0")}`;
    if (!terpakai.has(kode)) return kode;
  }
  throw new Error("Tidak dapat membuat kode lembar baru.");
}
