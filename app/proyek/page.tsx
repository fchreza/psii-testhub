import { klienMentah } from "@/db";
import { Nav } from "@/components/nav";
import { wajibMasuk, internal, bolehKelolaProyek } from "@/lib/gerbang";
import { TombolProyekBaru } from "@/components/tombol-proyek-baru";
import { DaftarProyek, type BarisProyek } from "@/components/daftar-proyek";

export const dynamic = "force-dynamic";

/**
 * Daftar proyek.
 *
 * KENAPA PENGGUNA EKSTERNAL DAPAT DAFTAR YANG BERBEDA:
 * Pengguna eksternal (kantor vertikal, pihak luar Kemenkeu) hanya melihat
 * proyek yang ia menjadi anggotanya — bukan seluruh portofolio subdit. Aturan
 * itu dipasang di klausa WHERE, bukan disaring setelah data diambil, supaya
 * data proyek lain tidak pernah terkirim ke peramban mereka.
 */
export default async function HalamanProyek() {
  const saya = await wajibMasuk();
  const lihatSemua = internal(saya.peran);
  const dapatMengelola = bolehKelolaProyek(saya.peran);

  const daftarQuery = klienMentah.unsafe(`
    WITH proyek_terlihat AS (
      SELECT p.id, p.nama, p.aplikasi, p.modul, p.modul_aplikasi, p.jenis_pengujian,
             p.tahap, p.lingkungan, p.tanggal_mulai, p.target_selesai, p.pm_id, p.dibuat_pada
      FROM th_projects p
      WHERE ${lihatSemua ? "true" : `p.id IN (SELECT project_id FROM th_project_members WHERE user_id = '${saya.id}'::uuid)`}
    ), statistik AS (
      SELECT s.project_id, count(*)::int AS total,
             count(*) FILTER (WHERE s.status = 'PASS')::int AS lulus,
             count(*) FILTER (WHERE s.status = 'FAIL')::int AS gagal,
             count(*) FILTER (WHERE s.status = 'BLOCKED')::int AS tertunda,
             count(*) FILTER (WHERE s.status = 'PENDING')::int AS belum
      FROM th_scenarios s
      JOIN proyek_terlihat p ON p.id = s.project_id
      GROUP BY s.project_id
    )
    SELECT p.id, p.nama, p.aplikasi, p.modul, p.modul_aplikasi, p.jenis_pengujian,
           p.tahap, p.lingkungan, p.tanggal_mulai, p.target_selesai,
           u.nama AS pm_nama,
           COALESCE(s.total, 0)::int AS total,
           COALESCE(s.lulus, 0)::int AS lulus,
           COALESCE(s.gagal, 0)::int AS gagal,
           COALESCE(s.tertunda, 0)::int AS tertunda,
           COALESCE(s.belum, 0)::int AS belum
    FROM proyek_terlihat p
    LEFT JOIN th_users u ON u.id = p.pm_id
    LEFT JOIN statistik s ON s.project_id = p.id
    ORDER BY p.dibuat_pada DESC
  `);
  const calonQuery = dapatMengelola
    ? klienMentah.unsafe(`SELECT id::text AS id, nama FROM th_users WHERE aktif = true ORDER BY nama`)
    : Promise.resolve([]);
  const [daftarRows, calonRows] = await Promise.all([daftarQuery, calonQuery]);
  const daftar = daftarRows as unknown as BarisProyek[];
  const calonPIC = calonRows as unknown as { id: string; nama: string }[];

  return (
    <>
      <Nav aktif="proyek" peran={saya.peran} />
      <main id="konten-utama" tabIndex={-1} className="mx-auto max-w-[1200px] px-6 py-8 2xl:max-w-[1800px]">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-tinta">Proyek pengujian</h1>
            <p className="mt-1 text-[14px] text-tinta-2">
              {lihatSemua
                ? `${daftar.length} proyek di seluruh subdit`
                : `${daftar.length} proyek yang Anda menjadi anggotanya`}
            </p>
          </div>
          {dapatMengelola && <TombolProyekBaru pic={calonPIC} />}
        </header>

        <DaftarProyek daftar={daftar} lihatSemua={lihatSemua} dapatMengelola={dapatMengelola} peran={saya.peran} />
      </main>
    </>
  );
}
