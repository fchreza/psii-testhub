import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { klienMentah } from "@/db";
import {
  wajibMasukApi, bolehAksesProyek, bolehKelolaSkenario, bolehUbahEksekusi,
  bolehUbahKolomSkenario, bolehLewatiGuardHapusSkenario,
} from "@/lib/gerbang";
import { faseUntukProyek, type FasePengujian } from "@/lib/fase-proyek";
import { perluAlasanHapusBuktiTerakhir, versiMasihAktual } from "@/lib/validasi-bukti";
import { sebabBlokirHapusSkenario, sebabTundaHapusAdmin, pathKunciHapusSkenario } from "@/lib/keamanan-hapus-skenario";
import { finalisasiIntentUpload } from "@/lib/bukti-operasi";
import { hapusObjek } from "@/lib/simpanan";

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
      diubahPada?: string; versi?: string; siapRetest?: boolean; urutan?: number; alasan?: string } | null;

  if (!isi?.aksi) return NextResponse.json({ pesan: "aksi wajib" }, { status: 400 });
  if (!isi.projectId || !/^PRJ-\d{3,}$/.test(isi.projectId)) {
    return NextResponse.json({ pesan: "projectId wajib dan harus sah." }, { status: 400 });
  }
  const projectId = isi.projectId;
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
  if (isi.aksi === "ubah") {
    const kolomIsi = [
      ["judul", "judul"], ["status", "status"], ["langkahPengujian", "langkahPengujian"],
      ["hasilDiharapkan", "hasilDiharapkan"], ["hasilAktual", "hasilAktual"],
      ["catatanTindakLanjut", "catatanTindakLanjut"], ["pengujiId", "pengujiId"],
      ["moduleId", "moduleId"], ["siapRetest", "siapRetest"],
    ] as const;
    const tidakDiizinkan = kolomIsi.some(([field, kolom]) =>
      isi[field] !== undefined && !bolehUbahKolomSkenario(saya.peran, kolom));
    if (tidakDiizinkan) {
      return NextResponse.json({ pesan: "Akun penguji hanya dapat mengubah hasil aktual, status, dan catatan tindak lanjut." }, { status: 403 });
    }
  }

  try {
    if (isi.aksi === "tambah") {
      const { projectId, fase = "SIT" } = isi;
      if (!projectId) return NextResponse.json({ pesan: "projectId wajib" }, { status: 400 });
      if (!["SIT","UAT"].includes(fase)) {
        return NextResponse.json({ pesan: `Fase tidak sah: ${fase}` }, { status: 400 });
      }
      const [proyek] = (await klienMentah.unsafe(
        `SELECT jenis_pengujian FROM th_projects WHERE id = $1`, [projectId],
      )) as unknown as { jenis_pengujian: string }[];
      if (!proyek) return NextResponse.json({ pesan: "Proyek tidak ditemukan." }, { status: 404 });
      if (!faseUntukProyek(proyek.jenis_pengujian).includes(fase as FasePengujian)) {
        return NextResponse.json({ pesan: `Proyek ini hanya memiliki fase ${faseUntukProyek(proyek.jenis_pengujian).join(" dan ")}.` }, { status: 400 });
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
      const [baru] = (await klienMentah.begin(async (tx) => {
        // Mencegah dua penambahan serentak menghasilkan kode dan urutan yang sama.
        await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`,
          [`psii-testhub-scenario:${projectId}:${fase}:${awalan}`]);
        const [urut] = (await tx.unsafe(
          `SELECT COALESCE(MAX(NULLIF(regexp_replace(kode, '^.*-', ''), '')::int), 0) AS n
           FROM th_scenarios WHERE project_id = $1 AND fase = $2 AND kode LIKE $3`,
          [projectId, fase, `${awalan}-%`],
        )) as unknown as { n: number }[];
        const kode = `${awalan}-${String(urut.n + 1).padStart(2, "0")}`;
        const [pos] = (await tx.unsafe(
          `SELECT COALESCE(MAX(urutan), -1) + 1 AS n FROM th_scenarios WHERE project_id = $1 AND fase = $2`,
          [projectId, fase],
        )) as unknown as { n: number }[];
        const baru = await tx.unsafe(
          `INSERT INTO th_scenarios
             (project_id, module_id, kode, fase, judul, langkah_pengujian, hasil_diharapkan,
              penguji_id, status, catatan_tindak_lanjut, urutan)
           VALUES ($1,$2::uuid,$3,$4,$5,$6,$7,$8::uuid,'PENDING',$9,$10)
           RETURNING id, kode, xmin::text AS versi, diubah_pada`,
          [projectId, isi.moduleId ?? null, kode, fase, judul,
           isi.langkahPengujian ?? null, isi.hasilDiharapkan ?? null,
           pengujiId, isi.catatanTindakLanjut ?? null, pos.n],
        );
        await tx.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_baru)
           VALUES ($1::uuid, $2, $3::uuid, 'tambah_skenario', 'judul', $4)`,
          [saya.id, projectId, baru[0].id, judul],
        );
        return baru;
      })) as unknown as { id: string; kode: string; versi: string; diubah_pada: string }[];

      revalidatePath(`/proyek/${projectId}`);
      return NextResponse.json({ id: baru.id, kode: baru.kode, versi: baru.versi, diubahPada: baru.diubah_pada });
    }

    if (isi.aksi === "ubah") {
      const { scenarioId } = isi;
      if (!scenarioId || !UUID.test(scenarioId)) {
        return NextResponse.json({ pesan: "scenarioId tidak sah" }, { status: 400 });
      }

      const [lama] = (await klienMentah.unsafe(
        `SELECT s.id, s.project_id, s.kode, s.fase, s.judul, s.langkah_pengujian, s.hasil_diharapkan, s.hasil_aktual,
                s.penguji_id, u.nama AS penguji_nama, s.module_id, s.siap_retest, s.status,
                s.catatan_tindak_lanjut, s.urutan, s.diubah_pada, s.xmin::text AS versi
         FROM th_scenarios s LEFT JOIN th_users u ON u.id = s.penguji_id
         WHERE s.id = $1::uuid AND s.project_id = $2`, [scenarioId, isi.projectId],
      )) as unknown as {
        id: string; project_id: string; kode: string; fase: string; judul: string; langkah_pengujian: string | null;
        hasil_diharapkan: string | null; hasil_aktual: string | null;
        penguji_id: string | null; penguji_nama: string | null; module_id: string | null; siap_retest: boolean; status: string;
        catatan_tindak_lanjut: string | null; urutan: number; diubah_pada: string; versi: string;
      }[];
      if (!lama) return NextResponse.json({ pesan: "Skenario tidak ditemukan" }, { status: 404 });

      const kolomKhususPengelola = ["pengujiId", "moduleId", "siapRetest"] as const;
      if (kolomKhususPengelola.some((kolom) => isi[kolom] !== undefined
        && !bolehUbahKolomSkenario(saya.peran, kolom))) {
        return NextResponse.json({ pesan: "Hanya Admin atau Internal PSII yang dapat mengubah penugasan penguji, lembar modul, atau status siap retest." }, { status: 403 });
      }

      /*
       * Kunci optimistik.
       *
       * KENAPA: dua penguji dapat membuka skenario yang sama. Tanpa
       * pemeriksaan ini, yang menyimpan belakangan menimpa perubahan yang
       * pertama — tanpa peringatan, dan tanpa jejak.
       *
       * Versi berasal dari `xmin` PostgreSQL dan diperiksa lagi pada UPDATE,
       * sehingga dua penyimpanan serentak tidak dapat saling menimpa.
       */
      if (!isi.versi || typeof isi.versi !== "string") {
        return NextResponse.json({ pesan: "Versi data skenario wajib disertakan." }, { status: 400 });
      }
      const versi = isi.versi;
      if (!versiMasihAktual(isi.versi, lama.versi)) {
        return NextResponse.json({
          pesan: "Data sudah berubah. Periksa nilai terbaru, lalu simpan draf Anda kembali jika memang ingin menggantinya.",
          konflik: true, terbaru: lama,
        }, { status: 409 });
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
      if (isi.judul !== undefined && (typeof isi.judul !== "string" || isi.judul.length > 200)) {
        return NextResponse.json({ pesan: "Judul harus berupa teks maksimal 200 karakter." }, { status: 400 });
      }
      for (const [kunci, label] of [["langkahPengujian", "Langkah pengujian"], ["hasilDiharapkan", "Hasil yang diharapkan"], ["hasilAktual", "Hasil aktual"], ["catatanTindakLanjut", "Catatan tindak lanjut"]] as const) {
        const nilai = isi[kunci];
        if (nilai !== undefined && nilai !== null && (typeof nilai !== "string" || nilai.length > 20000)) {
          return NextResponse.json({ pesan: `${label} harus berupa teks maksimal 20.000 karakter.` }, { status: 400 });
        }
      }
      if (isi.siapRetest !== undefined && typeof isi.siapRetest !== "boolean") {
        return NextResponse.json({ pesan: "Status kesiapan retest tidak sah." }, { status: 400 });
      }

      const statusBaru = isi.status ?? lama.status;
      if (statusBaru === "FAIL" || statusBaru === "BLOCKED") {
        const catatan = (isi.catatanTindakLanjut ?? lama.catatan_tindak_lanjut ?? "").trim();
        const [adaBukti] = (await klienMentah.unsafe(
          `SELECT count(*)::int AS n FROM th_evidence WHERE scenario_id = $1::uuid AND status = 'READY'`, [scenarioId],
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
      if (isi.catatanTindakLanjut !== undefined) pasang("catatan_tindak_lanjut", isi.catatanTindakLanjut, lama.catatan_tindak_lanjut);
      if (isi.langkahPengujian !== undefined) pasang("langkah_pengujian", isi.langkahPengujian, lama.langkah_pengujian);
      if (isi.hasilDiharapkan !== undefined) pasang("hasil_diharapkan", isi.hasilDiharapkan, lama.hasil_diharapkan);
      if (isi.hasilAktual !== undefined) pasang("hasil_aktual", isi.hasilAktual, lama.hasil_aktual);
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

      if (kolom.length === 0) {
        return NextResponse.json({ ok: true, tanpaPerubahan: true, versi: lama.versi, diubahPada: lama.diubah_pada });
      }

      const [baru] = (await klienMentah.begin(async (tx) => {
        const [updated] = (await tx.unsafe(
          `UPDATE th_scenarios SET ${kolom.join(", ")}
           WHERE id = $1::uuid AND project_id = $2 AND xmin::text = $${kolom.length + 3}
             AND NOT EXISTS (
               SELECT 1 FROM th_evidence e WHERE e.scenario_id = th_scenarios.id
                 AND e.path = $${kolom.length + 4} AND e.status = 'DELETE_PENDING'
             )
           RETURNING xmin::text AS versi, diubah_pada`,
          [scenarioId, projectId, ...nilai, versi, pathKunciHapusSkenario(scenarioId)],
        )) as unknown as { versi: string; diubah_pada: string }[];
        if (!updated) return [];

        // Simpan perubahan dan jejak audit dalam satu transaksi.
        for (const c of catat) {
          await tx.unsafe(
            `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_lama, nilai_baru)
             VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7)`,
            [saya.id, lama.project_id, scenarioId,
             c.kolom === "status" ? "ubah_status" : "ubah_skenario",
             c.kolom, c.lama, c.baru],
          );
        }
        return [updated];
      })) as unknown as { versi: string; diubah_pada: string }[];

      if (!baru) {
        const [penghapusan] = (await klienMentah.unsafe(
          `SELECT 1 AS ada FROM th_evidence WHERE scenario_id = $1::uuid AND path = $2 AND status = 'DELETE_PENDING' LIMIT 1`,
          [scenarioId, pathKunciHapusSkenario(scenarioId)],
        )) as unknown as { ada: number }[];
        if (penghapusan) {
          return NextResponse.json({ pesan: "Skenario sedang dibersihkan Admin; perubahan sementara ditutup.", konflik: true }, { status: 409 });
        }
        const [terbaru] = (await klienMentah.unsafe(
          `SELECT s.id, s.project_id, s.kode, s.fase, s.judul, s.langkah_pengujian, s.hasil_diharapkan, s.hasil_aktual,
                  s.penguji_id, u.nama AS penguji_nama, s.module_id, s.siap_retest, s.status,
                  s.catatan_tindak_lanjut, s.urutan, s.diubah_pada, s.xmin::text AS versi
           FROM th_scenarios s LEFT JOIN th_users u ON u.id = s.penguji_id
           WHERE s.id = $1::uuid AND s.project_id = $2`, [scenarioId, isi.projectId],
        )) as unknown as { id: string; versi: string; diubah_pada: string; [k: string]: unknown }[];
        return NextResponse.json({
          pesan: "Data sudah berubah. Periksa nilai terbaru, lalu simpan draf Anda kembali jika memang ingin menggantinya.",
          konflik: true, terbaru,
        }, { status: 409 });
      }

      revalidatePath(`/proyek/${lama.project_id}`);
      return NextResponse.json({ ok: true, versi: baru.versi, diubahPada: baru.diubah_pada, diaudit: catat.length });
    }

    if (isi.aksi === "hapus") {
      const { scenarioId } = isi;
      if (!scenarioId || !UUID.test(scenarioId)) {
        return NextResponse.json({ pesan: "scenarioId tidak sah" }, { status: 400 });
      }
      if (!isi.versi || typeof isi.versi !== "string") {
        return NextResponse.json({ pesan: "Versi data skenario wajib disertakan sebelum penghapusan." }, { status: 400 });
      }
      if (isi.alasan !== undefined && (typeof isi.alasan !== "string" || isi.alasan.length > 1000)) {
        return NextResponse.json({ pesan: "Alasan penghapusan maksimal 1.000 karakter." }, { status: 400 });
      }
      const alasan = typeof isi.alasan === "string" ? isi.alasan.trim() : "";
      const [target] = (await klienMentah.unsafe(
        `SELECT id, xmin::text AS versi FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`,
        [scenarioId, projectId],
      )) as unknown as { id: string; versi: string }[];
      if (!target) return NextResponse.json({ pesan: "Skenario tidak ditemukan di proyek ini." }, { status: 404 });
      if (!versiMasihAktual(isi.versi, target.versi)) {
        return NextResponse.json({ pesan: "Skenario berubah sejak dibuka. Muat ulang lalu pastikan lagi sebelum menghapus.", konflik: true }, { status: 409 });
      }

      // Rekonsiliasi intent yang URL-nya sudah pasti kedaluwarsa. Jika objek
      // ternyata sudah terunggah, ia dicatat lebih dulu agar ikut dibersihkan.
      if (bolehLewatiGuardHapusSkenario(saya.peran)) {
        const kedaluwarsa = (await klienMentah.unsafe(
          `SELECT id FROM th_evidence_uploads
           WHERE scenario_id = $1::uuid AND status = 'UPLOADING'
             AND expires_at <= now() - interval '30 seconds'
           ORDER BY expires_at, id`, [scenarioId],
        )) as unknown as { id: string }[];
        for (const intent of kedaluwarsa) await finalisasiIntentUpload(intent.id);
      }

      const pathKunci = pathKunciHapusSkenario(scenarioId);
      const hasilPersiapan = await klienMentah.begin(async (tx) => {
        const [ada] = (await tx.unsafe(
          `SELECT id, kode, judul, status, catatan_tindak_lanjut, xmin::text AS versi FROM th_scenarios
           WHERE id = $1::uuid AND project_id = $2 FOR UPDATE`,
          [scenarioId, projectId],
        )) as unknown as { id: string; kode: string; judul: string; status: string; catatan_tindak_lanjut: string | null; versi: string }[];
        if (!ada) return { status: "missing" as const };
        if (!versiMasihAktual(isi.versi, ada.versi)) return { status: "conflict" as const };

        const bukti = (await tx.unsafe(
          `SELECT id, path, nama_asli, status FROM th_evidence
           WHERE scenario_id = $1::uuid ORDER BY diunggah_pada, id FOR UPDATE`, [scenarioId],
        )) as unknown as { id: string; path: string; nama_asli: string | null; status: string }[];
        const unggahan = (await tx.unsafe(
          `SELECT id, staging_path, final_path, status, expires_at FROM th_evidence_uploads
           WHERE scenario_id = $1::uuid ORDER BY dibuat_pada, id FOR UPDATE`, [scenarioId],
        )) as unknown as {
          id: string; staging_path: string; final_path: string; status: string; expires_at: Date | string;
        }[];
        const buktiPengguna = bukti.filter((item) => item.path !== pathKunci);
        const markerAda = bukti.some((item) => item.path === pathKunci && item.status === "DELETE_PENDING");

        if (!bolehLewatiGuardHapusSkenario(saya.peran)) {
          if (markerAda) return { status: "admin_cleanup_pending" as const };
          const sebab = sebabBlokirHapusSkenario(buktiPengguna.length, unggahan.length);
          if (sebab) return {
            status: "blocked" as const, sebab,
            jumlahBukti: buktiPengguna.length, jumlahUnggahan: unggahan.length,
          };

          await tx.unsafe(
            `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_lama, nilai_baru)
             VALUES ($1::uuid, $2, $3::uuid, 'hapus_skenario', 'judul', $4, $5)`,
            [saya.id, projectId, scenarioId, `${ada.kode} — ${ada.judul}`, alasan || null],
          );
          await tx.unsafe(`DELETE FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`, [scenarioId, projectId]);
          return { status: "deleted" as const };
        }

        const sebabTunda = sebabTundaHapusAdmin(unggahan.map(({ status, expires_at }) => ({ status, expiresAt: expires_at })));
        if (sebabTunda) {
          const urlAktif = unggahan
            .filter((item) => new Date(item.expires_at).getTime() > Date.now() - 30_000)
            .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())[0];
          return {
            status: "upload_pending" as const,
            sebab: sebabTunda,
            sampai: urlAktif ? new Date(urlAktif.expires_at).toISOString() : null,
          };
        }

        const adaBuktiAktif = buktiPengguna.some((item) => item.status === "READY" || item.status === "DELETE_PENDING");
        if (adaBuktiAktif && perluAlasanHapusBuktiTerakhir(ada.status, ada.catatan_tindak_lanjut, alasan)) {
          return { status: "reason" as const };
        }

        let versiPersiapan = ada.versi;
        if (adaBuktiAktif && alasan && !ada.catatan_tindak_lanjut?.trim()
          && (ada.status === "FAIL" || ada.status === "BLOCKED")) {
          const [catatan] = (await tx.unsafe(
            `UPDATE th_scenarios SET catatan_tindak_lanjut = $2
             WHERE id = $1::uuid RETURNING xmin::text AS versi`, [scenarioId, alasan],
          )) as unknown as { versi: string }[];
          versiPersiapan = catatan.versi;
          await tx.unsafe(
            `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_baru)
             VALUES ($1::uuid, $2, $3::uuid, 'ubah_catatan', 'catatan_tindak_lanjut', $4)`,
            [saya.id, projectId, scenarioId, alasan],
          );
        }

        for (const item of buktiPengguna.filter((b) => b.status === "READY")) {
          await tx.unsafe(`UPDATE th_evidence SET status = 'DELETE_PENDING' WHERE id = $1::uuid AND status = 'READY'`, [item.id]);
          await tx.unsafe(
            `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_lama, nilai_baru)
             VALUES ($1::uuid, $2, $3::uuid, 'hapus_bukti', 'bukti', $4, $5)`,
            [saya.id, projectId, scenarioId, item.nama_asli ?? item.path,
             alasan || `Dihapus bersama skenario ${ada.kode} oleh Admin.`],
          );
        }

        if (!markerAda) {
          await tx.unsafe(
            `INSERT INTO th_evidence (scenario_id, path, nama_asli, tipe, ukuran, diunggah_oleh, status)
             VALUES ($1::uuid, $2, '__psii_internal__', 'application/x-psii-internal', 0, $3::uuid, 'DELETE_PENDING')`,
            [scenarioId, pathKunci, saya.id],
          );
          const [terkunci] = (await tx.unsafe(
            `UPDATE th_scenarios SET diubah_pada = now() WHERE id = $1::uuid AND project_id = $2
             RETURNING xmin::text AS versi`, [scenarioId, projectId],
          )) as unknown as { versi: string }[];
          versiPersiapan = terkunci.versi;
          await tx.unsafe(
            `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_lama, nilai_baru)
             VALUES ($1::uuid, $2, $3::uuid, 'hapus_skenario', 'penghapusan', $4, 'Pembersihan Admin dimulai.')`,
            [saya.id, projectId, scenarioId, `${ada.kode} — ${ada.judul}`],
          );
        }

        const objek = [...new Set([
          ...buktiPengguna.map((item) => item.path),
          ...unggahan.flatMap((item) => [item.staging_path, item.final_path]),
        ])];
        return {
          status: "prepared" as const,
          versi: versiPersiapan,
          kode: ada.kode,
          judul: ada.judul,
          objek,
          unggahan: unggahan.map((item) => ({ id: item.id, staging_path: item.staging_path, final_path: item.final_path })),
        };
      });
      if (hasilPersiapan.status === "missing") {
        return NextResponse.json({ pesan: "Skenario tidak ditemukan di proyek ini." }, { status: 404 });
      }
      if (hasilPersiapan.status === "conflict") {
        return NextResponse.json({ pesan: "Skenario berubah sejak dibuka. Muat ulang lalu pastikan lagi sebelum menghapus.", konflik: true }, { status: 409 });
      }
      if (hasilPersiapan.status === "admin_cleanup_pending") {
        return NextResponse.json({ pesan: "Skenario sedang dibersihkan Admin; Internal PSII tidak dapat menghapusnya saat ini." }, { status: 409 });
      }
      if (hasilPersiapan.status === "blocked") {
        const pesan = hasilPersiapan.sebab === "bukti"
          ? `Skenario memiliki ${hasilPersiapan.jumlahBukti} rekam bukti. Internal PSII tidak dapat menghapusnya; minta Admin jika skenario harus dihapus.`
          : `Skenario memiliki ${hasilPersiapan.jumlahUnggahan} riwayat unggahan. Internal PSII tidak dapat menghapusnya; minta Admin jika skenario harus dihapus.`;
        return NextResponse.json({ pesan }, { status: 400 });
      }
      if (hasilPersiapan.status === "reason") {
        return NextResponse.json({ pesan: "Bukti pada skenario Gagal/Tertunda tidak dapat dihapus tanpa alasan atau catatan tindak lanjut." }, { status: 400 });
      }
      if (hasilPersiapan.status === "upload_pending") {
        const pesan = hasilPersiapan.sebab === "unggahan"
          ? "Skenario memiliki unggahan yang masih diproses. Tunggu unggahan selesai atau berakhir, lalu coba lagi."
          : `URL unggah masih dapat menulis ke storage. Coba lagi setelah ${hasilPersiapan.sampai ? new Date(hasilPersiapan.sampai).toLocaleString("id-ID") : "masa URL berakhir"}.`;
        return NextResponse.json({ pesan }, { status: 409 });
      }
      if (hasilPersiapan.status === "deleted") {
        revalidatePath(`/proyek/${projectId}`);
        return NextResponse.json({ ok: true, auditDisimpan: true });
      }

      const berhasil = new Set<string>();
      const gagal = new Set<string>();
      for (const path of hasilPersiapan.objek) {
        try {
          await hapusObjek(path);
          berhasil.add(path);
        } catch (error) {
          gagal.add(path);
          console.error("[skenario] cleanup objek bukti tertunda", { scenarioId, path, error });
        }
      }

      if (gagal.size) {
        await klienMentah.begin(async (tx) => {
          for (const path of berhasil) {
            await tx.unsafe(
              `UPDATE th_evidence SET status = 'DELETED', deleted_at = COALESCE(deleted_at, now())
               WHERE scenario_id = $1::uuid AND path = $2 AND status <> 'DELETED'`, [scenarioId, path],
            );
          }
          for (const item of hasilPersiapan.unggahan) {
            if ([item.staging_path, item.final_path].some((path) => gagal.has(path))) {
              await tx.unsafe(
                `UPDATE th_evidence_uploads SET last_error = $2, diubah_pada = now() WHERE id = $1::uuid`,
                [item.id, "Admin menghapus skenario; cleanup objek storage perlu dicoba ulang."],
              );
            }
          }
        });
        revalidatePath(`/proyek/${projectId}`);
        return NextResponse.json({
          pesan: `Skenario belum dihapus karena ${gagal.size} objek bukti/unggahan belum berhasil dibersihkan. Audit dan tombstone tersimpan; coba lagi saat storage tersedia.`,
          pending: true, versi: hasilPersiapan.versi,
        }, { status: 503 });
      }

      const selesai = await klienMentah.begin(async (tx) => {
        const [ada] = (await tx.unsafe(
          `SELECT id, kode, judul, xmin::text AS versi FROM th_scenarios
           WHERE id = $1::uuid AND project_id = $2 FOR UPDATE`, [scenarioId, projectId],
        )) as unknown as { id: string; kode: string; judul: string; versi: string }[];
        if (!ada) return { status: "missing" as const };
        if (!versiMasihAktual(hasilPersiapan.versi, ada.versi)) return { status: "conflict" as const };
        const [marker] = (await tx.unsafe(
          `SELECT id FROM th_evidence WHERE scenario_id = $1::uuid AND path = $2 AND status = 'DELETE_PENDING' FOR UPDATE`,
          [scenarioId, pathKunci],
        )) as unknown as { id: string }[];
        if (!marker) return { status: "marker_missing" as const };
        await tx.unsafe(
          `UPDATE th_evidence SET status = 'DELETED', deleted_at = COALESCE(deleted_at, now())
           WHERE scenario_id = $1::uuid AND path <> $2 AND status <> 'DELETED'`, [scenarioId, pathKunci],
        );
        await tx.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_lama, nilai_baru)
           VALUES ($1::uuid, $2, $3::uuid, 'hapus_skenario', 'judul', $4, $5)`,
          [saya.id, projectId, scenarioId, `${ada.kode} — ${ada.judul}`, alasan || "Penghapusan Admin selesai."],
        );
        await tx.unsafe(`DELETE FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`, [scenarioId, projectId]);
        return { status: "deleted" as const };
      });
      if (selesai.status === "conflict") {
        return NextResponse.json({ pesan: "Skenario berubah selama pembersihan. Data bukti sudah ditombstone; muat ulang lalu minta Admin mencoba kembali.", konflik: true }, { status: 409 });
      }
      if (selesai.status === "marker_missing") {
        return NextResponse.json({ pesan: "Marker penghapusan tidak ditemukan. Skenario tidak dihapus; muat ulang dan coba lagi.", konflik: true }, { status: 409 });
      }
      revalidatePath(`/proyek/${projectId}`);
      return NextResponse.json({ ok: true, auditDisimpan: true });
    }

    return NextResponse.json({ pesan: `Aksi tidak dikenal: ${isi.aksi}` }, { status: 400 });
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    console.error("[skenario]", isi.aksi, pesan);
    return NextResponse.json({ pesan: "Gagal menyimpan. Periksa koneksi dan coba lagi." }, { status: 500 });
  }
}
