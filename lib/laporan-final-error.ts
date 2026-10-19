import { randomUUID } from "node:crypto";

/** Header korelasi dibatasi agar tidak menerima teks bebas/payload sebagai log. */
export function korelasiLaporan(req: Request): string {
  for (const key of ["x-vercel-id", "x-request-id"]) {
    const value = req.headers.get(key);
    if (value && /^[A-Za-z0-9_:-]{1,160}$/.test(value)) return value;
  }
  return randomUUID();
}

/** Hanya metadata diagnostik berformat terbatas. Jangan log message, detail,
 * query, parameters, snapshot, atau seluruh objek error dari driver. */
export function metadataGalatLaporan(error: unknown, correlationId: string) {
  const e = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const identifier = (value: unknown) => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value) ? value : undefined;
  return {
    code: typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code) ? e.code : undefined,
    constraint: identifier(e.constraint_name ?? e.constraint),
    table: identifier(e.table_name ?? e.table),
    correlationId,
  };
}
