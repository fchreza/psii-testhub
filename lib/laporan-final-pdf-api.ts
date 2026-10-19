import { NextResponse } from "next/server";
import { bolehLihatLaporan } from "@/lib/laporan-final";

export function handlerPdfLaporan({ db: klienMentah, auth: wajibMasukApi }: {
  db: typeof import("../db").klienMentah;
  auth: typeof import("./gerbang").wajibMasukApi;
}) {
return async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await wajibMasukApi();
  if ("tolak" in auth) return auth.tolak;
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!bolehLihatLaporan(auth.pengguna.peran)) return NextResponse.json({ pesan: "Anda tidak memiliki akses laporan final." }, { status: 403, headers });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ pesan: "Laporan tidak ditemukan." }, { status: 404, headers });
  }
  try {
    const [report] = await klienMentah.unsafe(`SELECT project_id,versi,pdf FROM th_final_reports WHERE id=$1::uuid`, [id]);
    if (!report) return NextResponse.json({ pesan: "Laporan tidak ditemukan." }, { status: 404, headers });
    const attachment = new URL(req.url).searchParams.get("unduh") === "1";
    // Nama dibangun dari ID proyek terstruktur, bukan judul/masukan bebas.
    const projectId = /^PRJ-\d{3,}$/.test(report.project_id) ? report.project_id : "proyek";
    return new Response(new Uint8Array(report.pdf), { headers: { ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="${projectId}-laporan-final-uat-v${Number(report.versi)}.pdf"`,
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; sandbox",
      "X-Frame-Options": "SAMEORIGIN",
    } });
  } catch (error) {
    console.error("[laporan-final] PDF gagal dimuat", { code: (error as { code?: string }).code });
    return NextResponse.json({ pesan: "PDF belum dapat dimuat." }, { status: 503, headers });
  }
}

}
