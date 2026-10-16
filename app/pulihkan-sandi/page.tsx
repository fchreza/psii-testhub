"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@/components/indikator-proses";

function FormPemulihan() {
  const cari = useSearchParams();
  const token = cari.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [sandi, setSandi] = useState("");
  const [konfirmasi, setKonfirmasi] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [terkirim, setTerkirim] = useState(false);
  const [berhasil, setBerhasil] = useState(false);

  async function mintaTautan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSibuk(true); setGalat(null); setPesan(null);
    try {
      const r = await fetch("/api/v1/sandi/lupa", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(hasil.pesan ?? "Permintaan belum dapat diproses."); return; }
      setTerkirim(true); setPesan(hasil.pesan ?? "Jika email terdaftar, tautan pemulihan akan dikirim.");
    } catch { setGalat("Tidak dapat terhubung. Periksa koneksi lalu coba lagi."); }
    finally { setSibuk(false); }
  }

  async function aturSandi(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSibuk(true); setGalat(null); setPesan(null);
    if (sandi !== konfirmasi) { setGalat("Konfirmasi sandi belum sama."); setSibuk(false); return; }
    try {
      const r = await fetch("/api/v1/sandi/atur", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, sandi }),
      });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(hasil.pesan ?? "Sandi belum dapat diperbarui."); return; }
      setBerhasil(true); setPesan(hasil.pesan ?? "Sandi berhasil diperbarui.");
    } catch { setGalat("Tidak dapat terhubung. Periksa koneksi lalu coba lagi."); }
    finally { setSibuk(false); }
  }

  return (
    <main id="konten-utama" tabIndex={-1} className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-108">
        <section className="rounded-xl border border-garis bg-kartu p-7 shadow-xs">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-aksi">PSII TestHub</p>
          <h1 className="mt-2 text-[22px] font-bold tracking-tight text-tinta">
            {token ? "Buat sandi baru" : "Pulihkan sandi"}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-tinta-2">
            {token
              ? "Buat sandi baru untuk akun Anda. Tautan pemulihan hanya dapat digunakan sekali dan berlaku 30 menit."
              : "Masukkan email akun yang terdaftar. Jika cocok, kami akan mengirim tautan pemulihan."}
          </p>

          {!token ? (
            terkirim ? (
              <div className="mt-6 rounded-lg border border-garis bg-kanvas p-4">
                <p role="status" className="text-[14px] leading-relaxed text-tinta-2">{pesan}</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-tinta-3">Jika email tidak diterima, periksa folder spam atau hubungi Admin.</p>
              </div>
            ) : (
              <form onSubmit={mintaTautan} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email-pemulihan" className="mb-1.5 block text-[14px] font-medium text-tinta">Email</label>
                  <input id="email-pemulihan" type="email" autoComplete="email" required maxLength={160} value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-garis-kuat px-3 py-2.5 text-[16px] text-tinta outline-hidden focus:border-aksi focus-visible:ring-2 focus-visible:ring-aksi" />
                </div>
                {galat && <p role="alert" className="rounded-md border border-gagal bg-gagal-lembut px-3 py-2 text-[13.5px] text-gagal">{galat}</p>}
                <button type="submit" disabled={sibuk} aria-busy={sibuk}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-aksi px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-aksi/90 disabled:cursor-wait disabled:opacity-60">
                  {sibuk && <Spinner className="h-4 w-4" />}{sibuk ? "Mengirim permintaan…" : "Kirim tautan pemulihan"}
                </button>
              </form>
            )
          ) : berhasil ? (
            <div className="mt-6 rounded-lg border border-garis bg-kanvas p-4">
              <p role="status" className="text-[14px] leading-relaxed text-tinta-2">{pesan}</p>
              <Link href="/masuk" className="mt-4 inline-flex rounded-md bg-aksi px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-aksi/90">Kembali ke halaman masuk</Link>
            </div>
          ) : (
            <form onSubmit={aturSandi} className="mt-6 space-y-4">
              <div>
                <label htmlFor="sandi-baru" className="mb-1.5 block text-[14px] font-medium text-tinta">Sandi baru</label>
                <input id="sandi-baru" type="password" autoComplete="new-password" required minLength={12} maxLength={256}
                  value={sandi} onChange={(e) => setSandi(e.target.value)}
                  className="w-full rounded-md border border-garis-kuat px-3 py-2.5 text-[16px] text-tinta outline-hidden focus:border-aksi focus-visible:ring-2 focus-visible:ring-aksi" />
                <p className="mt-1 text-[12px] text-tinta-3">Gunakan minimal 12 karakter.</p>
              </div>
              <div>
                <label htmlFor="konfirmasi-sandi" className="mb-1.5 block text-[14px] font-medium text-tinta">Ulangi sandi baru</label>
                <input id="konfirmasi-sandi" type="password" autoComplete="new-password" required minLength={12} maxLength={256}
                  value={konfirmasi} onChange={(e) => setKonfirmasi(e.target.value)}
                  className="w-full rounded-md border border-garis-kuat px-3 py-2.5 text-[16px] text-tinta outline-hidden focus:border-aksi focus-visible:ring-2 focus-visible:ring-aksi" />
              </div>
              {galat && <p role="alert" className="rounded-md border border-gagal bg-gagal-lembut px-3 py-2 text-[13.5px] text-gagal">{galat}</p>}
              <button type="submit" disabled={sibuk} aria-busy={sibuk}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-aksi px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-aksi/90 disabled:cursor-wait disabled:opacity-60">
                {sibuk && <Spinner className="h-4 w-4" />}{sibuk ? "Menyimpan…" : "Simpan sandi baru"}
              </button>
            </form>
          )}
        </section>
        <p className="mt-4 text-center text-[13px] text-tinta-3">
          <Link href="/masuk" className="font-medium text-aksi hover:underline">Kembali ke halaman masuk</Link>
        </p>
      </div>
    </main>
  );
}

export default function HalamanPemulihanSandi() {
  return (
    <Suspense fallback={<main id="konten-utama" tabIndex={-1} aria-busy="true" className="flex min-h-screen items-center justify-center px-6 py-10">
      <p role="status" aria-live="polite" className="inline-flex items-center gap-2 text-[14px] text-tinta-2"><Spinner className="h-4 w-4" />Memuat formulir pemulihan…</p>
    </main>}>
      <FormPemulihan />
    </Suspense>
  );
}
