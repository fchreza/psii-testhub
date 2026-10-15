import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { wajibMasukApi, bolehAksesProyek } from "@/lib/gerbang";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/** Riwayat perubahan satu skenario (NFR-1: jejak audit harus bisa dilihat). */
export async function GET(req: Request) {
  const hasil = await wajibMasukApi();
  if ("tolak" in hasil) return hasil.tolak;
  const saya = hasil.pengguna;

  const scenarioId = new URL(req.url).searchParams.get("scenarioId") ?? "";
  if (!UUID.test(scenarioId)) {
    return NextResponse.json({ pesan: "scenarioId tidak sah" }, { status: 400 });
  }

  const [s] = (await klienMentah.unsafe(
    `SELECT project_id FROM th_scenarios WHERE id = $1::uuid`, [scenarioId],
  )) as unknown as { project_id: string }[];
  if (!s) return NextResponse.json({ pesan: "Skenario tidak ditemukan" }, { status: 404 });

  if (!(await bolehAksesProyek(saya, s.project_id))) {
    return NextResponse.json({ pesan: "Tidak punya akses" }, { status: 403 });
  }

  const riwayat = (await klienMentah.unsafe(
    `SELECT a.id, a.aksi, a.kolom, a.nilai_lama, a.nilai_baru, a.pada,
            u.nama AS oleh
     FROM th_audit_logs a
     LEFT JOIN th_users u ON u.id = a.user_id
     WHERE a.scenario_id = $1::uuid
     ORDER BY a.pada DESC
     LIMIT 50`, [scenarioId],
  )) as unknown as {
    id: number; aksi: string; kolom: string | null; nilai_lama: string | null;
    nilai_baru: string | null; pada: string; oleh: string | null;
  }[];
  return NextResponse.json({ riwayat });
}
