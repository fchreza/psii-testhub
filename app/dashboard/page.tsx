import Link from "next/link";
import { redirect } from "next/navigation";
import { klienMentah } from "@/db";
import { Nav } from "@/components/nav";
import { wajibMasuk, internal, PERAN_PENGUJI } from "@/lib/gerbang";
import { STATUS_UJI, labelStatus, cn } from "@/lib/format";
import { KemajuanProyekDashboard } from "@/components/kemajuan-proyek-dashboard";
import { kelompokkanModulPerProyek, type ModulDashboard, type ProyekDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

type Tertunda = {
  project_id: string; proyek: string; scenario_id: string; kode: string;
  judul: string; status: string; catatan_tindak_lanjut: string | null;
  penguji_nama: string | null; diubah_pada: string;
};

/**
 * Dashboard pimpinan.
 *
 * KENAPA BILAH + ANGKA, BUKAN PIE/DONUT:
 * Pie gagal syarat aksesibilitas (irisan hanya dibedakan warna, dan buta warna
 * merah-hijau adalah yang paling umum). Selain itu pertanyaan pimpinan selalu
 * "berapa" dan "mana yang tersendat" — dua hal yang dijawab angka dan panjang
 * bilah, bukan luas irisan.
 *
 * KENAPA TABEL PROYEK TETAP ADA, padahal sudah ada bilah:
 * Bilahnya menunjukkan perbandingan sekilas; tabelnya memberi nilai tepat dan
 * bisa dibaca pembaca layar. Grafik tanpa alternatif teks menutup akses bagi
 * sebagian orang — dan di instansi pemerintah itu bukan pilihan.
 */
export default async function HalamanDashboard() {
  const saya = await wajibMasuk();
  if (PERAN_PENGUJI.includes(saya.peran)) redirect("/proyek");
  const lihatSemua = internal(saya.peran);

  /*
   * Satu klausa WHERE dipakai untuk SEMUA angka di halaman ini.
   *
   * KENAPA: kalau setiap angka mengambil datanya sendiri, ada risiko satu
   * bagian memakai penyaring dan bagian lain tidak — dan dashboard yang
   * angkanya tidak saling cocok lebih buruk daripada tidak ada dashboard.
   */
  const saringProyek = lihatSemua
    ? "true"
    : `p.id IN (SELECT project_id FROM th_project_members WHERE user_id = '${saya.id}'::uuid)`;

  const proyekQuery = klienMentah.unsafe(`
    SELECT p.id, p.nama, p.unit_bisnis, p.tahap, p.aplikasi, p.modul,
           p.jenis_pengujian, p.modul_aplikasi, p.target_selesai,
           count(s.id)::int AS total,
           count(s.id) FILTER (WHERE s.status = 'PASS')::int    AS lulus,
           count(s.id) FILTER (WHERE s.status = 'FAIL')::int    AS gagal,
           count(s.id) FILTER (WHERE s.status = 'BLOCKED')::int AS tertunda,
           count(s.id) FILTER (WHERE s.status = 'PENDING')::int AS belum
    FROM th_projects p
    LEFT JOIN th_scenarios s ON s.project_id = p.id
    WHERE ${saringProyek}
    GROUP BY p.id
    ORDER BY p.target_selesai NULLS LAST, p.nama
  `);

  const perModulQuery = klienMentah.unsafe(`
    SELECT p.id AS project_id, p.nama AS proyek, m.kode, m.nama,
           count(s.id)::int AS total,
           count(s.id) FILTER (WHERE s.status = 'PASS')::int    AS lulus,
           count(s.id) FILTER (WHERE s.status = 'FAIL')::int    AS gagal,
           count(s.id) FILTER (WHERE s.status = 'BLOCKED')::int AS tertunda,
           count(s.id) FILTER (WHERE s.status = 'PENDING')::int AS belum
    FROM th_modules m
    JOIN th_projects p ON p.id = m.project_id
    LEFT JOIN th_scenarios s ON s.module_id = m.id AND s.project_id = p.id
    WHERE ${saringProyek}
    GROUP BY p.id, p.nama, m.kode, m.nama, m.urutan
    HAVING count(s.id) > 0
    ORDER BY p.nama, m.urutan, m.kode
  `);

  const perluTindakQuery = klienMentah.unsafe(`
    SELECT p.id AS project_id, p.nama AS proyek, s.id AS scenario_id, s.kode,
           s.judul, s.status, s.catatan_tindak_lanjut, u.nama AS penguji_nama,
           s.diubah_pada
    FROM th_scenarios s
    JOIN th_projects p ON p.id = s.project_id
    LEFT JOIN th_users u ON u.id = s.penguji_id
    WHERE s.status IN ('FAIL','BLOCKED') AND ${saringProyek}
    ORDER BY CASE s.status WHEN 'FAIL' THEN 0 ELSE 1 END, s.diubah_pada
    LIMIT 50
  `);

  const [proyekRows, modulRows, tindakRows] = await Promise.all([
    proyekQuery, perModulQuery, perluTindakQuery,
  ]);
  const proyek = proyekRows as unknown as ProyekDashboard[];
  const perModul = modulRows as unknown as ModulDashboard[];
  const modulPerProyek = kelompokkanModulPerProyek(perModul);
  const perluTindak = tindakRows as unknown as Tertunda[];

  const jumlah = proyek.reduce(
    (a, p) => ({
      total: a.total + p.total, lulus: a.lulus + p.lulus,
      gagal: a.gagal + p.gagal, tertunda: a.tertunda + p.tertunda, belum: a.belum + p.belum,
    }),
    { total: 0, lulus: 0, gagal: 0, tertunda: 0, belum: 0 },
  );
  const persenTotal = jumlah.total > 0 ? Math.round((jumlah.lulus / jumlah.total) * 100) : 0;

  return (
    <>
      <Nav aktif="dashboard" peran={saya.peran} />
      <main id="konten-utama" tabIndex={-1} className="mx-auto max-w-[1200px] px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-tinta">Dashboard pengujian</h1>
          <p className="mt-1 text-[14px] text-tinta-2">
            {lihatSemua
              ? `Ringkasan ${proyek.length} proyek di seluruh subdit`
              : `${proyek.length} proyek yang Anda menjadi anggotanya`}
          </p>
        </header>

        {proyek.length === 0 ? (
          <div className="rounded-lg border border-garis bg-kartu px-6 py-12 text-center">
            <p className="text-[15px] font-medium text-tinta">Belum ada data untuk ditampilkan</p>
            <p className="mx-auto mt-1 max-w-md text-[14px] leading-relaxed text-tinta-2">
              Angka akan muncul setelah ada proyek dengan skenario.
            </p>
          </div>
        ) : (
          <>
            {/* Angka pokok. Ini yang paling sering ditanya, jadi paling atas. */}
            <section aria-label="Ringkasan keseluruhan" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([
                ["Total skenario", jumlah.total, "text-tinta", "seluruh tahap"],
                ["Lulus", jumlah.lulus, "text-lulus", `${persenTotal}% dari total`],
                ["Gagal", jumlah.gagal, "text-gagal", "butuh perbaikan"],
                ["Tertunda", jumlah.tertunda, "text-tertunda", "terhalang"],
                ["Belum diuji", jumlah.belum, "text-tinta-3", "belum dijalankan"],
              ] as [string, number, string, string][]).map(([label, nilai, warna, ket]) => (
                <div key={label} className="rounded-lg border border-garis bg-kartu px-4 py-3.5">
                  <p className="text-[12px] font-medium uppercase tracking-wide text-tinta-3">{label}</p>
                  <p className={cn("tabular mt-1 text-[26px] font-bold leading-none", warna)}>{nilai}</p>
                  <p className="mt-1 text-[12px] text-tinta-3">{ket}</p>
                </div>
              ))}
            </section>

            <KemajuanProyekDashboard proyek={proyek} modulPerProyek={modulPerProyek} />

            {/* Daftar yang perlu tindak lanjut — bagian yang paling sering
                ditindaklanjuti, jadi dibuat bisa langsung diklik. */}
            <section aria-label="Perlu tindak lanjut">
              <h2 className="mb-2 text-[15px] font-semibold text-tinta">
                Perlu tindak lanjut
                {perluTindak.length > 0 && (
                  <span className="tabular ml-2 text-[13px] font-normal text-tinta-3">
                    {perluTindak.length} skenario
                  </span>
                )}
              </h2>
              {perluTindak.length === 0 ? (
                <p className="rounded-lg border border-garis bg-kartu px-5 py-6 text-center text-[14px] text-tinta-2">
                  Tidak ada skenario Gagal atau Tertunda
                </p>
              ) : (
                <ul className="divide-y divide-garis overflow-hidden rounded-lg border border-garis bg-kartu">
                  {perluTindak.map((s) => {
                    const st = STATUS_UJI[s.status as keyof typeof STATUS_UJI] ?? STATUS_UJI.PENDING;
                    return (
                      <li key={s.scenario_id}>
                        <Link href={`/proyek/${s.project_id}`}
                          className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 hover:bg-kanvas">
                          <span className="tabular shrink-0 text-[12.5px] text-tinta-3">{s.kode}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-medium text-tinta">{s.judul}</span>
                            <span className="block text-[12.5px] text-tinta-3">
                              {s.proyek}
                              {s.penguji_nama ? ` · ${s.penguji_nama}` : ""}
                              {s.catatan_tindak_lanjut ? ` · ${s.catatan_tindak_lanjut.slice(0, 70)}` : " · belum ada catatan"}
                            </span>
                          </span>
                          <span className={cn("shrink-0 rounded-sm px-2 py-0.5 text-[12.5px] font-medium", st.kelas)}>
                            {labelStatus(s.status)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
