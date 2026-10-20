"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Spinner } from "@/components/indikator-proses";
import { SaveButton } from "@/components/save-button";

function FormMasuk() {
  const [email, setEmail] = useState("");
  const [sandi, setSandi] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const router = useRouter();
  const cari = useSearchParams();

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    setSibuk(true); setGalat(null);
    try {
      const r = await fetch("/api/v1/masuk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sandi }),
      });
      if (r.ok) {
        // Segarkan sesi sebelum berpindah supaya router tidak memakai halaman anonim yang tersimpan.
        router.refresh();
        const lanjut = cari.get("lanjut");
        const aman = lanjut && lanjut.startsWith("/") && !lanjut.startsWith("//") && !lanjut.includes(String.fromCharCode(92))
          ? lanjut
          : "/";
        router.push(aman);
        return;
      }
      const { pesan } = await r.json().catch(() => ({ pesan: "Gagal masuk" }));
      setGalat(pesan ?? "Gagal masuk");
    } catch {
      setGalat("Tidak dapat terhubung. Periksa koneksi lalu coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <main id="konten-utama" tabIndex={-1} className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-104">
        <div className="rounded-xl border border-garis bg-kartu p-7">
          <h1 className="text-[22px] font-bold tracking-tight text-tinta">PSII TestHub</h1>
          <p className="mt-1 text-[14px] leading-relaxed text-tinta-2">
            Manajemen pengujian SIT &amp; UAT. Masuk dengan akun yang sudah didaftarkan.
          </p>

          <form onSubmit={kirim} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[14px] font-medium text-tinta">Email</label>
              <input id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-garis-kuat px-3 py-2.5 text-[16px] text-tinta outline-hidden focus:border-aksi" />
            </div>
            <div>
              <div className="mb-1.5">
                <label htmlFor="sandi" className="block text-[14px] font-medium text-tinta">Sandi</label>
              </div>
              <input id="sandi" type="password" autoComplete="current-password" required
                value={sandi} onChange={(e) => setSandi(e.target.value)}
                className="w-full rounded-md border border-garis-kuat px-3 py-2.5 text-[16px] text-tinta outline-hidden focus:border-aksi" />
            </div>

            {galat && (
              <p role="alert" className="rounded-md border border-gagal bg-gagal-lembut px-3 py-2 text-[14px] text-gagal">
                {galat}
              </p>
            )}

            <SaveButton type="submit" variant="primary" busy={sibuk} loadingText="Memeriksa…"
              className="sentuh w-full rounded-md text-[15px] font-medium">
              Masuk
            </SaveButton>
          </form>
        </div>
        <p className="mt-4 text-center text-[13.5px] leading-relaxed text-tinta-3">
          Belum punya akses? Hubungi admin untuk didaftarkan.
        </p>
      </div>
    </main>
  );
}

/*
 * KENAPA DIBUNGKUS <Suspense>:
 * `useSearchParams` membuat komponen ini dirender di klien, dan Next
 * memperingatkan (atau gagal build) kalau ia tidak dibungkus batas Suspense.
 */
export default function HalamanMasuk() {
  return (
    <Suspense fallback={<main id="konten-utama" tabIndex={-1} aria-busy="true" className="flex min-h-screen items-center justify-center px-6">
      <p role="status" aria-live="polite" className="inline-flex items-center gap-2 text-[14px] text-tinta-2"><Spinner className="h-4 w-4" />Memuat formulir masuk…</p>
    </main>}>
      <FormMasuk />
    </Suspense>
  );
}
