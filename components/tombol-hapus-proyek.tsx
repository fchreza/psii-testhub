"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "@/components/use-focus-trap";
import { Button, Feedback, Input } from "@/components/ui";

export function TombolHapusProyek({ projectId, nama }: { projectId: string; nama: string }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<{ jenis: "sukses" | "peringatan"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const tutup = () => {
    if (sibuk) return;
    setBuka(false);
    setKonfirmasi("");
    setGalat(null);
  };
  const dialogRef = useFocusTrap<HTMLElement>(buka, tutup);

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
      setBuka(false);
      setKonfirmasi("");
      setInfo(hasil.buktiGagal > 0
        ? { jenis: "peringatan", teks: `Proyek berhasil dihapus. ${hasil.buktiGagal} berkas bukti gagal dibersihkan dari penyimpanan.` }
        : { jenis: "sukses", teks: "Proyek berhasil dihapus." });
      window.setTimeout(() => router.replace("/proyek"), 1100);
    } catch {
      setGalat("Tidak dapat terhubung. Proyek belum dapat dipastikan terhapus; muat ulang daftar sebelum mencoba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <>
      <Button variant="danger-quiet" onClick={() => { setGalat(null); setInfo(null); setBuka(true); }}
        className="min-h-9 px-2 py-1 text-[13px]">
        Hapus
      </Button>
      {info && <Feedback kind={info.jenis === "peringatan" ? "warning" : "success"} className="mt-2">{info.teks} Mengalihkan ke daftar proyek…</Feedback>}
      {buka && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Tutup konfirmasi penghapusan" onClick={tutup}
            className="absolute inset-0 bg-tinta/45" />
          <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="judul-hapus-proyek"
            className="relative z-10 w-full max-w-lg rounded-xl border border-garis bg-kartu p-5 shadow-2xl sm:p-6">
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
              <Input id={`konfirmasi-hapus-${projectId}`} autoComplete="off" autoFocus value={konfirmasi}
                onChange={(e) => setKonfirmasi(e.target.value)} disabled={sibuk}
                className="font-mono focus:border-gagal focus-visible:ring-gagal-lembut" />
              {galat && <Feedback kind="error" className="mt-2">{galat}</Feedback>}
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={tutup} disabled={sibuk}>Batal</Button>
                <Button type="submit" variant="danger" busy={sibuk} disabled={konfirmasi.trim() !== projectId}>
                  {sibuk ? "Menghapus…" : "Hapus proyek permanen"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
