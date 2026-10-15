import Link from "next/link";
import { klienMentah } from "@/db";
import { Nav } from "@/components/nav";
import { wajibAdminAtauPimpinan } from "@/lib/gerbang";
import { KelolaPengguna } from "@/components/kelola-pengguna";

export const dynamic = "force-dynamic";

export default async function HalamanPenggunaAdmin() {
  const saya = await wajibAdminAtauPimpinan();
  const daftar = (await klienMentah.unsafe(`
    SELECT u.id, u.email, u.nama, u.jabatan, u.peran, u.aktif, u.dibuat_pada,
           (SELECT count(*) FROM th_project_members m WHERE m.user_id = u.id)::int AS jumlah_proyek
    FROM th_users u
    ORDER BY u.aktif DESC, u.nama
  `)) as unknown as {
    id: string; email: string; nama: string; jabatan: string | null;
    peran: string; aktif: boolean; dibuat_pada: string; jumlah_proyek: number;
  }[];

  return (
    <>
      <Nav aktif="admin" peran={saya.peran} />
      <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-[13px] text-tinta-3">
          <Link href="/dashboard/admin" className="hover:text-aksi">Administrasi</Link>
          <span aria-hidden="true"> / </span><span className="text-tinta-2">Pengguna</span>
        </nav>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-aksi">Admin</p>
            <h1 className="text-3xl font-bold tracking-tight text-tinta">Pengguna</h1>
            <p className="mt-2 text-[14px] text-tinta-2">
              {daftar.filter((p) => p.aktif).length} akun aktif dari {daftar.length}. {saya.peran === "ADMIN" ? "Akun hanya bisa dibuat dan dikelola Admin." : "Tampilan Pimpinan bersifat baca-saja."}
            </p>
          </div>
          <Link href="/dashboard/admin" className="rounded-lg border border-garis bg-kartu px-3 py-2 text-[13px] font-medium text-tinta-2 hover:border-garis-kuat hover:text-tinta">Kembali ke administrasi</Link>
        </header>

        <KelolaPengguna daftarAwal={daftar} bolehKelola={saya.peran === "ADMIN"} sayaId={saya.id} />
      </main>
    </>
  );
}
