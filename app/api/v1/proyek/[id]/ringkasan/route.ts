import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { bolehAksesProyek, wajibMasukApi } from "@/lib/gerbang";
import { faseUntukProyek, type FasePengujian } from "@/lib/fase-proyek";

export const dynamic = "force-dynamic";

const PROJECT_ID = /^PRJ-\d{3,}$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesi = await wajibMasukApi();
  if ("tolak" in sesi) return sesi.tolak;

  const { id } = await params;
  if (!PROJECT_ID.test(id)) {
    return NextResponse.json({ pesan: "ID proyek tidak sah." }, { status: 400 });
  }

  const fase = new URL(req.url).searchParams.get("fase");
  if (fase !== "SIT" && fase !== "UAT") {
    return NextResponse.json({ pesan: "Fase SIT atau UAT wajib dipilih." }, { status: 400 });
  }

  try {
    const [[proyek], bolehAkses] = await Promise.all([
      klienMentah.unsafe(
        `SELECT jenis_pengujian FROM th_projects WHERE id = $1`, [id],
      ),
      bolehAksesProyek(sesi.pengguna, id),
    ]) as unknown as [{ jenis_pengujian: string }[], boolean];

    if (!proyek || !bolehAkses) {
      return NextResponse.json({ pesan: "Proyek tidak ditemukan atau tidak tersedia." }, { status: 404 });
    }
    if (!faseUntukProyek(proyek.jenis_pengujian).includes(fase as FasePengujian)) {
      return NextResponse.json({ pesan: "Fase tidak tersedia untuk proyek ini." }, { status: 400 });
    }

    const [ringkasan] = (await klienMentah.unsafe(`
      SELECT
        COALESCE(
          json_agg(json_build_object(
            'id', s.id,
            'kode', s.kode,
            'fase', s.fase,
            'judul', s.judul,
            'langkah_pengujian', s.langkah_pengujian,
            'hasil_diharapkan', s.hasil_diharapkan,
            'hasil_aktual', s.hasil_aktual,
            'status', s.status,
            'catatan_tindak_lanjut', s.catatan_tindak_lanjut,
            'siap_retest', s.siap_retest,
            'module_id', s.module_id,
            'urutan', s.urutan,
            'penguji_id', s.penguji_id,
            'penguji_nama', u.nama,
            'jumlah_bukti', COALESCE(e.jumlah, 0),
            'diubah_pada', s.diubah_pada,
            'versi', s.xmin::text
          ) ORDER BY s.urutan, s.kode) FILTER (WHERE s.id IS NOT NULL),
          '[]'::json
        ) AS skenario,
        count(s.id)::int AS total,
        count(s.id) FILTER (WHERE s.status = 'PASS')::int AS lulus,
        count(s.id) FILTER (WHERE s.status = 'FAIL')::int AS gagal,
        count(s.id) FILTER (WHERE s.status = 'BLOCKED')::int AS tertunda,
        count(s.id) FILTER (WHERE s.status = 'PENDING')::int AS belum
      FROM th_scenarios s
      LEFT JOIN th_users u ON u.id = s.penguji_id
      LEFT JOIN (
        SELECT e.scenario_id, count(*)::int AS jumlah
        FROM th_evidence e
        JOIN th_scenarios es ON es.id = e.scenario_id
        WHERE es.project_id = $1 AND es.fase = $2
        GROUP BY e.scenario_id
      ) e ON e.scenario_id = s.id
      WHERE s.project_id = $1 AND s.fase = $2
    `, [id, fase])) as unknown as {
      skenario: unknown[];
      total: number;
      lulus: number;
      gagal: number;
      tertunda: number;
      belum: number;
    }[];

    return NextResponse.json({
      skenario: ringkasan?.skenario ?? [],
      statistik: {
        total: Number(ringkasan?.total ?? 0),
        lulus: Number(ringkasan?.lulus ?? 0),
        gagal: Number(ringkasan?.gagal ?? 0),
        tertunda: Number(ringkasan?.tertunda ?? 0),
        belum: Number(ringkasan?.belum ?? 0),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Gagal memuat ringkasan proyek", error);
    return NextResponse.json({ pesan: "Data proyek belum dapat diperbarui. Coba lagi." }, { status: 500 });
  }
}
