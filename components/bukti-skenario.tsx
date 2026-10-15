"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";

type Bukti = {
  id: string; path: string; nama_asli: string | null;
  tipe: string | null; ukuran: number | null;
  diunggah_pada: string;
  url: string; urlUnduh: string;
};

const BATAS = 10 * 1024 * 1024;

/**
 * Unggah dan lihat bukti pengujian.
 *
 * KENAPA GAMBAR DIKECILKAN DI PERAMBAN DULU:
 * Tangkapan layar sering 3–8 MB, dan batas unggahan di server 10 MB. Tapi
 * mengirim 8 MB untuk gambar yang ditampilkan sebesar 300 px itu pemborosan
 * yang langsung terasa: di jaringan kantor, satu unggahan bisa setengah menit.
 * Diperkecil di peramban, ukurannya turun ke ~200–400 KB tanpa beda yang
 * terlihat — dan hasil tangkapan layar tidak perlu detail di atas 1600 px.
 *
 * Berkas non-gambar (PDF, docx, xlsx) TIDAK diubah: mengubahnya bisa merusak
 * isinya.
 */
async function kecilkan(berkas: File): Promise<File> {
  if (!berkas.type.startsWith("image/")) return berkas;
  // Sudah cukup kecil — tidak perlu diapa-apakan.
  if (berkas.size <= 500 * 1024) return berkas;

  const bitmap = await createImageBitmap(berkas);
  const MAX = 1600;
  const skala = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * skala);
  const h = Math.round(bitmap.height * skala);

  const kanvas = document.createElement("canvas");
  kanvas.width = w;
  kanvas.height = h;
  const ctx = kanvas.getContext("2d");
  if (!ctx) return berkas;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const jenis = berkas.type === "image/png" ? "image/webp" : "image/jpeg";
  const blob: Blob | null = await new Promise((r) =>
    kanvas.toBlob(r, jenis, 0.85));

  // Kalau hasilnya justru lebih besar (jarang, tapi mungkin pada gambar kecil
  // berformat efisien), pakai berkas aslinya.
  if (!blob || blob.size >= berkas.size) return berkas;

  const nama = berkas.name.replace(/\.[^.]+$/, "") + (jenis === "image/webp" ? ".webp" : ".jpg");
  return new File([blob], nama, { type: jenis });
}

