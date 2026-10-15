import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { bolehKelolaProyek, wajibMasukApi } from "@/lib/gerbang";

export const dynamic = "force-dynamic";
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ID = /^PRJ-\d{3,}$/;
const ROLE_PENGUJI = ["INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"];

export async function POST(req: Request) {
  const auth = await wajibMasukApi();
  if ("tolak" in auth) return auth.tolak;
  const saya = auth.pengguna;
  if (!bolehKelolaProyek(saya.peran)) {
    return NextResponse.json({ pesan: "Hanya Admin atau Internal PSII yang dapat mengatur akses proyek." }, { status: 403 });
  }

  const isi = await req.json().catch(() => null) as { aksi?: string; projectId?: string; userId?: string } | null;
  if (!isi || !["tambah", "hapus"].includes(isi.aksi ?? "")) {
    return NextResponse.json({ pesan: "Aksi tidak sah." }, { status: 400 });
  }
  const projectId = isi.projectId ?? "";
  const userId = isi.userId ?? "";
  if (!PROJECT_ID.test(projectId) || !USER_ID.test(userId)) {
    return NextResponse.json({ pesan: "ID proyek atau pengguna tidak sah." }, { status: 400 });
  }

  try {
    const [project] = (await klienMentah.unsafe(`SELECT id FROM th_projects WHERE id = $1`, [projectId])) as unknown as { id: string }[];
    if (!project) return NextResponse.json({ pesan: "Proyek tidak ditemukan." }, { status: 404 });

    if (isi.aksi === "tambah") {
      const [user] = (await klienMentah.unsafe(
        `SELECT id, nama, email, peran FROM th_users WHERE id = $1::uuid AND aktif = true`, [userId],
      )) as unknown as { id: string; nama: string; email: string; peran: string }[];
      if (!user) return NextResponse.json({ pesan: "Akun pengguna tidak aktif atau tidak ditemukan." }, { status: 404 });
      if (!ROLE_PENGUJI.includes(user.peran)) {
        return NextResponse.json({ pesan: "Hanya akun Internal Kemenkeu atau Eksternal Kemenkeu yang dapat ditugaskan sebagai penguji proyek." }, { status: 400 });
      }
      const [baru] = (await klienMentah.begin(async (tx) => {
        const hasil = await tx.unsafe(
          `INSERT INTO th_project_members (project_id, user_id, peran_proyek)
           VALUES ($1, $2::uuid, 'PENGUJI') ON CONFLICT (project_id, user_id) DO NOTHING
           RETURNING user_id`, [projectId, userId],
        );
        if (hasil[0]) {
          await tx.unsafe(
            `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_baru)
             VALUES ($1::uuid, $2, 'tugaskan_penguji', 'anggota', $3)`,
            [saya.id, projectId, user.email],
          );
        }
        return hasil;
      })) as unknown as { user_id: string }[];
      return NextResponse.json({ ok: true, anggota: user });
    }

    const [hasil] = (await klienMentah.begin(async (tx) => {
      const deleted = await tx.unsafe(
        `DELETE FROM th_project_members WHERE project_id = $1 AND user_id = $2::uuid RETURNING user_id`,
        [projectId, userId],
      );
      if (deleted[0]) {
        await tx.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_lama)
           VALUES ($1::uuid, $2, 'cabut_penguji', 'anggota', $3)`,
          [saya.id, projectId, userId],
        );
      }
      return deleted;
    })) as unknown as { user_id: string }[];
    if (!hasil) return NextResponse.json({ pesan: "Pengguna tidak tercatat sebagai anggota proyek ini." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[anggota-proyek]", e instanceof Error ? e.message : e);
    return NextResponse.json({ pesan: "Gagal memperbarui penugasan proyek." }, { status: 500 });
  }
}
