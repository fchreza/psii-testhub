export const FASE_PENGUJIAN = ["SIT", "UAT"] as const;
export type FasePengujian = (typeof FASE_PENGUJIAN)[number];
export type JenisPengujianProyek = FasePengujian | "SIT_UAT";

/** Proyek lama yang sudah punya skenario SIT dan UAT tetap menampilkan keduanya. */
export function faseUntukProyek(jenis: string | null | undefined): FasePengujian[] {
  if (jenis === "SIT_UAT") return ["SIT", "UAT"];
  return jenis === "UAT" ? ["UAT"] : ["SIT"];
}

export function labelJenisPengujian(jenis: string | null | undefined): string {
  if (jenis === "SIT_UAT") return "SIT & UAT";
  return jenis === "UAT" ? "UAT" : "SIT";
}

export function tahapProyekUntukJenis(jenis: string | null | undefined): string[] {
  return ["PERSIAPAN", ...faseUntukProyek(jenis), "WAITING_SIGNOFF", "SELESAI"];
}
