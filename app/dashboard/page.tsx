import Link from "next/link";
import { redirect } from "next/navigation";
import { klienMentah } from "@/db";
import { Nav } from "@/components/nav";
import { wajibMasuk, internal, PERAN_PENGUJI } from "@/lib/gerbang";
import { tanggalID } from "@/lib/waktu";
import { STATUS_UJI, labelStatus, cn } from "@/lib/format";
import { labelJenisPengujian } from "@/lib/fase-proyek";

export const dynamic = "force-dynamic";

type Proyek = {
  id: string; nama: string; unit_bisnis: string | null; tahap: string;
  aplikasi: string | null; modul: string | null; jenis_pengujian: string;
  modul_aplikasi: string | null; target_selesai: string | Date | null;
  total: number; lulus: number; gagal: number; tertunda: number; belum: number;
};
type ModulBaris = {
  project_id: string; proyek: string; kode: string; nama: string;
  total: number; lulus: number; gagal: number; tertunda: number; belum: number;
};
type Tertunda = {
  project_id: string; proyek: string; scenario_id: string; kode: string;
  judul: string; status: string; catatan_tindak_lanjut: string | null;
  penguji_nama: string | null; diubah_pada: string;
};

const LABEL_TAHAP: Record<string, string> = {
  PERSIAPAN: "Persiapan", SIT: "SIT", UAT: "UAT",
  WAITING_SIGNOFF: "Menunggu ttd", SELESAI: "Selesai",
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
    LEFT JOIN th_scenarios s ON s.module_id = m.id
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
  const proyek = proyekRows as unknown as Proyek[];
  const perModul = modulRows as unknown as ModulBaris[];
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

            {/* Perbandingan antar proyek — bilah horizontal, disortir dari yang
                paling tertinggal supaya yang butuh perhatian ada di atas. */}
            <section aria-label="Kemajuan per proyek" className="mb-6">
              <h2 className="mb-2 text-[15px] font-semibold text-tinta">Kemajuan per proyek</h2>
              <div className="overflow-hidden rounded-lg border border-garis bg-kartu">
                <table className="w-full border-collapse text-[13.5px]">
                  <caption className="sr-only">
                    Tingkat kelulusan tiap proyek. Angka dihitung dari seluruh skenario,
                    termasuk yang belum diuji.
                  </caption>
                  <thead>
                    <tr className="border-b border-garis bg-kanvas text-left">
                      {["Proyek","Jenis pengujian","Tahap","Kelulusan","Lulus / total","Kendala","Target"].map((h) => (
                        <th key={h} scope="col"
                          className="whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-tinta-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...proyek]
                      .sort((a, b) => {
                        const pa = a.total ? a.lulus / a.total : 0;
                        const pb = b.total ? b.lulus / b.total : 0;
                        return pa - pb;
                      })
                      .map((p) => {
                        const persen = p.total > 0 ? Math.round((p.lulus / p.total) * 100) : 0;
                        const kendala = p.gagal + p.tertunda;
                        return (
                          <tr key={p.id} className="border-b border-garis last:border-0">
                            <td className="px-3 py-2.5">
                              <Link href={`/proyek/${p.id}`} className="font-medium text-tinta hover:text-aksi">
                                {p.nama}
                              </Link>
                              {(p.aplikasi ?? p.modul_aplikasi) || p.modul ? (
                                <span className="mt-0.5 block text-[12px] text-tinta-3">
                                  {[p.aplikasi ?? p.modul_aplikasi, p.modul].filter(Boolean).join(" · ")}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 text-tinta-2">{labelJenisPengujian(p.jenis_pengujian)}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-tinta-2">
                              {LABEL_TAHAP[p.tahap] ?? p.tahap}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="flex items-center gap-2">
                                {/* Bilah: lebar proporsional, warna mengikuti tingkat.
                                    Angka persen selalu ada di sebelahnya, jadi warna
                                    bukan satu-satunya pembawa makna. */}
                                <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-kanvas" aria-hidden>
                                  <span className={cn("block h-full rounded-full",
                                    persen >= 80 ? "bg-lulus" : persen >= 40 ? "bg-tertunda" : "bg-gagal")}
                                    style={{ width: `${persen === 0 ? 0 : Math.max(3, persen)}%` }} />
                                </span>
                                <span className="tabular text-[13px] font-medium text-tinta">{persen}%</span>
                              </span>
                            </td>
                            <td className="tabular whitespace-nowrap px-3 py-2.5 text-tinta-2">
                              {p.lulus} / {p.total}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">
                              {kendala > 0 ? (
                                <span className="text-[12.5px] font-medium text-gagal">
                                  {p.gagal > 0 && `${p.gagal} gagal`}
                                  {p.gagal > 0 && p.tertunda > 0 && " · "}
                                  {p.tertunda > 0 && `${p.tertunda} tertunda`}
                                </span>
                              ) : (
                                <span className="text-[12.5px] text-tinta-3">—</span>
                              )}
                            </td>
                            <td className="tabular whitespace-nowrap px-3 py-2.5 text-[12.5px] text-tinta-2">
                              {p.target_selesai ? tanggalID(p.target_selesai) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Kemajuan per modul. Inilah "chart" yang diminta: bilah bertumpuk
                per modul, dengan angka tepat di sebelahnya. */}
            {perModul.length > 0 && (
              <section aria-label="Kemajuan per modul" className="mb-6">
                <h2 className="mb-2 text-[15px] font-semibold text-tinta">Kemajuan per modul</h2>
                <div className="space-y-3 rounded-lg border border-garis bg-kartu px-5 py-4">
                  {perModul.map((m) => {
                    const p = (n: number) => (m.total > 0 ? (n / m.total) * 100 : 0);
                    return (
                      <div key={`${m.project_id}-${m.kode}`}>
                        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <p className="text-[13.5px] text-tinta">
                            <span className="tabular mr-1.5 rounded bg-kanvas px-1.5 py-0.5 text-[12px] text-tinta-2">
                              {m.kode}
                            </span>
                            {m.nama}
                          </p>
                          <p className="tabular text-[12.5px] text-tinta-3">
                            {m.lulus}/{m.total} lulus
                            {m.gagal > 0 && <span className="text-gagal"> · {m.gagal} gagal</span>}
                            {m.tertunda > 0 && <span className="text-tertunda"> · {m.tertunda} tertunda</span>}
                          </p>
                        </div>
                        {/* Bilah bertumpuk: lulus, gagal, tertunda, belum.
                            Tiap bagian punya warna DAN tercantum angkanya di atas,
                            jadi tidak ada makna yang hanya dibawa warna. */}
                        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-kanvas"
                          role="img"
                          aria-label={`${m.nama}: ${m.lulus} lulus, ${m.gagal} gagal, ${m.tertunda} tertunda, ${m.belum} belum diuji dari ${m.total} skenario`}>
                          {m.lulus > 0 && <span className="bg-lulus" style={{ width: `${p(m.lulus)}%` }} />}
                          {m.gagal > 0 && <span className="bg-gagal" style={{ width: `${p(m.gagal)}%` }} />}
                          {m.tertunda > 0 && <span className="bg-tertunda" style={{ width: `${p(m.tertunda)}%` }} />}
                          {m.belum > 0 && <span className="bg-garis-kuat" style={{ width: `${p(m.belum)}%` }} />}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-4 border-t border-garis pt-3 text-[12.5px] text-tinta-3">
                    {([["bg-lulus","Lulus"],["bg-gagal","Gagal"],["bg-tertunda","Tertunda"],["bg-garis-kuat","Belum diuji"]] as [string,string][])
                      .map(([w, l]) => (
                        <span key={l} className="flex items-center gap-1.5">
                          <span className={cn("h-2.5 w-2.5 rounded-sm", w)} aria-hidden />
                          {l}
                        </span>
                      ))}
                  </div>
                </div>
              </section>
            )}

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
                          <span className={cn("shrink-0 rounded px-2 py-0.5 text-[12.5px] font-medium", st.kelas)}>
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
