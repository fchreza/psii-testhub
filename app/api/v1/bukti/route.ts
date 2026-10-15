import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { klienMentah } from "@/db";
import { wajibMasukApi, bolehAksesProyek, bolehKelolaProyek, bolehUbahEksekusi } from "@/lib/gerbang";
import {
  urlUnggah, urlLihat, objekAda, hapusObjek, kunciBukti,
  jenisDikenal, BATAS_BUKTI, JENIS_BUKTI,
} from "@/lib/simpanan";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * API bukti pengujian.
 *
 * ALURNYA DUA LANGKAH, dan itu disengaja:
 *   1. peramban minta izin  -> server membuatkan URL bertanda tangan
 *   2. peramban unggah berkas LANGSUNG ke penyimpanan (tidak lewat server)
 *   3. peramban memberi tahu server bahwa unggahan selesai
 *
 * Server baru mencatat buktinya setelah MEMERIKSA berkasnya benar-benar ada.
 * Kalau tidak diperiksa, catatan bukti bisa lengkap di database padahal
 * berkasnya tidak pernah sampai — dan itu baru ketahuan saat pimpinan membuka.
 */
export async function POST(req: Request) {
  const hasil = await wajibMasukApi();
  if ("tolak" in hasil) return hasil.tolak;
  const saya = hasil.pengguna;

  const isi = await req.json().catch(() => null) as
    { aksi?: string; projectId?: string; scenarioId?: string;
      namaBerkas?: string; mime?: string; ukuran?: number; keterangan?: string;
      evidenceId?: string } | null;

  if (!isi?.aksi) return NextResponse.json({ pesan: "aksi wajib" }, { status: 400 });

  if (!isi.projectId || !/^PRJ-\d{3,}$/.test(isi.projectId)) {
    return NextResponse.json({ pesan: "ID proyek wajib dan harus sah." }, { status: 400 });
  }
  if (!(await bolehAksesProyek(saya, isi.projectId))) {
    return NextResponse.json({ pesan: "Tidak punya akses ke proyek ini" }, { status: 403 });
  }
  if (isi.aksi !== "daftar" && !bolehUbahEksekusi(saya.peran)) {
    return NextResponse.json({ pesan: "Peran Pimpinan hanya dapat melihat." }, { status: 403 });
  }
  if (isi.aksi === "hapus" && !bolehKelolaProyek(saya.peran)) {
    return NextResponse.json({ pesan: "Hanya Admin atau Internal PSII yang dapat menghapus bukti." }, { status: 403 });
  }

  try {
    /* ---- 1. minta izin unggah ---- */
    if (isi.aksi === "izin_unggah") {
      const { projectId, scenarioId, namaBerkas, mime, ukuran } = isi;
      if (!projectId || !scenarioId || !UUID.test(scenarioId)) {
        return NextResponse.json({ pesan: "projectId/scenarioId tidak sah" }, { status: 400 });
      }
      if (!mime || !jenisDikenal(mime)) {
        return NextResponse.json({
          pesan: `Jenis berkas tidak didukung. Yang boleh: ${Object.values(JENIS_BUKTI).join(", ")}`,
        }, { status: 400 });
      }
      if (typeof ukuran === "number" && ukuran > BATAS_BUKTI) {
        return NextResponse.json({
          pesan: `Berkas ${(ukuran / 1024 / 1024).toFixed(1)} MB melebihi batas 10 MB.`,
        }, { status: 400 });
      }

      const [s] = (await klienMentah.unsafe(
        `SELECT id FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`,
        [scenarioId, projectId],
      )) as unknown as { id: string }[];
      if (!s) return NextResponse.json({ pesan: "Skenario tidak ada di proyek ini" }, { status: 404 });

      const kunci = kunciBukti(projectId, scenarioId, mime);
      const url = await urlUnggah(kunci, mime);
      return NextResponse.json({ kunci, url, kedaluwarsa: 600 });
    }

    /* ---- 2. catat setelah unggahan selesai ---- */
    if (isi.aksi === "catat") {
      const { projectId, scenarioId, namaBerkas, mime, ukuran } = isi;
      const kunci = (isi as unknown as { kunci?: string }).kunci;
      if (!projectId || !scenarioId || !UUID.test(scenarioId) || !kunci) {
        return NextResponse.json({ pesan: "projectId, scenarioId, dan kunci wajib" }, { status: 400 });
      }
      if (!mime || !jenisDikenal(mime) || (typeof ukuran === "number" && (ukuran < 0 || ukuran > BATAS_BUKTI))) {
        return NextResponse.json({ pesan: "Tipe atau ukuran bukti tidak sah." }, { status: 400 });
      }
      if (!kunci.startsWith(`bukti/${projectId}/${scenarioId}/`)) {
        // Kunci yang tidak berada di bawah proyek+skenario ini berarti ada yang
        // mencoba menyisipkan bukti milik orang lain ke skenarionya sendiri.
        return NextResponse.json({ pesan: "Kunci berkas tidak sesuai skenario" }, { status: 400 });
      }

      const [s] = (await klienMentah.unsafe(
        `SELECT id FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`, [scenarioId, projectId],
      )) as unknown as { id: string }[];
      if (!s) return NextResponse.json({ pesan: "Skenario tidak ada di proyek ini." }, { status: 404 });

      if (!(await objekAda(kunci))) {
        return NextResponse.json({
          pesan: "Berkas tidak ditemukan di penyimpanan. Unggahan mungkin gagal — coba lagi.",
        }, { status: 400 });
      }

      const [b] = (await klienMentah.unsafe(
        `INSERT INTO th_evidence (scenario_id, path, nama_asli, tipe, ukuran, diunggah_oleh)
         VALUES ($1::uuid,$2,$3,$4,$5,$6::uuid) RETURNING id`,
        [scenarioId, kunci, (namaBerkas ?? "bukti").slice(0, 240), mime ?? null,
         ukuran ?? null, saya.id],
      )) as unknown as { id: string }[];

      // Unggahan bukti termasuk tindakan yang wajib tercatat (NFR-1).
      await klienMentah.unsafe(
        `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_baru)
         VALUES ($1::uuid,$2,$3::uuid,'unggah_bukti','bukti',$4)`,
        [saya.id, projectId, scenarioId, namaBerkas ?? kunci],
      );

      revalidatePath(`/proyek/${projectId}`);
      return NextResponse.json({ id: b.id });
    }

    /* ---- 3. daftar bukti sebuah skenario ---- */
    if (isi.aksi === "daftar") {
      const { scenarioId } = isi;
      if (!scenarioId || !UUID.test(scenarioId)) {
        return NextResponse.json({ pesan: "scenarioId tidak sah" }, { status: 400 });
      }
      const [s] = (await klienMentah.unsafe(
        `SELECT id FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`, [scenarioId, isi.projectId],
      )) as unknown as { id: string }[];
      if (!s) return NextResponse.json({ pesan: "Skenario tidak ditemukan di proyek ini." }, { status: 404 });
      const baris = (await klienMentah.unsafe(
        `SELECT id, path, nama_asli, tipe, ukuran, diunggah_pada
         FROM th_evidence WHERE scenario_id = $1::uuid ORDER BY diunggah_pada`,
        [scenarioId],
      )) as unknown as { path: string }[];

      // URL dibuat saat diminta, bukan disimpan: kalau disimpan, tautannya
      // kedaluwarsa dan tidak ada yang bisa memperbaruinya.
      const denganUrl = await Promise.all(baris.map(async (b) => ({
        ...b, url: await urlLihat(b.path),
        urlUnduh: await urlLihat(b.path, true),
      })));
      return NextResponse.json({ bukti: denganUrl });
    }

    /* ---- 4. hapus bukti ---- */
    if (isi.aksi === "hapus") {
      const { evidenceId, projectId } = isi;
      if (!evidenceId || !UUID.test(evidenceId)) {
        return NextResponse.json({ pesan: "evidenceId tidak sah" }, { status: 400 });
      }
      const [b] = (await klienMentah.unsafe(
        `SELECT e.path, e.nama_asli, s.project_id
         FROM th_evidence e JOIN th_scenarios s ON s.id = e.scenario_id
         WHERE e.id = $1::uuid AND s.project_id = $2`, [evidenceId, projectId],
      )) as unknown as { path: string; nama_asli: string | null; project_id: string }[];
      if (!b) return NextResponse.json({ pesan: "Bukti tidak ditemukan" }, { status: 404 });

      if (!(await bolehAksesProyek(saya, b.project_id))) {
        return NextResponse.json({ pesan: "Tidak punya akses" }, { status: 403 });
      }

      await klienMentah.unsafe(`DELETE FROM th_evidence WHERE id = $1::uuid`, [evidenceId]);
      try {
        await hapusObjek(b.path);
      } catch (e) {
        /*
         * Kalau penghapusan objek gagal, catatannya sudah terhapus. Ini
         * disengaja: berkas yatim lebih baik daripada catatan yang menunjuk
         * berkas yang tidak ada. Kegagalannya dilaporkan ke log, bukan disembunyikan.
         */
        console.error("[bukti] gagal hapus objek", b.path, e instanceof Error ? e.message : e);
      }

      await klienMentah.unsafe(
        `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_lama)
         VALUES ($1::uuid,$2,'hapus_bukti','bukti',$3)`,
        [saya.id, b.project_id, b.nama_asli ?? b.path],
      );

      if (projectId) revalidatePath(`/proyek/${projectId}`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ pesan: `Aksi tidak dikenal: ${isi.aksi}` }, { status: 400 });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    console.error("[bukti]", isi.aksi, pesan);
    return NextResponse.json({ pesan: "Gagal memproses bukti", rincian: pesan }, { status: 500 });
  }
}
