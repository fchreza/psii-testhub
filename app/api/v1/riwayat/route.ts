import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { wajibMasukApi, bolehAksesProyek } from "@/lib/gerbang";
import { enkodeKursorRiwayat, parseKursorRiwayat } from "@/lib/validasi-bukti";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UKURAN_HALAMAN = 50;

/** Riwayat satu skenario dengan cursor stabil; tidak membatasi histori total. */
export async function GET(req: Request) {
  const hasil = await wajibMasukApi();
  if ("tolak" in hasil) return hasil.tolak;
  const saya = hasil.pengguna;

  const params = new URL(req.url).searchParams;
  const scenarioId = params.get("scenarioId") ?? "";
  const cursorNilai = params.get("cursor");
  const cursor = parseKursorRiwayat(cursorNilai);
  if (!UUID.test(scenarioId)) {
    return NextResponse.json({ pesan: "scenarioId tidak sah" }, { status: 400 });
  }
  if (cursorNilai && !cursor) {
    return NextResponse.json({ pesan: "Cursor riwayat tidak sah." }, { status: 400 });
  }

  const [s] = (await klienMentah.unsafe(
    `SELECT project_id FROM th_scenarios WHERE id = $1::uuid`, [scenarioId],
  )) as unknown as { project_id: string }[];
  if (!s) return NextResponse.json({ pesan: "Skenario tidak ditemukan" }, { status: 404 });

  if (!(await bolehAksesProyek(saya, s.project_id))) {
    return NextResponse.json({ pesan: "Tidak punya akses" }, { status: 403 });
  }

  const baris = (await klienMentah.unsafe(
    `SELECT a.id::text AS id, a.aksi, a.kolom, a.nilai_lama, a.nilai_baru, a.pada,
            u.nama AS oleh
     FROM th_audit_logs a
     LEFT JOIN th_users u ON u.id = a.user_id
     WHERE a.scenario_id = $1::uuid
       AND ($2::timestamptz IS NULL OR (a.pada, a.id) < ($2::timestamptz, $3::bigint))
     ORDER BY a.pada DESC, a.id DESC
     LIMIT $4`,
    [scenarioId, cursor?.pada ?? null, cursor?.id ?? null, UKURAN_HALAMAN + 1],
  )) as unknown as {
    id: string; aksi: string; kolom: string | null; nilai_lama: string | null;
    nilai_baru: string | null; pada: string; oleh: string | null;
  }[];

  const adaLagi = baris.length > UKURAN_HALAMAN;
  const riwayat = baris.slice(0, UKURAN_HALAMAN);
  const terakhir = riwayat.at(-1);
  const nextCursor = adaLagi && terakhir
    ? enkodeKursorRiwayat({ pada: terakhir.pada, id: terakhir.id })
    : null;
  return NextResponse.json({ riwayat, nextCursor }, { headers: { "Cache-Control": "no-store" } });
}
