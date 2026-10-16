/**
 * Rekam bukti (termasuk tombstone) dan seluruh intent upload tidak boleh
 * terhapus lewat ON DELETE CASCADE saat skenario dihapus.
 */
export type SebabBlokirHapusSkenario = "bukti" | "unggahan";

export function sebabBlokirHapusSkenario(
  jumlahBukti: number,
  jumlahIntentUnggah: number,
): SebabBlokirHapusSkenario | null {
  if (jumlahBukti > 0) return "bukti";
  if (jumlahIntentUnggah > 0) return "unggahan";
  return null;
}
