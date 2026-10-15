import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { klienMentah } from "@/db";
import { bolehKelolaProyek, wajibMasukApi } from "@/lib/gerbang";

export const dynamic = "force-dynamic";
const LINGKUNGAN_SAH = ["DEV", "SIT", "UAT", "PROD"];
const TAHAP_SAH = ["PERSIAPAN", "SIT", "UAT", "WAITING_SIGNOFF", "SELESAI"];

export async function POST(req: Request) {
  const auth = await wajibMasukApi();
  if ("tolak" in auth) return auth.tolak;
  const saya = auth.pengguna;
  if (!bolehKelolaProyek(saya.peran)) {
    return NextResponse.json({ pesan: "Hanya Admin atau Internal PSII yang dapat mengelola proyek." }, { status: 403 });
  }

  const isi = await req.json().catch(() => null) as
    { aksi?: string; nama?: string; modulAplikasi?: string; unitBisnis?: string;
      ruangLingkup?: string; sumberAcuan?: string; dasarRegulasi?: string;
      lingkungan?: string; alamatServer?: string; tahunAnggaran?: number;
      tanggalMulai?: string | null; targetSelesai?: string | null; projectId?: string; tahap?: string;
      versiDokumen?: string; disusunOleh?: string; statusDokumen?: string } | null;
  if (!isi?.aksi) return NextResponse.json({ pesan: "Aksi wajib diisi." }, { status: 400 });

  try {
    if (isi.aksi === "tambah") {
      const nama = (isi.nama ?? "").trim().slice(0, 200);
      if (!nama) return NextResponse.json({ pesan: "Nama proyek wajib diisi." }, { status: 400 });
      const lingkungan = isi.lingkungan ?? "DEV";
      if (!LINGKUNGAN_SAH.includes(lingkungan)) return NextResponse.json({ pesan: "Lingkungan uji tidak sah." }, { status: 400 });

      const id = await klienMentah.begin(async (tx) => {
        await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext('psii-testhub-project-number'))`);
        const [nomor] = (await tx.unsafe(
          `SELECT COALESCE(MAX(NULLIF(regexp_replace(id, '\\D', '', 'g'), '')::int), 0) AS n FROM th_projects`,
        )) as unknown as { n: number }[];
        const projectId = `PRJ-${String(nomor.n + 1).padStart(3, "0")}`;
        await tx.unsafe(
          `INSERT INTO th_projects
             (id, nama, modul_aplikasi, unit_bisnis, pm_id, ruang_lingkup, sumber_acuan,
              dasar_regulasi, lingkungan, alamat_server, tahun_anggaran,
              tanggal_mulai, target_selesai, versi_dokumen, disusun_oleh, status_dokumen)
           VALUES ($1,$2,$3,$4,$5::uuid,$6,$7,$8,$9,$10,$11,$12::date,$13::date,'1.0','Draft','Draft')`,
          [projectId, nama,
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
      const teks: { kunci: "nama" | "modulAplikasi" | "unitBisnis" | "ruangLingkup" | "sumberAcuan" | "dasarRegulasi" | "alamatServer" | "versiDokumen" | "disusunOleh" | "statusDokumen"; kolom: string; batas: number; wajib?: boolean }[] = [
        { kunci: "nama", kolom: "nama", batas: 200, wajib: true },
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
          `SELECT nama, modul_aplikasi, unit_bisnis, ruang_lingkup, sumber_acuan, dasar_regulasi,
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
      const [lama] = (await klienMentah.unsafe(`SELECT tahap FROM th_projects WHERE id = $1`, [projectId])) as unknown as { tahap: string }[];
      if (!lama) return NextResponse.json({ pesan: "Proyek tidak ditemukan." }, { status: 404 });
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
