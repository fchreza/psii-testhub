import { redirect } from "next/navigation";
import { klienMentah } from "@/db";
import { Nav } from "@/components/nav";
import { wajibMasuk, internal, PERAN_PENGUJI } from "@/lib/gerbang";
import { DashboardInteraktif } from "@/components/dashboard-interaktif";
import { kelompokkanModulPerProyek, type ModulDashboard, type ProyekDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

type Tertunda = {
  project_id: string;
  proyek: string;
  scenario_id: string;
  kode: string;
  judul: string;
  status: string;
  catatan_tindak_lanjut: string | null;
  penguji_nama: string | null;
  diubah_pada: string;
};

/** Dashboard pimpinan dengan data yang dibatasi oleh akses proyek pengguna. */
export default async function HalamanDashboard() {
  const saya = await wajibMasuk();
  if (PERAN_PENGUJI.includes(saya.peran)) redirect("/proyek");
  const lihatSemua = internal(saya.peran);

  const saringProyek = lihatSemua
    ? "true"
    : `p.id IN (SELECT project_id FROM th_project_members WHERE user_id = '${saya.id}'::uuid)`;

  const proyekQuery = klienMentah.unsafe(`
    SELECT p.id, p.nama, p.unit_bisnis, p.tahap, p.aplikasi, p.modul,
           p.jenis_pengujian, p.modul_aplikasi, p.tanggal_mulai, p.target_selesai,
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
  `);

  const [proyekRows, modulRows, tindakRows] = await Promise.all([
    proyekQuery, perModulQuery, perluTindakQuery,
  ]);
  const proyek = proyekRows as unknown as ProyekDashboard[];
  const perModul = modulRows as unknown as ModulDashboard[];
  const modulPerProyek = kelompokkanModulPerProyek(perModul);
  const perluTindak = tindakRows as unknown as Tertunda[];

  return (
    <>
      <Nav aktif="dashboard" peran={saya.peran} />
      <main id="konten-utama" tabIndex={-1} className="mx-auto max-w-[1200px] px-6 py-8">
        <DashboardInteraktif proyek={proyek} modulPerProyek={modulPerProyek}
          perluTindak={perluTindak} lihatSemua={lihatSemua} />
      </main>
    </>
  );
}
