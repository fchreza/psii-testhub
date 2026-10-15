import Link from "next/link";
import { redirect } from "next/navigation";
import { klienMentah } from "@/db";
import { Nav } from "@/components/nav";
import { internal, PERAN_PENGUJI, wajibMasuk } from "@/lib/gerbang";

export const dynamic = "force-dynamic";

/**
 * Beranda.
 *
 * KENAPA MENAMPILKAN JUMLAH, bukan hanya nama:
 * Angka memberi tahu apakah sebuah proyek sudah diisi skenarionya atau masih
 * kosong. Tanpa itu, pengguna harus membuka satu per satu untuk mencari tahu
 * di mana pekerjaannya berada.
 */
export default async function Beranda() {
  const saya = await wajibMasuk();
  if (PERAN_PENGUJI.includes(saya.peran)) redirect("/proyek");
  const cakupan = internal(saya.peran)
    ? "true"
    : `p.id IN (SELECT project_id FROM th_project_members WHERE user_id = '${saya.id}'::uuid)`;

  const ringkas = (await klienMentah.unsafe(`
    SELECT
      (SELECT count(*) FROM th_projects p WHERE ${cakupan})::int AS proyek,
      (SELECT count(*) FROM th_scenarios s JOIN th_projects p ON p.id = s.project_id WHERE ${cakupan})::int AS skenario,
      (SELECT count(*) FROM th_scenarios s JOIN th_projects p ON p.id = s.project_id WHERE s.status = 'PENDING' AND ${cakupan})::int AS belum,
      (SELECT count(*) FROM th_scenarios s JOIN th_projects p ON p.id = s.project_id WHERE s.status = 'PASS' AND ${cakupan})::int AS lulus,
      (SELECT count(*) FROM th_scenarios s JOIN th_projects p ON p.id = s.project_id WHERE s.status = 'FAIL' AND ${cakupan})::int AS gagal,
      (SELECT count(*) FROM th_scenarios s JOIN th_projects p ON p.id = s.project_id WHERE s.status = 'BLOCKED' AND ${cakupan})::int AS tertunda
  `)) as unknown as {
    proyek: number; skenario: number; belum: number;
    lulus: number; gagal: number; tertunda: number;
  }[];

  const k = ringkas[0];
  /*
   * Tingkat kelulusan memakai SEMUA skenario sebagai pembagi (keputusan
   * pemilik produk). Angka ini mengukur KEMAJUAN proyek, bukan mutu pengujian —
   * proyek yang belum selesai diuji tidak boleh terlihat seperti sudah selesai.
   */
  const persen = k.skenario > 0 ? Math.round((k.lulus / k.skenario) * 100) : 0;

  const kartu = [
    { label: "Proyek", nilai: k.proyek, warna: "text-tinta" },
    { label: "Total skenario", nilai: k.skenario, warna: "text-tinta" },
    { label: "Lulus", nilai: k.lulus, warna: "text-lulus" },
    { label: "Gagal", nilai: k.gagal, warna: "text-gagal" },
    { label: "Tertunda", nilai: k.tertunda, warna: "text-tertunda" },
    { label: "Belum diuji", nilai: k.belum, warna: "text-tinta-3" },
  ];

  return (
    <>
      <Nav aktif="beranda" peran={saya.peran} />
      <main className="mx-auto max-w-[1100px] px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-tinta">PSII TestHub</h1>
          <p className="mt-1 text-[14px] text-tinta-2">
            Selamat datang, {saya.nama}
            {saya.jabatan ? ` · ${saya.jabatan}` : ""} · peran {saya.peran}
          </p>
        </header>

        <section className="mb-8">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-tinta-3">
            Ringkasan
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kartu.map((x) => (
              <div key={x.label} className="rounded-lg border border-garis bg-kartu px-4 py-3.5">
                <p className="text-[12.5px] font-medium uppercase tracking-wide text-tinta-3">
                  {x.label}
                </p>
                <p className={`tabular mt-1 text-[26px] font-bold leading-none ${x.warna}`}>
                  {x.nilai}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-lg border border-garis bg-kartu px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[13.5px] font-medium text-tinta-2">
                Tingkat kelulusan keseluruhan
              </p>
              <p className="tabular text-[15px] font-semibold text-tinta">{persen}%</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-kanvas" aria-hidden>
              <div className="h-full rounded-full bg-lulus"
                style={{ width: `${persen}%` }} />
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-tinta-3">
              Dihitung dari seluruh skenario ({k.lulus} lulus dari {k.skenario} skenario).
              Angka ini mengukur kemajuan proyek, bukan mutu pengujian.
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-tinta-3">
            Mulai dari sini
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/proyek"
              className="sentuh rounded-lg border border-garis bg-kartu px-4 py-3.5 hover:border-garis-kuat">
              <span className="block text-[15px] font-semibold text-tinta">Proyek pengujian</span>
              <span className="mt-0.5 block text-[13.5px] text-tinta-3">
                {k.proyek} proyek terdaftar
              </span>
            </Link>
            {saya.peran === "ADMIN" && (
              <Link href="/dashboard/admin"
                className="sentuh rounded-lg border border-garis bg-kartu px-4 py-3.5 hover:border-garis-kuat">
                <span className="block text-[15px] font-semibold text-tinta">Administrasi sistem</span>
                <span className="mt-0.5 block text-[13.5px] text-tinta-3">
                  Kelola akun dan akses proyek
                </span>
              </Link>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
