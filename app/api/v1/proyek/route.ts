import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { klienMentah } from "@/db";
import { bolehKelolaProyek, wajibMasukApi } from "@/lib/gerbang";
import { faseUntukProyek } from "@/lib/fase-proyek";

export const dynamic = "force-dynamic";
const LINGKUNGAN_SAH = ["DEV", "SIT", "UAT", "PROD"];
const TAHAP_SAH = ["PERSIAPAN", "SIT", "UAT", "WAITING_SIGNOFF", "SELESAI"];

function tanggalInput(nilai: unknown, label: string): { nilai: string | null; pesan?: string } {
  if (nilai === undefined || nilai === null || nilai === "") return { nilai: null };
  if (typeof nilai !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(nilai)) {
    return { nilai: null, pesan: `Tanggal ${label} tidak sah.` };
  }
  const tanggal = new Date(`${nilai}T00:00:00.000Z`);
  if (Number.isNaN(tanggal.getTime()) || tanggal.toISOString().slice(0, 10) !== nilai) {
    return { nilai: null, pesan: `Tanggal ${label} tidak sah.` };
  }
  return { nilai };
}

export async function POST(req: Request) {
  const auth = await wajibMasukApi();
  if ("tolak" in auth) return auth.tolak;
  const saya = auth.pengguna;
  if (!bolehKelolaProyek(saya.peran)) {
    return NextResponse.json({ pesan: "Hanya Admin atau Internal PSII yang dapat mengelola proyek." }, { status: 403 });
  }

  const isi = await req.json().catch(() => null) as
    { aksi?: string; nama?: string; aplikasi?: string; modul?: string; jenisPengujian?: string;
      modulAplikasi?: string; unitBisnis?: string;
      ruangLingkup?: string; sumberAcuan?: string; dasarRegulasi?: string;
      lingkungan?: string; alamatServer?: string; alamatPengujian?: string; tahunAnggaran?: number;
      tanggalMulai?: string | null; targetSelesai?: string | null; projectId?: string; tahap?: string;
      versiDokumen?: string; disusunOleh?: string; statusDokumen?: string } | null;
  if (!isi?.aksi) return NextResponse.json({ pesan: "Aksi wajib diisi." }, { status: 400 });

  try {
    if (isi.aksi === "tambah") {
      if (isi.nama !== undefined && typeof isi.nama !== "string") {
        return NextResponse.json({ pesan: "Nama proyek harus berupa teks." }, { status: 400 });
      }
      for (const [kunci, label] of [["aplikasi", "Aplikasi"], ["modul", "Modul"], ["ruangLingkup", "Ruang lingkup"], ["dasarRegulasi", "Dasar regulasi"], ["alamatPengujian", "Alamat pengujian"]] as const) {
        const nilai = isi[kunci];
        if (nilai !== undefined && nilai !== null && typeof nilai !== "string") {
          return NextResponse.json({ pesan: `${label} harus berupa teks.` }, { status: 400 });
        }
      }
      const nama = (isi.nama ?? "").trim().slice(0, 200);
      if (!nama) return NextResponse.json({ pesan: "Nama proyek wajib diisi." }, { status: 400 });
      const jenisPengujian = isi.jenisPengujian;
      if (jenisPengujian !== "SIT" && jenisPengujian !== "UAT") {
        return NextResponse.json({ pesan: "Pilih satu jenis pengujian: SIT atau UAT." }, { status: 400 });
      }
      const tahunAnggaran = isi.tahunAnggaran ?? null;
      if (tahunAnggaran !== null && (!Number.isInteger(tahunAnggaran) || tahunAnggaran < 1900 || tahunAnggaran > 2200)) {
        return NextResponse.json({ pesan: "Tahun anggaran harus berupa tahun yang sah (1900–2200)." }, { status: 400 });
      }
      const mulai = tanggalInput(isi.tanggalMulai, "mulai");
      const selesai = tanggalInput(isi.targetSelesai, "target selesai");
      if (mulai.pesan) return NextResponse.json({ pesan: mulai.pesan }, { status: 400 });
      if (selesai.pesan) return NextResponse.json({ pesan: selesai.pesan }, { status: 400 });
      if (mulai.nilai && selesai.nilai && selesai.nilai < mulai.nilai) {
        return NextResponse.json({ pesan: "Target selesai tidak boleh sebelum tanggal mulai." }, { status: 400 });
      }

      const id = await klienMentah.begin(async (tx) => {
        await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext('psii-testhub-project-number'))`);
        const [nomor] = (await tx.unsafe(
          `SELECT COALESCE(MAX(NULLIF(regexp_replace(id, '\\D', '', 'g'), '')::int), 0) AS n FROM th_projects`,
        )) as unknown as { n: number }[];
        const projectId = `PRJ-${String(nomor.n + 1).padStart(3, "0")}`;
        await tx.unsafe(
          `INSERT INTO th_projects
             (id, nama, aplikasi, modul, jenis_pengujian, modul_aplikasi, pm_id,
              ruang_lingkup, dasar_regulasi, alamat_server, tahun_anggaran,
              tanggal_mulai, target_selesai, versi_dokumen, disusun_oleh, status_dokumen)
           VALUES ($1,$2,$3,$4,$5,$3,$6::uuid,$7,$8,$9,$10,$11::date,$12::date,'1.0','Draft','Draft')`,
          [projectId, nama,
            (isi.aplikasi ?? "").trim().slice(0, 160) || null,
            (isi.modul ?? "").trim().slice(0, 160) || null,
            jenisPengujian,
            saya.id,
            (isi.ruangLingkup ?? "").trim().slice(0, 10000) || null,
            (isi.dasarRegulasi ?? "").trim().slice(0, 200) || null,
            (isi.alamatPengujian ?? "").trim().slice(0, 300) || null,
            tahunAnggaran,
            mulai.nilai,
            selesai.nilai],
        );
        return projectId;
      });
      revalidatePath("/proyek");
      revalidatePath("/dashboard");
      return NextResponse.json({ id });
    }

    if (isi.aksi === "ubah_metadata") {
      const projectId = isi.projectId ?? "";
      if (!/^PRJ-\d{3,}$/.test(projectId)) return NextResponse.json({ pesan: "ID proyek tidak sah." }, { status: 400 });

      const perubahan: { kolom: string; nilai: string | number | null }[] = [];
      const teks: { kunci: "nama" | "aplikasi" | "modul" | "modulAplikasi" | "unitBisnis" | "ruangLingkup" | "sumberAcuan" | "dasarRegulasi" | "alamatServer" | "versiDokumen" | "disusunOleh" | "statusDokumen"; kolom: string; batas: number; wajib?: boolean }[] = [
        { kunci: "nama", kolom: "nama", batas: 200, wajib: true },
        { kunci: "aplikasi", kolom: "aplikasi", batas: 160 },
        { kunci: "modul", kolom: "modul", batas: 160 },
        { kunci: "modulAplikasi", kolom: "modul_aplikasi", batas: 160 },
        { kunci: "unitBisnis", kolom: "unit_bisnis", batas: 160 },
        { kunci: "ruangLingkup", kolom: "ruang_lingkup", batas: 10000 },
        { kunci: "sumberAcuan", kolom: "sumber_acuan", batas: 200 },
        { kunci: "dasarRegulasi", kolom: "dasar_regulasi", batas: 200 },
        { kunci: "alamatServer", kolom: "alamat_server", batas: 300 },
        { kunci: "versiDokumen", kolom: "versi_dokumen", batas: 40 },
        { kunci: "disusunOleh", kolom: "disusun_oleh", batas: 160 },
        { kunci: "statusDokumen", kolom: "status_dokumen", batas: 60 },
      ];
      for (const field of teks) {
        const raw = isi[field.kunci];
        if (raw === undefined) continue;
        if (typeof raw !== "string") return NextResponse.json({ pesan: `Nilai ${field.kunci} tidak sah.` }, { status: 400 });
        const nilai = raw.trim().slice(0, field.batas);
        if (field.wajib && !nilai) return NextResponse.json({ pesan: "Nama proyek wajib diisi." }, { status: 400 });
        perubahan.push({ kolom: field.kolom, nilai: nilai || null });
      }
      if (isi.lingkungan !== undefined) {
        if (!LINGKUNGAN_SAH.includes(isi.lingkungan)) return NextResponse.json({ pesan: "Lingkungan uji tidak sah." }, { status: 400 });
        perubahan.push({ kolom: "lingkungan", nilai: isi.lingkungan });
      }
      if (isi.tahunAnggaran !== undefined) {
        const tahun = isi.tahunAnggaran;
        if (tahun !== null && (!Number.isInteger(tahun) || tahun < 1900 || tahun > 2200)) {
          return NextResponse.json({ pesan: "Tahun anggaran harus berupa tahun yang sah (1900–2200)." }, { status: 400 });
        }
        perubahan.push({ kolom: "tahun_anggaran", nilai: tahun });
      }
      for (const [kunci, kolom] of [["tanggalMulai", "tanggal_mulai"], ["targetSelesai", "target_selesai"]] as const) {
        const raw = isi[kunci];
        if (raw === undefined) continue;
        if (raw !== null && raw !== "") {
          const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null;
          if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
            return NextResponse.json({ pesan: `Tanggal ${kunci} tidak sah.` }, { status: 400 });
          }
          perubahan.push({ kolom, nilai: raw });
        } else perubahan.push({ kolom, nilai: null });
      }
      if (!perubahan.length) return NextResponse.json({ pesan: "Tidak ada metadata yang dikirim." }, { status: 400 });

      const hasil = await klienMentah.begin(async (tx) => {
        const [lama] = (await tx.unsafe(
          `SELECT nama, aplikasi, modul, modul_aplikasi, unit_bisnis, ruang_lingkup, sumber_acuan, dasar_regulasi,
                  lingkungan, alamat_server, tahun_anggaran, tanggal_mulai, target_selesai,
                  versi_dokumen, disusun_oleh, status_dokumen
           FROM th_projects WHERE id = $1 FOR UPDATE`, [projectId],
        )) as unknown as Record<string, string | number | Date | null>[];
        if (!lama) return { error: "Proyek tidak ditemukan." };

        const ambilTanggal = (kolom: string) => {
          const baru = perubahan.find((x) => x.kolom === kolom);
          return baru ? baru.nilai : lama[kolom];
        };
        const mulai = ambilTanggal("tanggal_mulai");
        const selesai = ambilTanggal("target_selesai");
        const dateOnly = (v: string | number | Date | null | undefined) => v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10);
        const tanggalMulai = dateOnly(mulai);
        const targetSelesai = dateOnly(selesai);
        if (tanggalMulai && targetSelesai && targetSelesai < tanggalMulai) {
          return { error: "Target selesai tidak boleh sebelum tanggal mulai." };
        }

        const efektif = perubahan.filter((x) => {
          const sebelumnya = ["tanggal_mulai", "target_selesai"].includes(x.kolom)
            ? dateOnly(lama[x.kolom]) : lama[x.kolom];
          const berikutnya = ["tanggal_mulai", "target_selesai"].includes(x.kolom)
            ? dateOnly(x.nilai) : x.nilai;
          return String(sebelumnya ?? "") !== String(berikutnya ?? "");
        });
        if (!efektif.length) return { error: null, changed: 0 };
        const parameter: (string | number | null)[] = [projectId];
        const setSql = efektif.map((x) => { parameter.push(x.nilai); return `${x.kolom} = $${parameter.length}`; });
        await tx.unsafe(`UPDATE th_projects SET ${setSql.join(", ")} WHERE id = $1`, parameter);
        for (const item of efektif) {
          await tx.unsafe(
            `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_lama, nilai_baru)
             VALUES ($1::uuid, $2, 'ubah_metadata', $3, $4, $5)`,
            [saya.id, projectId, item.kolom, lama[item.kolom] == null ? null : String(lama[item.kolom]), item.nilai == null ? null : String(item.nilai)],
          );
        }
        return { error: null, changed: efektif.length };
      });
      if (hasil.error) return NextResponse.json({ pesan: hasil.error }, { status: hasil.error === "Proyek tidak ditemukan." ? 404 : 400 });
      revalidatePath(`/proyek/${projectId}`); revalidatePath("/proyek"); revalidatePath("/dashboard");
      return NextResponse.json({ ok: true, berubah: hasil.changed });
    }

    if (isi.aksi === "ubah_tahap") {
      const projectId = isi.projectId ?? "";
      if (!/^PRJ-\d{3,}$/.test(projectId)) return NextResponse.json({ pesan: "ID proyek tidak sah." }, { status: 400 });
      if (!isi.tahap || !TAHAP_SAH.includes(isi.tahap)) return NextResponse.json({ pesan: "Tahap proyek tidak sah." }, { status: 400 });
      const [lama] = (await klienMentah.unsafe(`SELECT tahap, jenis_pengujian FROM th_projects WHERE id = $1`, [projectId])) as unknown as { tahap: string; jenis_pengujian: string }[];
      if (!lama) return NextResponse.json({ pesan: "Proyek tidak ditemukan." }, { status: 404 });
      if ((isi.tahap === "SIT" || isi.tahap === "UAT") && !faseUntukProyek(lama.jenis_pengujian).includes(isi.tahap)) {
        return NextResponse.json({ pesan: `Tahap ${isi.tahap} tidak tersedia untuk proyek ${lama.jenis_pengujian}.` }, { status: 400 });
      }
      const [hasil] = (await klienMentah.unsafe(
        `UPDATE th_projects SET tahap = $1 WHERE id = $2 RETURNING id`, [isi.tahap, projectId],
      )) as unknown as { id: string }[];
      if (!hasil) return NextResponse.json({ pesan: "Proyek tidak ditemukan." }, { status: 404 });
      if (lama.tahap !== isi.tahap) {
        await klienMentah.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, aksi, kolom, nilai_lama, nilai_baru)
           VALUES ($1::uuid, $2, 'ubah_tahap', 'tahap', $3, $4)`,
          [saya.id, projectId, lama.tahap, isi.tahap],
        );
      }
      revalidatePath(`/proyek/${projectId}`);
      revalidatePath("/proyek");
      revalidatePath("/dashboard");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ pesan: "Aksi tidak dikenal." }, { status: 400 });
  } catch (e) {
    console.error("[proyek]", isi.aksi, e instanceof Error ? e.message : e);
    return NextResponse.json({ pesan: "Gagal menyimpan proyek." }, { status: 500 });
  }
}
