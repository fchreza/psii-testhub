export type HasilAuditBukti = "uploaded" | "pending" | "deleted";

export type MetadataAuditBukti = {
  version: 1;
  outcome: HasilAuditBukti;
  reason: string | null;
};

function sanitasiAlasanAudit(reason: string): string {
  return reason
    .replace(/https?:\/\/\S+/gi, "[URL disembunyikan]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gi, "[kredensial disembunyikan]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [token disembunyikan]")
    .replace(/\b(password|passwd|secret|token|access[_ -]?key)\s*[:=]\s*[^,\s;]+/gi, "$1=[disembunyikan]")
    .replace(/\b(?:bukti|bukti-upload)\/[A-Za-z0-9_.%/=-]+/gi, "[kunci penyimpanan disembunyikan]");
}

/** Simpan hanya outcome/alasan; jangan masukkan nama/path atau isi berkas. */
export function serialisasiAuditBukti(
  outcome: HasilAuditBukti,
  reason?: string | null,
): string {
  const alasan = typeof reason === "string" ? sanitasiAlasanAudit(reason.trim()).slice(0, 1000) : "";
  const metadata: MetadataAuditBukti = {
    version: 1,
    outcome,
    reason: alasan || null,
  };
  return JSON.stringify(metadata);
}

export function bacaAuditBukti(nilai: string | null): MetadataAuditBukti | null {
  if (!nilai) return null;
  try {
    const data = JSON.parse(nilai) as Partial<MetadataAuditBukti>;
    if (data.version !== 1 || !["uploaded", "pending", "deleted"].includes(data.outcome ?? "")) return null;
    if (data.reason !== null && typeof data.reason !== "string") return null;
    return {
      version: 1,
      outcome: data.outcome as HasilAuditBukti,
      reason: typeof data.reason === "string" ? data.reason : null,
    };
  } catch {
    return null;
  }
}
