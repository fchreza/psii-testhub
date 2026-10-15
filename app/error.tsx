"use client";

export default function ErrorHalaman({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="konten-utama" tabIndex={-1} className="flex min-h-[60vh] items-center justify-center px-4 py-12 sm:px-6">
      <section role="alert" className="w-full max-w-lg rounded-xl border border-gagal/30 bg-kartu p-6 shadow-sm sm:p-8">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.15em] text-gagal">Terjadi kendala</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-tinta">Halaman belum dapat dimuat</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-tinta-2">
          Koneksi mungkin terputus atau layanan sedang sibuk. Coba muat ulang bagian ini; perubahan yang belum tersimpan tetap perlu dikirim ulang.
        </p>
        <button type="button" onClick={() => reset()}
          className="mt-5 min-h-10 rounded-lg bg-aksi px-4 py-2 text-[13.5px] font-semibold text-white transition-colors hover:bg-aksi/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aksi focus-visible:ring-offset-2">
          Coba lagi
        </button>
      </section>
    </main>
  );
}
