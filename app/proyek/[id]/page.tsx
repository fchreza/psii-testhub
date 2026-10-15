import Link from "next/link";
import { notFound } from "next/navigation";
import { klienMentah } from "@/db";
import { Nav } from "@/components/nav";
import { wajibMasuk, bolehAksesProyek, bolehKelolaProyek, bolehUbahEksekusi } from "@/lib/gerbang";
import { tanggalID } from "@/lib/waktu";
import { TabelSkenario, type Skenario, type Modul, type Orang } from "@/components/tabel-skenario";
import { KelolaAksesProyek } from "@/components/kelola-akses-proyek";
import { UbahTahapProyek } from "@/components/ubah-tahap-proyek";
import { EditorMetadataProyek } from "@/components/editor-metadata-proyek";

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

  const [p] = (await klienMentah.unsafe(`
    SELECT p.*, u.nama AS pm_nama FROM th_projects p
    LEFT JOIN th_users u ON u.id = p.pm_id
    WHERE p.id = $1`, [id],
  )) as unknown as (Record<string, unknown> & {
    id: string; nama: string; pm_nama: string | null; tahap: string; fase?: string;
  })[];

  if (!p) notFound();

  /*
   * KENAPA DI SINI, BUKAN DI MIDDLEWARE:
   * Middleware tidak bisa membaca database, jadi ia tidak tahu siapa anggota
   * proyek mana. Pemeriksaan yang menentukan harus di tempat yang punya
   * koneksi — dan harus mengembalikan 404, bukan 403, supaya keberadaan
   * proyek yang bukan miliknya tidak ikut terbocor.
   */
  if (!(await bolehAksesProyek(saya, id))) notFound();

  const kelolaProyek = bolehKelolaProyek(saya.peran);
  const bolehUbah = bolehUbahEksekusi(saya.peran);

  const fase = faseDiminta === "UAT" ? "UAT" : "SIT";

  const modul = (await klienMentah.unsafe(
    `SELECT id, kode, nama, urutan FROM th_modules WHERE project_id = $1 ORDER BY urutan, kode`,
    [id],
  )) as unknown as Modul[];

  const orang = (await (kelolaProyek
    ? klienMentah.unsafe(`SELECT id, nama, peran FROM th_users
                         WHERE aktif = true AND peran IN ('INTERNAL_KEMENKEU','EKSTERNAL_KEMENKEU')
                         ORDER BY nama`)
    : klienMentah.unsafe(
      `SELECT DISTINCT u.id, u.nama, u.peran FROM th_users u
       WHERE u.aktif = true AND (
         u.id IN (SELECT user_id FROM th_project_members WHERE project_id = $1)
         OR u.id IN (SELECT penguji_id FROM th_scenarios WHERE project_id = $1 AND penguji_id IS NOT NULL)
       ) ORDER BY u.nama`, [id],
    ))) as unknown as Orang[];

  const calon = kelolaProyek ? (await klienMentah.unsafe(
    `SELECT id, nama, email, peran FROM th_users
     WHERE aktif = true AND peran IN ('INTERNAL_KEMENKEU','EKSTERNAL_KEMENKEU')
     ORDER BY nama`,
  )) as unknown as { id: string; nama: string; email: string; peran: string }[] : [];
  const anggota = kelolaProyek ? (await klienMentah.unsafe(
    `SELECT u.id, u.nama, u.email, u.peran, m.ditambahkan_pada
     FROM th_project_members m JOIN th_users u ON u.id = m.user_id
     WHERE m.project_id = $1 ORDER BY u.nama`, [id],
  )) as unknown as { id: string; nama: string; email: string; peran: string; ditambahkan_pada: string }[] : [];

  const skenario = (await klienMentah.unsafe(`
    SELECT s.id, s.kode, s.fase, s.judul, s.langkah_pengujian, s.hasil_diharapkan, s.hasil_aktual,
           s.status, s.catatan_tindak_lanjut, s.siap_retest, s.module_id, s.urutan,
           s.penguji_id, u.nama AS penguji_nama,
           (SELECT count(*) FROM th_evidence e WHERE e.scenario_id = s.id)::int AS jumlah_bukti,
           s.diubah_pada, s.xmin::text AS versi
    FROM th_scenarios s
    LEFT JOIN th_users u ON u.id = s.penguji_id
    WHERE s.project_id = $1 AND s.fase = $2
    ORDER BY s.urutan, s.kode
  `, [id, fase])) as unknown as Skenario[];

  const hitung = {
    total: skenario.length,
    lulus: skenario.filter((s) => s.status === "PASS").length,
    gagal: skenario.filter((s) => s.status === "FAIL").length,
    tertunda: skenario.filter((s) => s.status === "BLOCKED").length,
    belum: skenario.filter((s) => s.status === "PENDING").length,
  };
  // Tingkat kelulusan: pembagi SEMUA skenario (keputusan pemilik produk).
  const persen = hitung.total > 0 ? Math.round((hitung.lulus / hitung.total) * 100) : 0;

  return (
    <>
      <Nav aktif="proyek" peran={saya.peran} />
      <main className="mx-auto max-w-[1500px] px-6 py-8">
        <p className="mb-3 text-[13px] text-tinta-3">
          <Link href="/proyek" className="hover:text-aksi">Proyek</Link> / {p.id}
        </p>

        <header className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-tinta">{p.nama}</h1>
              <p className="mt-1 text-[14px] text-tinta-2">
                {[p.modul_aplikasi, p.unit_bisnis].filter(Boolean).join(" · ") || "—"}
                {p.pm_nama ? ` · PM: ${p.pm_nama}` : ""}
              </p>
            </div>
            {kelolaProyek ? <div className="flex flex-wrap items-center gap-2">
              <UbahTahapProyek projectId={id} tahap={p.tahap} />
              <EditorMetadataProyek projectId={id} nilai={{
                nama: p.nama,
                modulAplikasi: p.modul_aplikasi as string | null,
                unitBisnis: p.unit_bisnis as string | null,
                ruangLingkup: p.ruang_lingkup as string | null,
                sumberAcuan: p.sumber_acuan as string | null,
                dasarRegulasi: p.dasar_regulasi as string | null,
                lingkungan: p.lingkungan as string,
                alamatServer: p.alamat_server as string | null,
                tahunAnggaran: p.tahun_anggaran as number | null,
                tanggalMulai: p.tanggal_mulai as string | Date | null,
                targetSelesai: p.target_selesai as string | Date | null,
                versiDokumen: p.versi_dokumen as string | null,
                disusunOleh: p.disusun_oleh as string | null,
                statusDokumen: p.status_dokumen as string | null,
              }} />
            </div> : (
              <span className="rounded bg-kanvas px-2.5 py-1 text-[13px] font-medium text-tinta-2">
                {LABEL_TAHAP[p.tahap] ?? p.tahap}
              </span>
            )}
          </div>
        </header>

        {/* Metadata dari halaman Cover berkas contoh. Ditampilkan karena
            Dasar Regulasi dan Lingkungan menentukan arti hasil ujinya. */}
        <dl className="mb-5 grid gap-x-6 gap-y-2 rounded-lg border border-garis bg-kartu px-5 py-4 text-[13.5px] sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["Dasar regulasi", p.dasar_regulasi],
            ["Lingkungan uji", p.lingkungan],
            ["Sumber acuan", p.sumber_acuan],
            ["Ruang lingkup", p.ruang_lingkup],
            ["Alamat server", p.alamat_server],
            ["Tahun anggaran", p.tahun_anggaran],
            ["Versi dokumen", p.versi_dokumen],
            ["Disusun oleh", p.disusun_oleh],
            ["Status dokumen", p.status_dokumen],
            ["Periode", p.tanggal_mulai
              ? `${tanggalID(p.tanggal_mulai as string | Date)} – ${tanggalID(p.target_selesai as string | Date | null)}`
              : null],
          ] as [string, unknown][]).map(([label, nilai]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-[104px] shrink-0 text-tinta-3">{label}</dt>
              <dd className="min-w-0 flex-1 break-words text-tinta-2">
                {nilai === null || nilai === undefined || nilai === "" ? "—" : String(nilai)}
              </dd>
            </div>
          ))}
        </dl>

        {kelolaProyek && (
          <KelolaAksesProyek projectId={id} calon={calon} anggotaAwal={anggota} />
        )}

        {/* Ringkasan angka. Ini yang paling sering ditanya pimpinan, jadi
            diletakkan sebelum tabel, bukan setelahnya. */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-6">
          {[
            ["Total", hitung.total, "text-tinta"],
            ["Lulus", hitung.lulus, "text-lulus"],
            ["Gagal", hitung.gagal, "text-gagal"],
            ["Tertunda", hitung.tertunda, "text-tertunda"],
            ["Belum diuji", hitung.belum, "text-tinta-3"],
            ["Kelulusan", `${persen}%`, "text-tinta"],
          ].map(([label, nilai, warna]) => (
            <div key={String(label)} className="rounded-lg border border-garis bg-kartu px-3.5 py-3">
              <p className="text-[12px] font-medium uppercase tracking-wide text-tinta-3">{label}</p>
              <p className={`tabular mt-0.5 text-[22px] font-bold leading-none ${warna}`}>{nilai}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-garis pb-3">
          {["SIT","UAT"].map((f) => {
            const jumlah = f === fase ? skenario.length : null;
            return (
              <Link key={f} href={`/proyek/${id}?fase=${f}`}
                aria-current={f === fase ? "page" : undefined}
                className={f === fase
                  ? "rounded-md bg-aksi px-3 py-2 text-[13.5px] font-medium text-white"
                  : "rounded-md px-3 py-2 text-[13.5px] text-tinta-2 hover:bg-kartu"}>
                Tahap {f}
                {jumlah !== null && <span className="ml-1.5 tabular opacity-80">{jumlah}</span>}
              </Link>
            );
          })}
        </div>

        <TabelSkenario
          key={`${id}:${fase}`}
          projectId={id}
          fase={fase}
          skenarioAwal={skenario}
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
