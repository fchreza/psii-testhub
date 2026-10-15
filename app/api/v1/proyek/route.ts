import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { wajibMasukApi, internal } from "@/lib/gerbang";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const LINGKUNGAN_SAH = ["DEV","SIT","UAT","PROD"];

/**
 * Nomor proyek berurutan: PRJ-001, PRJ-002, ...
 *
 * KENAPA DIHITUNG DARI NILAI TERBESAR, bukan dari jumlah baris:
 * Kalau memakai jumlah baris, menghapus satu proyek akan membuat nomor
 * berikutnya bertabrakan dengan yang sudah ada. Mengambil nilai terbesar
 * membuat nomor tidak pernah dipakai ulang.
 */
async function nomorProyekBaru(): Promise<string> {
  const [r] = (await klienMentah.unsafe(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(id, '\D', '', 'g'), '')::int), 0) AS n FROM th_projects`,
  )) as unknown as { n: number }[];
  return `PRJ-${String(r.n + 1).padStart(3, "0")}`;
}

export async function POST(req: Request) {
  // Gerbang diperiksa SEBELUM isi permintaan dibaca: bentuk balasan tidak boleh
  // memberi tahu apa pun kepada yang belum masuk.
  const hasil = await wajibMasukApi();
  if ("tolak" in hasil) return hasil.tolak;
  const saya = hasil.pengguna;

  /*
   * KENAPA HANYA PM DAN ADMIN: PM bertanggung jawab atas administrasi proyek
   * (PRD Bagian 4). Pengguna eksternal tentu tidak boleh membuat proyek.
   */
  if (saya.peran !== "PM" && saya.peran !== "ADMIN") {
    return NextResponse.json(
      { pesan: "Hanya PM atau admin yang boleh membuat proyek" }, { status: 403 },
    );
  }

  const isi = await req.json().catch(() => null) as
    { aksi?: string; nama?: string; modulAplikasi?: string; unitBisnis?: string;
      ruangLingkup?: string; sumberAcuan?: string; dasarRegulasi?: string;
      lingkungan?: string; alamatServer?: string; tahunAnggaran?: number;
      tanggalMulai?: string; targetSelesai?: string } | null;

  if (!isi?.aksi) return NextResponse.json({ pesan: "aksi wajib" }, { status: 400 });

  try {
    if (isi.aksi === "tambah") {
      const nama = (isi.nama ?? "").trim().slice(0, 200);
      if (!nama) return NextResponse.json({ pesan: "Nama proyek wajib diisi" }, { status: 400 });

      const lingkungan = isi.lingkungan ?? "DEV";
      if (!LINGKUNGAN_SAH.includes(lingkungan)) {
        return NextResponse.json({ pesan: `Lingkungan tidak sah: ${lingkungan}` }, { status: 400 });
      }

      const id = await nomorProyekBaru();
      await klienMentah.unsafe(
        `INSERT INTO th_projects
           (id, nama, modul_aplikasi, unit_bisnis, pm_id, ruang_lingkup, sumber_acuan,
            dasar_regulasi, lingkungan, alamat_server, tahun_anggaran,
            tanggal_mulai, target_selesai, versi_dokumen, disusun_oleh, status_dokumen)
         VALUES ($1,$2,$3,$4,$5::uuid,$6,$7,$8,$9,$10,$11,$12::date,$13::date,'1.0','Draft','Draft')`,
        [id, nama,
         (isi.modulAplikasi ?? "").trim().slice(0, 160) || null,
         (isi.unitBisnis ?? "").trim().slice(0, 160) || null,
         saya.id,
         (isi.ruangLingkup ?? "").trim() || null,
         (isi.sumberAcuan ?? "").trim().slice(0, 200) || null,
         (isi.dasarRegulasi ?? "").trim().slice(0, 200) || null,
         lingkungan,
         (isi.alamatServer ?? "").trim().slice(0, 300) || null,
         isi.tahunAnggaran || null,
         isi.tanggalMulai || null,
         isi.targetSelesai || null],
      );

      /*
       * PM yang membuat proyek otomatis menjadi anggotanya. Tanpa ini, kalau
       * ia nanti berperan sebagai pengguna biasa pada proyeknya sendiri, ia
       * tidak akan bisa membukanya.
       */
      await klienMentah.unsafe(
        `INSERT INTO th_project_members (project_id, user_id, peran_proyek)
         VALUES ($1, $2::uuid, 'PM') ON CONFLICT DO NOTHING`,
        [id, saya.id],
      );

      return NextResponse.json({ id });
    }

    if (isi.aksi === "ubah_tahap") {
      const { projectId, tahap } = isi as unknown as { projectId?: string; tahap?: string };
      if (!projectId || !UUID.test(projectId)) {
        // Nomor proyek bukan UUID; bentuknya PRJ-001.
        if (!projectId || !/^PRJ-\d{3,}$/.test(projectId)) {
          return NextResponse.json({ pesan: "projectId tidak sah" }, { status: 400 });
        }
      }
      const SAH = ["PERSIAPAN","SIT","UAT","WAITING_SIGNOFF","SELESAI"];
      if (!tahap || !SAH.includes(tahap)) {
        return NextResponse.json({ pesan: `Tahap tidak sah: ${tahap}` }, { status: 400 });
      }
      await klienMentah.unsafe(
        `UPDATE th_projects SET tahap = $1 WHERE id = $2`, [tahap, projectId],
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ pesan: `Aksi tidak dikenal: ${isi.aksi}` }, { status: 400 });
  } catch (e) {
    console.error("[proyek]", isi.aksi, e instanceof Error ? e.message : e);
    return NextResponse.json({ pesan: "Gagal menyimpan" }, { status: 500 });
  }
}
