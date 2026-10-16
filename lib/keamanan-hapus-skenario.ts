/**
 * Rekam bukti (termasuk tombstone) dan seluruh intent upload tidak boleh
 * terhapus lewat ON DELETE CASCADE saat skenario dihapus.
 */
export type SebabBlokirHapusSkenario = "bukti" | "unggahan";

export type IntentUntukHapus = { status: string; expiresAt: Date | string };
export type SebabTundaHapusAdmin = "unggahan" | "url_aktif";

/** Marker DELETE_PENDING yang tidak pernah ditampilkan sebagai bukti pengguna. */
export const PREFIX_KUNCI_HAPUS_SKENARIO = "__psii_internal__/scenario-delete-lock/";

export function pathKunciHapusSkenario(scenarioId: string): string {
  return `${PREFIX_KUNCI_HAPUS_SKENARIO}${scenarioId}`;
}

export function sebabBlokirHapusSkenario(
  jumlahBukti: number,
  jumlahIntentUnggah: number,
): SebabBlokirHapusSkenario | null {
  if (jumlahBukti > 0) return "bukti";
  if (jumlahIntentUnggah > 0) return "unggahan";
  return null;
}

/**
 * Admin boleh menghapus riwayat yang sudah stabil, tetapi tidak saat finalisasi
 * masih berjalan atau URL bertanda tangan masih dapat menulis objek staging.
 */
export function sebabTundaHapusAdmin(
  intents: IntentUntukHapus[],
  sekarang = Date.now(),
  jedaAmanMs = 30_000,
): SebabTundaHapusAdmin | null {
  if (intents.some((intent) => intent.status === "UPLOADING")) return "unggahan";
  if (intents.some((intent) => {
    const kedaluwarsa = new Date(intent.expiresAt).getTime();
    return Number.isFinite(kedaluwarsa) && kedaluwarsa > sekarang - jedaAmanMs;
  })) return "url_aktif";
  return null;
}
