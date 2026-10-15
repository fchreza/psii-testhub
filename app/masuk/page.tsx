"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

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
    const r = await fetch("/api/v1/masuk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sandi }),
    });
    setSibuk(false);
    if (r.ok) {
      /*
       * `refresh()` sebelum `push()`: tanpa ini, halaman tujuan bisa dirender
       * dari cache router dan tetap menampilkan halaman masuk — pengguna
       * merasa sandinya benar tapi tidak terjadi apa-apa.
       */
      router.refresh();
      router.push(cari.get("lanjut") ?? "/");
    } else {
      const { pesan } = await r.json().catch(() => ({ pesan: "Gagal masuk" }));
      setGalat(pesan ?? "Gagal masuk");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-[26rem]">
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
                className="w-full rounded-md border border-garis-kuat px-3 py-2.5 text-[16px] text-tinta outline-none focus:border-aksi" />
            </div>
            <div>
              <label htmlFor="sandi" className="mb-1.5 block text-[14px] font-medium text-tinta">Sandi</label>
              <input id="sandi" type="password" autoComplete="current-password" required
                value={sandi} onChange={(e) => setSandi(e.target.value)}
                className="w-full rounded-md border border-garis-kuat px-3 py-2.5 text-[16px] text-tinta outline-none focus:border-aksi" />
            </div>

            {galat && (
              <p role="alert" className="rounded-md border border-gagal bg-gagal-lembut px-3 py-2 text-[14px] text-gagal">
                {galat}
              </p>
            )}

            <button type="submit" disabled={sibuk}
              className="sentuh w-full rounded-md bg-aksi text-[15px] font-medium text-white disabled:opacity-60">
              {sibuk ? "Memeriksa…" : "Masuk"}
            </button>
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
    <Suspense fallback={<main className="min-h-screen" />}>
      <FormMasuk />
    </Suspense>
  );
}
