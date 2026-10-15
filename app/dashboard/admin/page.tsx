import Link from "next/link";
import { Nav } from "@/components/nav";
import { wajibAdminAtauPimpinan } from "@/lib/gerbang";
import { klienMentah } from "@/db";

export const dynamic = "force-dynamic";

export default async function HalamanAdmin() {
  const saya = await wajibAdminAtauPimpinan();
  const [ringkas] = (await klienMentah.unsafe(`
    SELECT
      (SELECT count(*) FROM th_users)::int AS pengguna,
      (SELECT count(*) FROM th_users WHERE aktif = true)::int AS aktif,
      (SELECT count(*) FROM th_projects)::int AS proyek,
      (SELECT count(*) FROM th_project_members)::int AS penugasan
  `)) as unknown as { pengguna: number; aktif: number; proyek: number; penugasan: number }[];

  return (
    <>
      <Nav aktif="admin" peran={saya.peran} />
      <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
        <header className="mb-7">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-aksi">Ruang admin</p>
          <h1 className="text-3xl font-bold tracking-tight text-tinta">Administrasi sistem</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-tinta-2">
            {saya.peran === "ADMIN"
              ? "Kelola akun dan akses proyek. Halaman privat ini tidak tersedia untuk publik."
              : "Ringkasan dan daftar akun tersedia untuk ditinjau; seluruh tindakan administrasi bersifat baca-saja."}
          </p>
        </header>

        <section aria-label="Ringkasan administrasi" className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["Total akun", ringkas.pengguna],
            ["Akun aktif", ringkas.aktif],
            ["Proyek", ringkas.proyek],
            ["Penugasan proyek", ringkas.penugasan],
          ] as [string, number][]).map(([label, nilai]) => (
            <div key={label} className="rounded-xl border border-garis bg-kartu p-4 shadow-sm shadow-tinta/[0.03]">
              <p className="text-[12px] font-medium uppercase tracking-wide text-tinta-3">{label}</p>
              <p className="tabular mt-2 text-3xl font-semibold tracking-tight text-tinta">{nilai}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Link href="/dashboard/admin/pengguna" className="group rounded-xl border border-garis bg-kartu p-5 shadow-sm shadow-tinta/[0.03] transition-colors hover:border-aksi/50 hover:bg-aksi/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aksi">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-aksi-lembut text-aksi" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m14-11a4 4 0 0 1 0 8m-8-8a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-3h6m-3-3v6" />
              </svg>
            </div>
            <h2 className="text-[17px] font-semibold text-tinta group-hover:text-aksi">{saya.peran === "ADMIN" ? "Kelola pengguna" : "Lihat pengguna"}</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta-2">
              {saya.peran === "ADMIN"
                ? "Daftarkan akun, tetapkan salah satu dari lima peran, buat ulang sandi, atau nonaktifkan akses."
                : "Tinjau daftar akun, peran, dan status. Pimpinan tidak dapat membuat atau mengubah akun."}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-aksi">{saya.peran === "ADMIN" ? "Buka pengelolaan" : "Buka daftar"} <span aria-hidden="true">→</span></span>
          </Link>

          <div className="rounded-xl border border-garis bg-kartu p-5 shadow-sm shadow-tinta/[0.03]">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-kanvas text-tinta-2" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Zm0 0 8 4.5m8-4.5-8 4.5m0 0V21m-4-13 8 4.5" />
              </svg>
            </div>
            <h2 className="text-[17px] font-semibold text-tinta">Model akses proyek</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-tinta-2">
              Penguji Internal Kemenkeu dan Eksternal Kemenkeu hanya melihat proyek yang ditugaskan kepada akun mereka. Tautan proyek tetap meminta login.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11.5px] font-medium">
              {["Admin", "Pimpinan · lihat saja", "Internal PSII", "Internal Kemenkeu · proyek tugas", "Eksternal Kemenkeu · proyek tugas"].map((x) => (
                <span key={x} className="rounded-md border border-garis bg-kanvas px-2 py-1 text-tinta-2">{x}</span>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
