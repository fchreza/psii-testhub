import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { klienMentah } from "@/db";
import {
  wajibMasukApi, bolehAksesProyek, bolehKelolaSkenario, bolehUbahEksekusi,
} from "@/lib/gerbang";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
      hasilAktual?: string; pengujiId?: string | null; status?: string; catatanTindakLanjut?: string;
      diubahPada?: string; siapRetest?: boolean; urutan?: number } | null;

  if (!isi?.aksi) return NextResponse.json({ pesan: "aksi wajib" }, { status: 400 });
  if (!isi.projectId || !/^PRJ-\d{3,}$/.test(isi.projectId)) {
    return NextResponse.json({ pesan: "projectId wajib dan harus sah." }, { status: 400 });
  }
  // Scope proyek diperiksa untuk setiap operasi, termasuk ubah/hapus skenario.
  if (!(await bolehAksesProyek(saya, isi.projectId))) {
    return NextResponse.json({ pesan: "Tidak punya akses ke proyek ini" }, { status: 403 });
  }
  if (!bolehUbahEksekusi(saya.peran)) {
    return NextResponse.json({ pesan: "Peran Pimpinan hanya dapat melihat." }, { status: 403 });
  }
  if (["tambah", "hapus"].includes(isi.aksi) && !bolehKelolaSkenario(saya.peran)) {
    return NextResponse.json({ pesan: "Hanya Admin atau Internal PSII yang dapat membuat atau menghapus skenario." }, { status: 403 });
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
      let pengujiId: string | null = null;
      if (isi.pengujiId) {
        if (!UUID.test(isi.pengujiId)) return NextResponse.json({ pesan: "Penguji tidak sah." }, { status: 400 });
        const [penguji] = (await klienMentah.unsafe(
          `SELECT id, peran FROM th_users WHERE id = $1::uuid AND aktif = true`, [isi.pengujiId],
        )) as unknown as { id: string; peran: string }[];
        if (!penguji || !["INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"].includes(penguji.peran)) {
          return NextResponse.json({ pesan: "Pilih akun penguji Internal atau Eksternal Kemenkeu yang aktif." }, { status: 400 });
        }
        const [anggota] = (await klienMentah.unsafe(
          `SELECT 1 AS ada FROM th_project_members WHERE project_id = $1 AND user_id = $2::uuid`, [projectId, isi.pengujiId],
        )) as unknown as { ada: number }[];
        if (!anggota) return NextResponse.json({ pesan: "Penguji harus ditugaskan pada proyek ini terlebih dahulu." }, { status: 400 });
        pengujiId = isi.pengujiId;
      }

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
          `SELECT kode FROM th_modules WHERE id = $1::uuid AND project_id = $2`, [isi.moduleId, projectId],
        )) as unknown as { kode: string }[];
        if (!m) return NextResponse.json({ pesan: "Modul tidak ditemukan di proyek ini." }, { status: 400 });
        awalan = m.kode;
      } else if (isi.moduleId) {
        return NextResponse.json({ pesan: "moduleId tidak sah." }, { status: 400 });
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
         pengujiId, isi.catatanTindakLanjut ?? null, pos.n],
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
        `SELECT project_id, judul, langkah_pengujian, hasil_diharapkan, hasil_aktual,
                penguji_id, module_id, siap_retest, status, catatan_tindak_lanjut, diubah_pada
         FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`, [scenarioId, isi.projectId],
      )) as unknown as {
        project_id: string; judul: string; langkah_pengujian: string | null;
        hasil_diharapkan: string | null; hasil_aktual: string | null;
        penguji_id: string | null; module_id: string | null; siap_retest: boolean; status: string;
        catatan_tindak_lanjut: string | null; diubah_pada: string;
      }[];
      if (!lama) return NextResponse.json({ pesan: "Skenario tidak ditemukan" }, { status: 404 });

      const kolomMaster = ["judul", "langkahPengujian", "hasilDiharapkan", "pengujiId", "moduleId", "siapRetest"] as const;
      if (!bolehKelolaSkenario(saya.peran) && kolomMaster.some((k) => isi[k] !== undefined)) {
        return NextResponse.json({ pesan: "Akun penguji hanya dapat mengubah status, hasil aktual, dan catatan tindak lanjut." }, { status: 403 });
      }

      /*
       * Kunci optimistik.
       *
       * KENAPA: dua penguji dapat membuka skenario yang sama. Tanpa
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
        kolom.push(`${nama} = $${kolom.length + 3}`);
        nilai.push(v as string | number | boolean | null);
        const a = lamaV === null || lamaV === undefined ? null : String(lamaV);
        const b = v === null || v === undefined ? null : String(v);
        if (a !== b) catat.push({ kolom: nama, lama: a, baru: b });
      };

      if (isi.judul !== undefined) {
        const judul = isi.judul.trim().slice(0, 200);
        if (!judul) return NextResponse.json({ pesan: "Judul skenario wajib diisi." }, { status: 400 });
        pasang("judul", judul, lama.judul);
      }
      if (isi.status !== undefined) {
        if (!STATUS_SAH.includes(isi.status)) {
          return NextResponse.json({ pesan: `Status tidak sah: ${isi.status}` }, { status: 400 });
        }
        pasang("status", isi.status, lama.status);
      }
      if (isi.catatanTindakLanjut !== undefined) {
        pasang("catatan_tindak_lanjut", (isi.catatanTindakLanjut ?? "").slice(0, 20000), lama.catatan_tindak_lanjut);
      }
      if (isi.langkahPengujian !== undefined) pasang("langkah_pengujian", isi.langkahPengujian.slice(0, 20000), lama.langkah_pengujian);
      if (isi.hasilDiharapkan !== undefined) pasang("hasil_diharapkan", isi.hasilDiharapkan.slice(0, 20000), lama.hasil_diharapkan);
      if (isi.hasilAktual !== undefined) pasang("hasil_aktual", isi.hasilAktual.slice(0, 20000), lama.hasil_aktual);
      if (isi.pengujiId !== undefined) {
        if (isi.pengujiId && !UUID.test(isi.pengujiId)) return NextResponse.json({ pesan: "Penguji tidak sah." }, { status: 400 });
        if (isi.pengujiId) {
          const [penguji] = (await klienMentah.unsafe(
            `SELECT id, peran FROM th_users WHERE id = $1::uuid AND aktif = true`, [isi.pengujiId],
          )) as unknown as { id: string; peran: string }[];
          if (!penguji) return NextResponse.json({ pesan: "Akun penguji tidak aktif atau tidak ditemukan." }, { status: 400 });
          if (!["INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"].includes(penguji.peran)) {
            return NextResponse.json({ pesan: "Hanya akun penguji Internal/Eksternal Kemenkeu yang bisa ditugaskan." }, { status: 400 });
          }
          const [anggota] = (await klienMentah.unsafe(
            `SELECT 1 AS ada FROM th_project_members WHERE project_id = $1 AND user_id = $2::uuid`, [isi.projectId, isi.pengujiId],
          )) as unknown as { ada: number }[];
          if (!anggota) return NextResponse.json({ pesan: "Penguji harus ditugaskan pada proyek ini terlebih dahulu." }, { status: 400 });
        }
        pasang("penguji_id", isi.pengujiId || null, lama.penguji_id);
      }
      if (isi.moduleId !== undefined) {
        if (isi.moduleId && !UUID.test(isi.moduleId)) return NextResponse.json({ pesan: "moduleId tidak sah." }, { status: 400 });
        if (isi.moduleId) {
          const [modul] = (await klienMentah.unsafe(
            `SELECT id FROM th_modules WHERE id = $1::uuid AND project_id = $2`, [isi.moduleId, isi.projectId],
          )) as unknown as { id: string }[];
          if (!modul) return NextResponse.json({ pesan: "Modul tidak ditemukan di proyek ini." }, { status: 400 });
        }
        pasang("module_id", isi.moduleId || null, lama.module_id);
      }
      if (isi.siapRetest !== undefined) pasang("siap_retest", isi.siapRetest, lama.siap_retest);

      if (kolom.length === 0) return NextResponse.json({ ok: true, tanpaPerubahan: true });

      await klienMentah.unsafe(
        `UPDATE th_scenarios SET ${kolom.join(", ")} WHERE id = $1::uuid AND project_id = $2`,
        [scenarioId, isi.projectId, ...nilai],
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
        `SELECT diubah_pada FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`, [scenarioId, isi.projectId],
      )) as unknown as { diubah_pada: string }[];

      revalidatePath(`/proyek/${lama.project_id}`);
      return NextResponse.json({ ok: true, diubahPada: baru.diubah_pada, diaudit: catat.length });
    }

    if (isi.aksi === "hapus") {
      const { scenarioId } = isi;
      if (!scenarioId || !UUID.test(scenarioId)) {
        return NextResponse.json({ pesan: "scenarioId tidak sah" }, { status: 400 });
      }

      const [ada] = (await klienMentah.unsafe(
        `SELECT id FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`, [scenarioId, isi.projectId],
      )) as unknown as { id: string }[];
      if (!ada) return NextResponse.json({ pesan: "Skenario tidak ditemukan di proyek ini." }, { status: 404 });

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

      await klienMentah.unsafe(`DELETE FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`, [scenarioId, isi.projectId]);
      revalidatePath(`/proyek/${isi.projectId}`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ pesan: `Aksi tidak dikenal: ${isi.aksi}` }, { status: 400 });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    console.error("[skenario]", isi.aksi, pesan);
    return NextResponse.json({ pesan: "Gagal menyimpan", rincian: pesan }, { status: 500 });
  }
}
