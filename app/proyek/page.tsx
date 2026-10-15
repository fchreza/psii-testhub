import Link from "next/link";
import { klienMentah } from "@/db";
import { Nav } from "@/components/nav";
import { wajibMasuk, internal } from "@/lib/gerbang";
import { tanggalID } from "@/lib/waktu";
import { TombolProyekBaru } from "@/components/tombol-proyek-baru";

export const dynamic = "force-dynamic";

type Baris = {
  id: string; nama: string; modul_aplikasi: string | null; unit_bisnis: string | null;
  tahap: string; lingkungan: string; tanggal_mulai: string | null;
  target_selesai: string | null; pm_nama: string | null;
  total: number; lulus: number; gagal: number; tertunda: number; belum: number;
};

const LABEL_TAHAP: Record<string, string> = {
  PERSIAPAN: "Persiapan", SIT: "Sedang SIT", UAT: "Sedang UAT",
  WAITING_SIGNOFF: "Menunggu tanda tangan", SELESAI: "Selesai",
};

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

  const daftar = (await klienMentah.unsafe(`
    SELECT p.id, p.nama, p.modul_aplikasi, p.unit_bisnis, p.tahap, p.lingkungan,
           p.tanggal_mulai, p.target_selesai,
           u.nama AS pm_nama,
           (SELECT count(*) FROM th_scenarios s WHERE s.project_id = p.id)::int AS total,
           (SELECT count(*) FROM th_scenarios s WHERE s.project_id = p.id AND s.status = 'PASS')::int AS lulus,
           (SELECT count(*) FROM th_scenarios s WHERE s.project_id = p.id AND s.status = 'FAIL')::int AS gagal,
           (SELECT count(*) FROM th_scenarios s WHERE s.project_id = p.id AND s.status = 'BLOCKED')::int AS tertunda,
           (SELECT count(*) FROM th_scenarios s WHERE s.project_id = p.id AND s.status = 'PENDING')::int AS belum
    FROM th_projects p
    LEFT JOIN th_users u ON u.id = p.pm_id
    WHERE ${lihatSemua ? "true" : `p.id IN (SELECT project_id FROM th_project_members WHERE user_id = '${saya.id}'::uuid)`}
    ORDER BY p.dibuat_pada DESC
  `)) as unknown as Baris[];

  return (
    <>
      <Nav aktif="proyek" peran={saya.peran} />
      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-tinta">Proyek pengujian</h1>
            <p className="mt-1 text-[14px] text-tinta-2">
              {lihatSemua
                ? `${daftar.length} proyek di seluruh subdit`
                : `${daftar.length} proyek yang Anda menjadi anggotanya`}
            </p>
          </div>
          {lihatSemua && <TombolProyekBaru />}
        </header>

        {daftar.length === 0 ? (
          <div className="rounded-lg border border-garis bg-kartu px-6 py-12 text-center">
            <p className="text-[15px] font-medium text-tinta">Belum ada proyek</p>
            <p className="mx-auto mt-1 max-w-md text-[14px] leading-relaxed text-tinta-2">
              {lihatSemua
                ? "Proyek adalah wadah untuk skenario SIT dan UAT. Tekan tombol di atas untuk membuat yang pertama."
                : "Anda belum ditambahkan sebagai anggota proyek mana pun. Hubungi admin."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-garis bg-kartu">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-garis bg-kanvas text-left">
                  {["Proyek","Unit","Tahap","Periode","Kelulusan","Kendala",""].map((h, i) => (
                    <th key={i} className="whitespace-nowrap px-3 py-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {daftar.map((p) => {
                  // Tingkat kelulusan memakai SEMUA skenario sebagai pembagi
                  // (keputusan pemilik produk): mengukur kemajuan, bukan mutu.
                  const persen = p.total > 0 ? Math.round((p.lulus / p.total) * 100) : 0;
                  const kendala = p.gagal + p.tertunda;
                  return (
                    <tr key={p.id} className="border-b border-garis last:border-0 hover:bg-kanvas/60">
                      <td className="px-3 py-2.5">
                        <Link href={`/proyek/${p.id}`} className="font-semibold text-tinta hover:text-aksi">
                          {p.nama}
                        </Link>
                        <span className="mt-0.5 block text-[12.5px] text-tinta-3">
                          {p.id}
                          {p.modul_aplikasi ? ` · ${p.modul_aplikasi}` : ""}
                          {p.lingkungan !== "DEV" ? ` · ${p.lingkungan}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-tinta-2">{p.unit_bisnis ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded bg-kanvas px-2 py-0.5 text-[12.5px] font-medium text-tinta-2">
                          {LABEL_TAHAP[p.tahap] ?? p.tahap}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-tinta-2">
                        {p.tanggal_mulai ? tanggalID(p.tanggal_mulai) : "—"}
                        {p.target_selesai ? ` – ${tanggalID(p.target_selesai)}` : ""}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-kanvas" aria-hidden>
                            <span className="block h-full rounded-full bg-lulus"
                              style={{ width: `${Math.max(2, persen)}%` }} />
                          </span>
                          <span className="tabular text-[13px] text-tinta-2">
                            {persen}%
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[12px] text-tinta-3">
                          {p.lulus} dari {p.total} skenario
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {kendala > 0 ? (
                          <span className="rounded bg-gagal-lembut px-2 py-0.5 text-[12.5px] font-medium text-gagal">
                            {kendala} perlu tindak lanjut
                          </span>
                        ) : (
                          <span className="text-[12.5px] text-tinta-3">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link href={`/proyek/${p.id}`}
                          className="rounded px-2 py-1 text-[13px] text-aksi hover:bg-aksi-lembut">
                          Buka
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
