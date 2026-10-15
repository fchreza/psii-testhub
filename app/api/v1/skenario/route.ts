import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { klienMentah } from "@/db";
import { wajibMasukApi, bolehAksesProyek } from "@/lib/gerbang";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const STATUS_SAH = ["PENDING","PASS","FAIL","BLOCKED"];

/**
 * API skenario.
 *
 * KENAPA SATU ENDPOINT UNTUK SEMUA OPERASI:
 * Tabel skenario memanggilnya sangat sering (setiap perubahan sel disimpan
 * sendiri-sendiri). Memecahnya jadi banyak endpoint berarti setiap tindakan
 * butuh kesepakatan baru soal bentuk data.
 */
export async function POST(req: Request) {
  const hasil = await wajibMasukApi();
  if ("tolak" in hasil) return hasil.tolak;
  const saya = hasil.pengguna;

  const isi = await req.json().catch(() => null) as
    { aksi?: string; projectId?: string; scenarioId?: string;
      kode?: string; fase?: string; judul?: string; moduleId?: string | null;
      langkahPengujian?: string; hasilDiharapkan?: string;
      pengujiId?: string | null; status?: string; catatanTindakLanjut?: string;
      diubahPada?: string; siapRetest?: boolean; urutan?: number } | null;

  if (!isi?.aksi) return NextResponse.json({ pesan: "aksi wajib" }, { status: 400 });

  // Hak akses proyek diperiksa untuk SETIAP aksi, sebelum apa pun ditulis.
  // Tanpa ini, pengguna eksternal bisa mengubah skenario proyek yang bukan
  // miliknya hanya dengan menebak nomor proyeknya.
  if (isi.projectId) {
    if (!(await bolehAksesProyek(saya, isi.projectId))) {
      return NextResponse.json({ pesan: "Tidak punya akses ke proyek ini" }, { status: 403 });
    }
  }

  try {
    if (isi.aksi === "tambah") {
      const { projectId, fase = "SIT" } = isi;
      if (!projectId) return NextResponse.json({ pesan: "projectId wajib" }, { status: 400 });
      if (!["SIT","UAT"].includes(fase)) {
        return NextResponse.json({ pesan: `Fase tidak sah: ${fase}` }, { status: 400 });
      }
      const judul = (isi.judul ?? "").trim().slice(0, 200);
      if (!judul) return NextResponse.json({ pesan: "Judul skenario wajib diisi" }, { status: 400 });

      /*
       * Kode dibuat otomatis dengan awalan modul: A-01, A-02, B-01, ...
       *
       * KENAPA DIHITUNG DARI NILAI TERBESAR, bukan jumlah baris: kalau memakai
       * jumlah baris, menghapus satu skenario membuat nomor berikutnya
       * bertabrakan dengan yang masih ada — dan tabrakan itu ditolak oleh
       * batasan unik di database, jadi pengguna melihat galat yang membingungkan.
       */
      let awalan = "S";
      if (isi.moduleId && UUID.test(isi.moduleId)) {
        const [m] = (await klienMentah.unsafe(
          `SELECT kode FROM th_modules WHERE id = $1::uuid`, [isi.moduleId],
        )) as unknown as { kode: string }[];
        if (m) awalan = m.kode;
      }
      const [urut] = (await klienMentah.unsafe(
        `SELECT COALESCE(MAX(NULLIF(regexp_replace(kode, '^.*-', ''), '')::int), 0) AS n
         FROM th_scenarios WHERE project_id = $1 AND fase = $2 AND kode LIKE $3`,
        [projectId, fase, `${awalan}-%`],
      )) as unknown as { n: number }[];
      const kode = `${awalan}-${String(urut.n + 1).padStart(2, "0")}`;

      const [pos] = (await klienMentah.unsafe(
        `SELECT COALESCE(MAX(urutan), -1) + 1 AS n FROM th_scenarios WHERE project_id = $1 AND fase = $2`,
        [projectId, fase],
      )) as unknown as { n: number }[];

      const [baru] = (await klienMentah.unsafe(
        `INSERT INTO th_scenarios
           (project_id, module_id, kode, fase, judul, langkah_pengujian, hasil_diharapkan,
            penguji_id, status, catatan_tindak_lanjut, urutan)
         VALUES ($1,$2::uuid,$3,$4,$5,$6,$7,$8::uuid,'PENDING',$9,$10)
         RETURNING id, kode`,
        [projectId, isi.moduleId ?? null, kode, fase, judul,
         isi.langkahPengujian ?? null, isi.hasilDiharapkan ?? null,
         isi.pengujiId ?? null, isi.catatanTindakLanjut ?? null, pos.n],
      )) as unknown as { id: string; kode: string }[];

      revalidatePath(`/proyek/${projectId}`);
      return NextResponse.json({ id: baru.id, kode: baru.kode });
    }

    if (isi.aksi === "ubah") {
      const { scenarioId } = isi;
      if (!scenarioId || !UUID.test(scenarioId)) {
        return NextResponse.json({ pesan: "scenarioId tidak sah" }, { status: 400 });
      }

      const [lama] = (await klienMentah.unsafe(
        `SELECT project_id, status, catatan_tindak_lanjut, diubah_pada
         FROM th_scenarios WHERE id = $1::uuid`, [scenarioId],
      )) as unknown as {
        project_id: string; status: string;
        catatan_tindak_lanjut: string | null; diubah_pada: string;
      }[];
      if (!lama) return NextResponse.json({ pesan: "Skenario tidak ditemukan" }, { status: 404 });

      /*
       * Kunci optimistik.
       *
       * KENAPA: QA dan Business User sering membuka skenario yang sama. Tanpa
       * pemeriksaan ini, yang menyimpan belakangan menimpa perubahan yang
       * pertama — tanpa peringatan, dan tanpa jejak.
       *
       * Hanya diperiksa kalau klien mengirim `diubahPada`; simpanan dari
       * skrip impor tidak wajib mengirimnya.
       */
      if (isi.diubahPada) {
        const klien = new Date(isi.diubahPada).getTime();
        const server = new Date(lama.diubah_pada).getTime();
        if (klien !== server) {
          return NextResponse.json({
            pesan: "Data sudah diubah orang lain. Muat ulang halaman lalu ulangi.",
            konflik: true,
          }, { status: 409 });
        }
      }

      /*
       * ATURAN PRD FR-2.5: status Gagal atau Tertunda WAJIB punya catatan
       * tindak lanjut atau bukti.
       *
       * KENAPA DI SERVER, bukan hanya di antarmuka: aturan yang hanya hidup di
       * antarmuka bisa dilewati oleh permintaan langsung. Dan tujuannya
       * penting — tim pengembang harus tahu PENYEBAB kendalanya, bukan sekadar
       * bahwa ada yang gagal.
       */
      const statusBaru = isi.status ?? lama.status;
      if (statusBaru === "FAIL" || statusBaru === "BLOCKED") {
        const catatan = (isi.catatanTindakLanjut ?? lama.catatan_tindak_lanjut ?? "").trim();
        const [adaBukti] = (await klienMentah.unsafe(
          `SELECT count(*)::int AS n FROM th_evidence WHERE scenario_id = $1::uuid`, [scenarioId],
        )) as unknown as { n: number }[];

        if (!catatan && adaBukti.n === 0) {
          return NextResponse.json({
            pesan: "Status Gagal atau Tertunda wajib disertai catatan tindak lanjut atau bukti.",
            perluCatatan: true,
          }, { status: 400 });
        }
      }

      const kolom: string[] = [];
      // Tipe longgar: driver `postgres` menerima string, number, boolean, null,
      // dan array. Nilainya sudah divalidasi sebelum sampai ke sini.
      const nilai: (string | number | boolean | null)[] = [];
      const catat: { kolom: string; lama: string | null; baru: string | null }[] = [];

      const pasang = (nama: string, v: unknown, lamaV: unknown) => {
        kolom.push(`${nama} = $${kolom.length + 2}`);
        nilai.push(v as string | number | boolean | null);
        const a = lamaV === null || lamaV === undefined ? null : String(lamaV);
        const b = v === null || v === undefined ? null : String(v);
        if (a !== b) catat.push({ kolom: nama, lama: a, baru: b });
      };

      if (isi.judul !== undefined) pasang("judul", isi.judul.trim().slice(0, 200), undefined);
      if (isi.status !== undefined) {
        if (!STATUS_SAH.includes(isi.status)) {
          return NextResponse.json({ pesan: `Status tidak sah: ${isi.status}` }, { status: 400 });
        }
        pasang("status", isi.status, lama.status);
      }
      if (isi.catatanTindakLanjut !== undefined) {
        pasang("catatan_tindak_lanjut", isi.catatanTindakLanjut, lama.catatan_tindak_lanjut);
      }
      if (isi.langkahPengujian !== undefined) pasang("langkah_pengujian", isi.langkahPengujian, undefined);
      if (isi.hasilDiharapkan !== undefined) pasang("hasil_diharapkan", isi.hasilDiharapkan, undefined);
      if (isi.pengujiId !== undefined) pasang("penguji_id", isi.pengujiId || null, undefined);
      if (isi.moduleId !== undefined) pasang("module_id", isi.moduleId || null, undefined);
      if (isi.siapRetest !== undefined) pasang("siap_retest", isi.siapRetest, undefined);

      if (kolom.length === 0) return NextResponse.json({ ok: true, tanpaPerubahan: true });

      await klienMentah.unsafe(
        `UPDATE th_scenarios SET ${kolom.join(", ")} WHERE id = $1::uuid`,
        [scenarioId, ...nilai],
      );

      // Audit log: NFR-1 mewajibkan setiap perubahan status dan catatan
      // tercatat beserta identitas dan waktunya.
      for (const c of catat) {
        await klienMentah.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_lama, nilai_baru)
           VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7)`,
          [saya.id, lama.project_id, scenarioId,
           c.kolom === "status" ? "ubah_status" : "ubah_skenario",
           c.kolom, c.lama, c.baru],
        );
      }

      // Kembalikan cap waktu terbaru supaya klien bisa memakai kunci optimistik
      // berikutnya tanpa memuat ulang halaman.
      const [baru] = (await klienMentah.unsafe(
        `SELECT diubah_pada FROM th_scenarios WHERE id = $1::uuid`, [scenarioId],
      )) as unknown as { diubah_pada: string }[];

      revalidatePath(`/proyek/${lama.project_id}`);
      return NextResponse.json({ ok: true, diubahPada: baru.diubah_pada, diaudit: catat.length });
    }

    if (isi.aksi === "hapus") {
      const { scenarioId } = isi;
      if (!scenarioId || !UUID.test(scenarioId)) {
        return NextResponse.json({ pesan: "scenarioId tidak sah" }, { status: 400 });
      }

      /*
       * KENAPA SKENARIO YANG SUDAH PUNYA BUKTI TIDAK BOLEH DIHAPUS:
       * Bukti adalah catatan pengujian yang sudah dikerjakan. Menghapus
       * skenarionya akan menghapus buktinya juga (lewat ON DELETE CASCADE), dan
       * pekerjaan pengujian itu hilang tanpa jejak. Kalau memang harus
       * disingkirkan, ubah statusnya jadi Tertunda dengan catatan alasannya.
       */
      const [n] = (await klienMentah.unsafe(
        `SELECT count(*)::int AS n FROM th_evidence WHERE scenario_id = $1::uuid`, [scenarioId],
      )) as unknown as { n: number }[];
      if (n.n > 0) {
        return NextResponse.json({
          pesan: `Skenario ini punya ${n.n} berkas bukti, jadi tidak bisa dihapus. Ubah statusnya menjadi Tertunda dengan catatan alasannya.`,
        }, { status: 400 });
      }

      await klienMentah.unsafe(`DELETE FROM th_scenarios WHERE id = $1::uuid`, [scenarioId]);
      if (isi.projectId) revalidatePath(`/proyek/${isi.projectId}`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ pesan: `Aksi tidak dikenal: ${isi.aksi}` }, { status: 400 });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    console.error("[skenario]", isi.aksi, pesan);
    return NextResponse.json({ pesan: "Gagal menyimpan", rincian: pesan }, { status: 500 });
  }
}
