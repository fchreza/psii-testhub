import { klienMentah } from "@/db";
import { Nav } from "@/components/nav";
import { wajibMasuk } from "@/lib/gerbang";
import { KelolaPengguna } from "@/components/kelola-pengguna";

export const dynamic = "force-dynamic";

export default async function HalamanPengguna() {
  const saya = await wajibMasuk();

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
      <Nav aktif="pengguna" peran={saya.peran} />
      <main className="mx-auto max-w-[1000px] px-6 py-8">
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-tinta">Pengguna</h1>
          <p className="mt-1 text-[14px] leading-relaxed text-tinta-2">
            {daftar.filter((p) => p.aktif).length} akun aktif dari {daftar.length}.
            Peran menentukan apa yang boleh dilihat — pengguna EKSTERNAL hanya melihat
            proyek yang ia menjadi anggotanya.
          </p>
        </header>

        {saya.peran !== "ADMIN" ? (
          <div className="rounded-lg border border-garis bg-kartu px-6 py-8 text-center">
            <p className="text-[15px] font-medium text-tinta">Hanya admin yang bisa mengelola pengguna</p>
            <p className="mx-auto mt-1 max-w-md text-[14px] leading-relaxed text-tinta-2">
              Halaman ini tetap bisa dilihat agar Anda tahu siapa saja yang punya akses,
              tetapi penambahan dan perubahan hanya bisa dilakukan admin.
            </p>
          </div>
        ) : null}

        <KelolaPengguna daftarAwal={daftar} bolehKelola={saya.peran === "ADMIN"} sayaId={saya.id} />
      </main>
    </>
  );
}
