import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { klienMentah } from "@/db";
import { Nav } from "@/components/nav";
import { wajibMasuk, bolehAksesProyek, bolehKelolaProyek, bolehUbahEksekusi } from "@/lib/gerbang";
import { tanggalID } from "@/lib/waktu";
import type { Skenario, Modul, Orang } from "@/components/tabel-skenario";
import { AreaSkenarioProyek } from "@/components/area-skenario-proyek";
import { KelolaAksesProyek } from "@/components/kelola-akses-proyek";
import { UbahTahapProyek } from "@/components/ubah-tahap-proyek";
import { EditorMetadataProyek } from "@/components/editor-metadata-proyek";
import { TombolHapusProyek } from "@/components/tombol-hapus-proyek";
import { faseUntukProyek, labelJenisPengujian, type FasePengujian } from "@/lib/fase-proyek";

export const dynamic = "force-dynamic";

const LABEL_TAHAP: Record<string, string> = {
  PERSIAPAN: "Persiapan", SIT: "Sedang SIT", UAT: "Sedang UAT",
  WAITING_SIGNOFF: "Menunggu tanda tangan", SELESAI: "Selesai",
};

export default async function HalamanProyek({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fase?: string }>;
}) {
  const saya = await wajibMasuk();
  const { id } = await params;
  const { fase: faseDiminta } = await searchParams;

  const [rowsProyek, bolehAkses] = await Promise.all([
    klienMentah.unsafe(`
      SELECT p.*, u.nama AS pm_nama FROM th_projects p
      LEFT JOIN th_users u ON u.id = p.pm_id
      WHERE p.id = $1`, [id],
    ),
    bolehAksesProyek(saya, id),
  ]);
  const [p] = rowsProyek as unknown as (Record<string, unknown> & {
    id: string; nama: string; pm_nama: string | null; tahap: string;
    aplikasi: string | null; modul: string | null; jenis_pengujian: string;
  })[];

  /*
   * Pemeriksaan tetap server-side dan data proyek tidak digunakan sebelum izin
   * lolos. Query proyek dan membership berjalan paralel agar tidak menambah RTT.
   */
  if (!p || !bolehAkses) notFound();

  const kelolaProyek = bolehKelolaProyek(saya.peran);
  const bolehUbah = bolehUbahEksekusi(saya.peran);

  const jenisPengujian = p.jenis_pengujian;
  const faseTersedia = faseUntukProyek(jenisPengujian);
  const faseDimintaSah = faseTersedia.includes(faseDiminta as FasePengujian);
  const fase = faseDimintaSah ? faseDiminta as FasePengujian : faseTersedia[0];
  if (faseDiminta && !faseDimintaSah) redirect(`/proyek/${id}?fase=${fase}`);

  const modulQuery = klienMentah.unsafe(
    `SELECT id, kode, nama, urutan FROM th_modules WHERE project_id = $1 ORDER BY urutan, kode`,
    [id],
  );

  const orangQuery = kelolaProyek
    ? klienMentah.unsafe(`SELECT id, nama, peran FROM th_users
                         WHERE aktif = true AND peran IN ('INTERNAL_KEMENKEU','EKSTERNAL_KEMENKEU')
                         ORDER BY nama`)
    : klienMentah.unsafe(
      `SELECT DISTINCT u.id, u.nama, u.peran FROM th_users u
       WHERE u.aktif = true AND (
         u.id IN (SELECT user_id FROM th_project_members WHERE project_id = $1)
         OR u.id IN (SELECT penguji_id FROM th_scenarios WHERE project_id = $1 AND penguji_id IS NOT NULL)
       ) ORDER BY u.nama`, [id],
    );

  const calonQuery = kelolaProyek ? klienMentah.unsafe(
    `SELECT id, nama, email, peran FROM th_users
     WHERE aktif = true AND peran IN ('INTERNAL_KEMENKEU','EKSTERNAL_KEMENKEU')
     ORDER BY nama`,
  ) : Promise.resolve([]);
  const anggotaQuery = kelolaProyek ? klienMentah.unsafe(
    `SELECT u.id, u.nama, u.email, u.peran, m.ditambahkan_pada
     FROM th_project_members m JOIN th_users u ON u.id = m.user_id
     WHERE m.project_id = $1 ORDER BY u.nama`, [id],
  ) : Promise.resolve([]);
  const picQuery = kelolaProyek
    ? klienMentah.unsafe(`SELECT id::text AS id, nama FROM th_users WHERE aktif = true ORDER BY nama`)
    : Promise.resolve([]);

  const skenarioQuery = klienMentah.unsafe(`
    SELECT s.id, s.kode, s.fase, s.judul, s.langkah_pengujian, s.hasil_diharapkan, s.hasil_aktual,
           s.status, s.catatan_tindak_lanjut, s.siap_retest, s.module_id, s.urutan,
           s.penguji_id, u.nama AS penguji_nama,
           COALESCE(e.jumlah, 0)::int AS jumlah_bukti,
           s.diubah_pada, s.xmin::text AS versi
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
    ORDER BY s.urutan, s.kode
  `, [id, fase]);

  // Jalankan data pendukung secara paralel setelah otorisasi lolos; sebelumnya
  // lima round trip database berurutan menahan halaman meski query independen.
  const [modulRows, orangRows, calonRows, anggotaRows, picRows, skenarioRows] = await Promise.all([
    modulQuery, orangQuery, calonQuery, anggotaQuery, picQuery, skenarioQuery,
  ]);
  const modul = modulRows as unknown as Modul[];
  const orang = orangRows as unknown as Orang[];
  const calon = calonRows as unknown as { id: string; nama: string; email: string; peran: string }[];
  const anggota = anggotaRows as unknown as { id: string; nama: string; email: string; peran: string; ditambahkan_pada: string }[];
  const pic = picRows as unknown as { id: string; nama: string }[];
  const skenario = skenarioRows as unknown as Skenario[];

  const hitung = {
    total: skenario.length,
    lulus: skenario.filter((s) => s.status === "PASS").length,
    gagal: skenario.filter((s) => s.status === "FAIL").length,
    tertunda: skenario.filter((s) => s.status === "BLOCKED").length,
    belum: skenario.filter((s) => s.status === "PENDING").length,
  };
  return (
    <>
      <Nav aktif="proyek" peran={saya.peran} />
      <main id="konten-utama" tabIndex={-1} className="mx-auto max-w-[1500px] px-6 py-8">
        <p className="mb-3 text-[13px] text-tinta-3">
          <Link href="/proyek" className="hover:text-aksi">Proyek</Link> / {p.id}
        </p>

        <header className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-tinta">{p.nama}</h1>
            </div>
            {kelolaProyek ? <div className="flex flex-wrap items-center gap-2">
              <UbahTahapProyek projectId={id} tahap={p.tahap} jenisPengujian={jenisPengujian} />
              <EditorMetadataProyek projectId={id} nilai={{
                nama: p.nama,
                aplikasi: (p.aplikasi ?? p.modul_aplikasi) as string | null,
                modul: p.modul as string | null,
                jenisPengujian,
                ruangLingkup: p.ruang_lingkup as string | null,
                dasarRegulasi: p.dasar_regulasi as string | null,
                alamatPengujian: p.alamat_server as string | null,
                tahunAnggaran: p.tahun_anggaran as number | null,
                tanggalMulai: p.tanggal_mulai as string | Date | null,
                targetSelesai: p.target_selesai as string | Date | null,
                pmId: p.pm_id as string | null,
              }} pic={pic} />
              {saya.peran === "ADMIN" && <TombolHapusProyek projectId={id} nama={p.nama} />}
            </div> : (
              <span className="rounded bg-kanvas px-2.5 py-1 text-[13px] font-medium text-tinta-2">
                {LABEL_TAHAP[p.tahap] ?? p.tahap}
              </span>
            )}
          </div>
        </header>

        <section aria-labelledby="informasi-proyek" className="mb-5 overflow-hidden rounded-xl border border-garis bg-kartu shadow-sm shadow-tinta/[0.03]">
          <div className="border-b border-garis px-4 py-3 sm:px-5">
            <h2 id="informasi-proyek" className="text-[14px] font-semibold text-tinta">Informasi proyek</h2>
          </div>
          <dl className="grid gap-px bg-garis sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["Aplikasi", p.aplikasi ?? p.modul_aplikasi],
              ["Modul", p.modul],
              ["Jenis pengujian", labelJenisPengujian(jenisPengujian)],
              ["Ruang lingkup", p.ruang_lingkup],
              ["Dasar regulasi", p.dasar_regulasi],
              ["Alamat pengujian", p.alamat_server],
              ["Tahun anggaran", p.tahun_anggaran],
              ["Tanggal mulai", p.tanggal_mulai ? tanggalID(p.tanggal_mulai as string | Date) : null],
              ["Target selesai", p.target_selesai ? tanggalID(p.target_selesai as string | Date) : null],
              ["PIC", p.pm_nama],
            ] as [string, unknown][]).map(([label, nilai]) => (
              <div key={label} className="min-w-0 bg-kartu px-4 py-3.5 sm:px-5">
                <dt className="text-[12px] font-medium text-tinta-3">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-tinta">
                  {nilai === null || nilai === undefined || nilai === "" ? <span className="text-tinta-3">—</span> : String(nilai)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {kelolaProyek && (
          <KelolaAksesProyek projectId={id} calon={calon} anggotaAwal={anggota} faseTersedia={faseTersedia} />
        )}

        <AreaSkenarioProyek
          key={`${id}:${fase}`}
          projectId={id}
          fase={fase}
          faseTersedia={faseTersedia}
          skenarioAwal={skenario}
          statistikAwal={hitung}
          modul={modul}
          orang={orang}
          sayaId={saya.id}
          bolehUbah={bolehUbah}
          bolehKelolaSkenario={kelolaProyek}
        />
      </main>
    </>
  );
}
