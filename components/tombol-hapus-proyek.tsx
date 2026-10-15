"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TombolHapusProyek({ projectId, nama }: { projectId: string; nama: string }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const tutup = () => {
    if (sibuk) return;
    setBuka(false);
    setKonfirmasi("");
    setGalat(null);
  };

  const hapus = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (konfirmasi.trim() !== projectId) {
      setGalat(`Ketik ${projectId} persis untuk mengonfirmasi.`);
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      const r = await fetch("/api/v1/proyek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "hapus", projectId }),
      });
      const hasil = await r.json().catch(() => ({}));
      if (!r.ok) {
        setGalat(hasil.pesan ?? "Gagal menghapus proyek.");
        return;
      }
      if (hasil.buktiGagal > 0) {
        window.alert(`Proyek telah dihapus, tetapi ${hasil.buktiGagal} berkas bukti gagal dihapus dari penyimpanan.`);
      }
      router.push("/proyek");
      router.refresh();
    } catch {
      setGalat("Tidak dapat terhubung. Proyek belum dapat dipastikan terhapus; muat ulang daftar sebelum mencoba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => { setGalat(null); setBuka(true); }}
        className="rounded-md px-2 py-1 text-[13px] font-medium text-gagal hover:bg-gagal-lembut focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gagal">
        Hapus
      </button>
      {buka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Tutup konfirmasi penghapusan" onClick={tutup}
            className="absolute inset-0 bg-tinta/45" />
          <section role="dialog" aria-modal="true" aria-labelledby="judul-hapus-proyek"
            className="relative z-10 w-full max-w-lg rounded-xl border border-garis bg-kartu p-5 shadow-xl sm:p-6">
            <h2 id="judul-hapus-proyek" className="text-lg font-bold text-tinta">Hapus proyek?</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-2">
              Proyek <strong>{nama}</strong> ({projectId}) beserta skenario, penugasan, modul, dan catatan bukti terkait akan dihapus permanen. Berkas bukti di penyimpanan juga akan dihapus. Tindakan ini tidak dapat dibatalkan.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-tinta-3">
              Riwayat audit yang sudah ada tidak ikut dihapus; penghapusan ini akan dicatat sebagai peristiwa audit.
            </p>
            <form onSubmit={hapus} className="mt-4">
              <label htmlFor={`konfirmasi-hapus-${projectId}`} className="mb-1.5 block text-[13px] font-medium text-tinta-2">
                Ketik <span className="font-mono font-semibold text-tinta">{projectId}</span> untuk melanjutkan
              </label>
              <input id={`konfirmasi-hapus-${projectId}`} autoComplete="off" value={konfirmasi}
                onChange={(e) => setKonfirmasi(e.target.value)} disabled={sibuk}
                className="w-full rounded-lg border border-garis-kuat bg-white px-3 py-2.5 font-mono text-[14px] outline-none focus:border-gagal focus-visible:ring-2 focus-visible:ring-gagal" />
              {galat && <p role="alert" className="mt-2 rounded-md border border-gagal bg-gagal-lembut px-3 py-2 text-[13px] text-gagal">{galat}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={tutup} disabled={sibuk}
                  className="rounded-lg border border-garis-kuat px-3.5 py-2 text-[13px] font-medium text-tinta-2 hover:bg-kanvas disabled:opacity-60">
                  Batal
                </button>
                <button type="submit" disabled={sibuk || konfirmasi.trim() !== projectId}
                  className="rounded-lg bg-gagal px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                  {sibuk ? "Menghapus…" : "Hapus proyek permanen"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
