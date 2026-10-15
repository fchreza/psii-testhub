"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { Spinner } from "@/components/indikator-proses";
import { useFocusTrap } from "@/components/use-focus-trap";
import { Button, Feedback } from "@/components/ui";

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

  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(berkas); }
  catch { return berkas; }
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
  projectId, scenarioId, bolehUbah, bolehHapus, onDataMutasi,
}: { projectId: string; scenarioId: string; bolehUbah: boolean; bolehHapus: boolean; onDataMutasi?: () => void }) {
  const [daftar, setDaftar] = useState<Bukti[]>([]);
  const [muat, setMuat] = useState(true);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [perbesar, setPerbesar] = useState<Bukti | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<Bukti | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const operasiAktif = useRef<string | null>(null);
  const previewRef = useFocusTrap<HTMLDivElement>(perbesar !== null, () => setPerbesar(null));
  const hapusDialogRef = useFocusTrap<HTMLElement>(konfirmasiHapus !== null, () => {
    if (!operasiAktif.current) { setKonfirmasiHapus(null); setGalat(null); }
  });

  const ambil = useCallback(async () => {
    setMuat(true);
    setGalat(null);
    try {
      const r = await fetch("/api/v1/bukti", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "daftar", projectId, scenarioId }),
      });
      const j = await r.json().catch(() => ({ pesan: "Respons server tidak dapat dibaca." }));
      if (!r.ok) { setGalat(j.pesan ?? "Gagal memuat daftar bukti."); return; }
      setDaftar(j.bukti ?? []);
    } catch {
      setGalat("Tidak dapat memuat bukti. Periksa koneksi lalu coba lagi.");
    } finally { setMuat(false); }
  }, [projectId, scenarioId]);

  useEffect(() => { void ambil(); }, [ambil]);

  async function unggah(berkasAsli: File) {
    if (operasiAktif.current) return;
    const kunciOperasi = `unggah:${berkasAsli.name}`;
    operasiAktif.current = kunciOperasi;
    setGalat(null); setSukses(null);
    setSibuk(kunciOperasi);
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
      setSukses(`${berkas.name} berhasil diunggah.`);
      onDataMutasi?.();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal mengunggah");
    } finally {
      if (operasiAktif.current === kunciOperasi) {
        operasiAktif.current = null;
        setSibuk(null);
      }
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function hapus(b: Bukti) {
    if (operasiAktif.current) return;
    operasiAktif.current = b.id;
    setGalat(null); setSukses(null);
    setSibuk(b.id);
    try {
      const r = await fetch("/api/v1/bukti", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "hapus", evidenceId: b.id, projectId }),
      });
      const j = await r.json().catch(() => ({ pesan: "Respons server tidak dapat dibaca." }));
      if (!r.ok) { setGalat(j.pesan ?? "Gagal menghapus bukti."); return; }
      setDaftar((d) => d.filter((x) => x.id !== b.id));
      setKonfirmasiHapus(null);
      setGalat(null);
      setSukses(`${b.nama_asli ?? "Bukti"} berhasil dihapus.`);
      onDataMutasi?.();
    } catch {
      setGalat("Tidak dapat terhubung. Bukti belum dihapus.");
    } finally {
      if (operasiAktif.current === b.id) {
        operasiAktif.current = null;
        setSibuk(null);
      }
    }
  }

  const gambar = daftar.filter((b) => b.tipe?.startsWith("image/"));
  const lain = daftar.filter((b) => !b.tipe?.startsWith("image/"));

  return (
    <div aria-busy={muat || !!sibuk}>
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
            <Button type="button" disabled={!!sibuk} busy={!!sibuk}
              onClick={() => inputRef.current?.click()}
              className="min-h-9 px-3 py-1.5 text-[13px]">
              {sibuk ? "Mengunggah…" : "Tambah bukti"}
            </Button>
          </>
        )}
      </div>

      {galat && (
        <Feedback kind="error" className="mb-2">{galat}</Feedback>
      )}
      {sukses && <Feedback kind="success" className="mb-2">{sukses}</Feedback>}

      {muat ? (
        <p role="status" className="inline-flex items-center gap-2 text-[13px] text-tinta-3"><Spinner className="h-4 w-4" />Memuat bukti…</p>
      ) : galat && daftar.length === 0 ? (
        <div className="rounded border border-dashed border-garis px-3 py-4 text-center">
          <p className="text-[13px] text-tinta-3">Daftar bukti belum bisa ditampilkan.</p>
          <Button type="button" onClick={() => void ambil()} busy={muat} className="mt-2 min-h-8 px-3 py-1 text-[12.5px]">Coba lagi</Button>
        </div>
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
                  {bolehHapus && (
                    <Button type="button" variant="danger-quiet" onClick={() => { setGalat(null); setKonfirmasiHapus(b); }} disabled={!!sibuk} busy={sibuk === b.id}
                      aria-label={`Hapus ${b.nama_asli ?? "bukti"}`}
                      className="absolute right-1 top-1 min-h-7 rounded-md bg-kartu/95 px-2 py-1 text-[11px] font-medium opacity-0 shadow-sm transition-opacity focus:opacity-100 group-hover:opacity-100">
                      {sibuk === b.id ? "Menghapus…" : "Hapus"}
                    </Button>
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
                  {bolehHapus && (
                    <Button type="button" variant="danger-quiet" onClick={() => { setGalat(null); setKonfirmasiHapus(b); }} disabled={!!sibuk} busy={sibuk === b.id}
                      aria-label={`Hapus ${b.nama_asli ?? "berkas"}`}
                      className="min-h-8 shrink-0 px-2 py-1 text-[12px] text-tinta-3 hover:text-gagal">
                      {sibuk === b.id ? "Menghapus…" : "Hapus"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {konfirmasiHapus && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button type="button" aria-label="Tutup konfirmasi hapus bukti" disabled={!!sibuk}
            onClick={() => { setKonfirmasiHapus(null); setGalat(null); }}
            className="absolute inset-0 bg-tinta/45 disabled:cursor-wait" />
            <section ref={hapusDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="judul-hapus-bukti"
            className="relative z-10 w-full max-w-lg rounded-xl border border-garis bg-kartu p-5 shadow-2xl sm:p-6">
            <h2 id="judul-hapus-bukti" className="text-lg font-bold text-tinta">Hapus bukti?</h2>
            <p className="mt-2 break-words text-[13.5px] leading-relaxed text-tinta-2">
              Bukti <strong>{konfirmasiHapus.nama_asli ?? "berkas"}</strong> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </p>
            {galat && <Feedback kind="error" className="mt-3">{galat}</Feedback>}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" autoFocus disabled={!!sibuk}
                onClick={() => { setKonfirmasiHapus(null); setGalat(null); }}
                className="text-[13px]">Batal</Button>
              <Button type="button" variant="danger" busy={!!sibuk}
                onClick={() => void hapus(konfirmasiHapus)}
                className="text-[13px]">{sibuk ? "Menghapus…" : "Hapus bukti"}</Button>
            </div>
          </section>
        </div>
      )}

      {perbesar && (
        <div ref={previewRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Pratinjau bukti"
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
