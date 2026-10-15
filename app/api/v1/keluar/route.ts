import { NextResponse } from "next/server";
import { hapusCookie } from "@/lib/sesi";

export const dynamic = "force-dynamic";

/**
 * Keluar lewat POST, bukan tautan GET.
 *
 * KENAPA: tautan GET bisa mengeluarkan pengguna tanpa ia minta hanya karena
 * gambarnya dimuat di pratinjau tautan chat. Tindakan yang mengubah keadaan
 * harus lewat POST.
 */
export async function POST() {
  await hapusCookie();
  return NextResponse.json({ ok: true });
}
