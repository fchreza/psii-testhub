import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { klienMentah } from "@/db";
import { wajibMasukApi, bolehAksesProyek, bolehKelolaProyek } from "@/lib/gerbang";
import { kodeLembarBerikutnya, validasiNamaLembar } from "@/lib/lembar-proyek";

export const dynamic = "force-dynamic";
const PROJECT_ID = /^PRJ-\d{3,}$/;

/** Tambah satu worksheet (kelompok/modul/menu) ke proyek aktif. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const hasilAuth = await wajibMasukApi();
  if ("tolak" in hasilAuth) return hasilAuth.tolak;
  const saya = hasilAuth.pengguna;
  const { id: projectId } = await params;

  if (!PROJECT_ID.test(projectId)) {
    return NextResponse.json({ pesan: "ID proyek tidak sah." }, { status: 400 });
  }
  if (!bolehKelolaProyek(saya.peran)) {
    return NextResponse.json({ pesan: "Hanya Admin atau Internal PSII yang dapat membuat kelompok/modul/menu." }, { status: 403 });
  }
  if (!(await bolehAksesProyek(saya, projectId))) {
    return NextResponse.json({ pesan: "Tidak punya akses ke proyek ini." }, { status: 403 });
  }

  const isi = await req.json().catch(() => null) as { nama?: unknown } | null;
  const nama = validasiNamaLembar(isi?.nama);
  if (!nama.ok) return NextResponse.json({ pesan: nama.pesan }, { status: 400 });

  try {
    const hasil = await klienMentah.begin(async (tx) => {
      const [proyek] = (await tx.unsafe(
        `SELECT id FROM th_projects WHERE id = $1 FOR UPDATE`, [projectId],
      )) as unknown as { id: string }[];
      if (!proyek) return { tidakDitemukan: true as const };

      // Menserialisasi penentuan urutan dan kode ketika beberapa pengelola menambah tab bersamaan.
      await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`psii-testhub-module:${projectId}`]);
      const rows = (await tx.unsafe(
        `SELECT kode FROM th_modules WHERE project_id = $1`, [projectId],
      )) as unknown as { kode: string }[];
      const kode = kodeLembarBerikutnya(rows.map((row) => row.kode));
      const [posisi] = (await tx.unsafe(
        `SELECT COALESCE(MAX(urutan), -1) + 1 AS n FROM th_modules WHERE project_id = $1`, [projectId],
      )) as unknown as { n: number }[];
      const [modul] = (await tx.unsafe(
        `INSERT INTO th_modules (project_id, kode, nama, urutan)
         VALUES ($1, $2, $3, $4)
         RETURNING id::text AS id, kode, nama, urutan`,
        [projectId, kode, nama.nama, posisi.n],
      )) as unknown as { id: string; kode: string; nama: string; urutan: number }[];
      await tx.unsafe(
        `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_baru)
         VALUES ($1::uuid, $2, 'tambah_modul', 'modul', $3)`,
        [saya.id, projectId, `${kode} — ${nama.nama}`],
      );
      return { tidakDitemukan: false as const, modul };
    });

    if (hasil.tidakDitemukan) {
      return NextResponse.json({ pesan: "Proyek tidak ditemukan." }, { status: 404 });
    }
    revalidatePath(`/proyek/${projectId}`);
    return NextResponse.json({ modul: hasil.modul }, { status: 201 });
  } catch (error) {
    console.error("[proyek-modul]", error instanceof Error ? error.message : error);
    return NextResponse.json({ pesan: "Gagal membuat lembar. Coba lagi." }, { status: 500 });
  }
}
