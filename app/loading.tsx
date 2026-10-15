import { Spinner } from "@/components/indikator-proses";

export default function Loading() {
  return (
    <main id="konten-utama" tabIndex={-1} aria-busy="true" className="min-h-screen bg-kanvas px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-[1200px]">
        <div role="status" aria-live="polite" className="mb-6 inline-flex items-center gap-2 text-[13px] font-medium text-tinta-2">
          <Spinner className="h-4 w-4 text-aksi" />
          <span>Memuat halaman…</span>
        </div>
        <span className="sr-only">Harap tunggu, konten sedang dimuat.</span>
        <div className="mb-6 space-y-2" aria-hidden="true">
          <div className="h-8 w-64 rounded bg-garis motion-safe:animate-pulse motion-reduce:animate-none" />
          <div className="h-4 w-96 max-w-full rounded bg-garis motion-safe:animate-pulse motion-reduce:animate-none" />
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-20 rounded-lg border border-garis bg-kartu motion-safe:animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
        <div className="h-64 rounded-lg border border-garis bg-kartu motion-safe:animate-pulse motion-reduce:animate-none" aria-hidden="true" />
      </div>
    </main>
  );
}