export function BuktiSkenario({
  projectId, scenarioId, bolehUbah,
}: { projectId: string; scenarioId: string; bolehUbah: boolean }) {
  const [daftar, setDaftar] = useState<Bukti[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [perbesar, setPerbesar] = useState<Bukti | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ambil = useCallback(async () => {
    const r = await fetch("/api/v1/bukti", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aksi: "daftar", scenarioId }),
    });
    setMuat(false);
    if (!r.ok) return;
    const j = await r.json();
    setDaftar(j.bukti ?? []);
  }, [scenarioId]);

  useEffect(() => { void ambil(); }, [ambil]);

  // Escape menutup pratinjau. Tanpa ini, satu-satunya cara keluar adalah
  // mengklik tepat di luar gambar — dan itu tidak jelas bagi pengguna.
  useEffect(() => {
    if (!perbesar) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setPerbesar(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [perbesar]);

  async function unggah(berkasAsli: File) {
    setGalat(null);
    setSibuk(berkasAsli.name);
    try {
      const berkas = await kecilkan(berkasAsli);

      if (berkas.size > BATAS) {
        setGalat(`${berkas.name}: ${(berkas.size / 1024 / 1024).toFixed(1)} MB melebihi batas 10 MB.`);
        return;
      }

      // Langkah 1 — minta izin
      const r1 = await fetch("/api/v1/bukti", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aksi: "izin_unggah", projectId, scenarioId,
          namaBerkas: berkas.name, mime: berkas.type, ukuran: berkas.size,
        }),
      });
      if (!r1.ok) {
        const j = await r1.json().catch(() => ({ pesan: "Gagal minta izin unggah" }));
        setGalat(j.pesan); return;
      }
      const { kunci, url } = await r1.json();

      // Langkah 2 — unggah LANGSUNG ke penyimpanan, tidak lewat server.
      const r2 = await fetch(url, {
        method: "PUT", body: berkas,
        headers: { "Content-Type": berkas.type },
      });
      if (!r2.ok) {
        setGalat(`Unggahan ke penyimpanan gagal (${r2.status}). Coba lagi.`);
        return;
      }

      // Langkah 3 — minta server mencatat, setelah berkasnya benar-benar ada.
      const r3 = await fetch("/api/v1/bukti", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aksi: "catat", projectId, scenarioId, kunci,
          namaBerkas: berkas.name, mime: berkas.type, ukuran: berkas.size,
        }),
      });
      if (!r3.ok) {
        const j = await r3.json().catch(() => ({ pesan: "Gagal mencatat bukti" }));
        setGalat(j.pesan); return;
      }
      await ambil();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal mengunggah");
    } finally {
      setSibuk(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function hapus(b: Bukti) {
    setGalat(null);
    setSibuk(b.id);
    const r = await fetch("/api/v1/bukti", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aksi: "hapus", evidenceId: b.id, projectId }),
    });
    setSibuk(null);
    if (!r.ok) {
      const j = await r.json().catch(() => ({ pesan: "Gagal menghapus" }));
      setGalat(j.pesan); return;
    }
    setDaftar((d) => d.filter((x) => x.id !== b.id));
  }

  const gambar = daftar.filter((b) => b.tipe?.startsWith("image/"));
  const lain = daftar.filter((b) => !b.tipe?.startsWith("image/"));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">
          Bukti {daftar.length > 0 && <span className="tabular">({daftar.length})</span>}
        </p>
        {bolehUbah && (
          <>
            <input ref={inputRef} type="file" multiple hidden
              accept="image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx,.txt,.csv"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                // Berurutan, bukan serentak: jaringan kantor lebih sering
                // tersendat kalau beberapa unggahan besar jalan bersamaan.
                void (async () => { for (const f of fs) await unggah(f); })();
              }} />
            <button type="button" disabled={!!sibuk}
              onClick={() => inputRef.current?.click()}
              className="rounded border border-garis px-2.5 py-1 text-[13px] font-medium text-tinta-2 hover:border-garis-kuat disabled:opacity-50">
              {sibuk ? "Mengunggah…" : "Tambah bukti"}
            </button>
          </>
        )}
      </div>

      {galat && (
        <p role="alert" className="mb-2 rounded border border-gagal bg-gagal-lembut px-2.5 py-1.5 text-[13px] text-gagal">
          {galat}
        </p>
      )}

      {muat ? (
        <p className="text-[13px] text-tinta-3">Memuat bukti…</p>
      ) : daftar.length === 0 ? (
        <p className="rounded border border-dashed border-garis px-3 py-4 text-center text-[13px] text-tinta-3">
          Belum ada bukti
        </p>
      ) : (
        <>
          {gambar.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {gambar.map((b) => (
                <li key={b.id} className="group relative">
                  <button type="button" onClick={() => setPerbesar(b)}
                    className="block w-full overflow-hidden rounded border border-garis"
                    aria-label={`Perbesar ${b.nama_asli ?? "bukti"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.url} alt={b.nama_asli ?? "Bukti pengujian"}
                      loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </button>
                  {bolehUbah && (
                    <button type="button" onClick={() => void hapus(b)} disabled={sibuk === b.id}
                      aria-label={`Hapus ${b.nama_asli ?? "bukti"}`}
                      className="absolute right-1 top-1 rounded bg-kartu/95 px-1.5 py-0.5 text-[11px] font-medium text-gagal opacity-0 shadow-sm transition-opacity focus:opacity-100 group-hover:opacity-100">
                      Hapus
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {lain.length > 0 && (
            <ul className="mt-2 space-y-1">
              {lain.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 rounded border border-garis px-2.5 py-1.5">
                  <a href={b.urlUnduh} className="min-w-0 flex-1 truncate text-[13px] text-aksi hover:underline">
                    {b.nama_asli ?? "berkas"}
                  </a>
                  <span className="tabular shrink-0 text-[12px] text-tinta-3">
                    {b.ukuran ? `${Math.round(b.ukuran / 1024)} KB` : ""}
                  </span>
                  {bolehUbah && (
                    <button type="button" onClick={() => void hapus(b)} disabled={sibuk === b.id}
                      aria-label={`Hapus ${b.nama_asli ?? "berkas"}`}
                      className="shrink-0 text-[12px] text-tinta-3 hover:text-gagal">
                      Hapus
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {perbesar && (
        <div role="dialog" aria-label="Pratinjau bukti"
          className="fixed inset-0 z-50 flex flex-col bg-tinta/80 p-4"
          onClick={() => setPerbesar(null)}>
          <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
            <p className="truncate text-[13px] text-white/90">{perbesar.nama_asli}</p>
            <div className="flex shrink-0 gap-2">
              <a href={perbesar.urlUnduh} onClick={(e) => e.stopPropagation()}
                className="rounded bg-white/15 px-2.5 py-1 text-[13px] text-white hover:bg-white/25">
                Unduh
              </a>
              <button type="button" onClick={() => setPerbesar(null)}
                className="rounded bg-white/15 px-2.5 py-1 text-[13px] text-white hover:bg-white/25">
                Tutup
              </button>
            </div>
          </div>
          {/* Klik pada gambar tidak menutup — supaya tidak tidak sengaja tertutup
              saat sedang memeriksa detail. */}
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={perbesar.url} alt={perbesar.nama_asli ?? "Bukti"}
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded object-contain" />
          </div>
          <p className="mt-2 shrink-0 text-center text-[12px] text-white/60">
            Klik di luar gambar atau tekan Escape untuk menutup
          </p>
        </div>
      )}
    </div>
  );
}