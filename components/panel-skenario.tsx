"use client";

import { useEffect, useState } from "react";
import { cn, STATUS_UJI, labelStatus } from "@/lib/format";
import { capWaktuID } from "@/lib/waktu";
import { BuktiSkenario } from "./bukti-skenario";
import type { Skenario } from "./tabel-skenario";

type Riwayat = {
  id: number; aksi: string; kolom: string | null;
  nilai_lama: string | null; nilai_baru: string | null;
  pada: string; oleh: string | null;
};

/**
 * Panel detail skenario.
 *
 * KENAPA PANEL MENDORONG TABEL, bukan menutupinya:
 * Penguji sering perlu melihat baris LAIN sambil mengisi satu skenario —
 * misalnya menyamakan catatan dengan skenario di atasnya. Panel yang menutupi
 * memaksa menutup-buka terus-menerus.
 *
 * KENAPA DORONGANNYA HANYA DI LAYAR LEBAR (>= 640px):
 * Di ponsel tidak ada ruang untuk mendorong; kalau dipaksa, tabelnya jadi
 * beberapa piksel dan panelnya sendiri tetap sempit. Di ponsel panelnya
 * menutup penuh — dan itu memang yang diinginkan di layar kecil.
 */
export function PanelSkenario({
  skenario, projectId, bolehUbah, bolehKelolaSkenario, onTutup, onUbah,
}: {
  skenario: Skenario; projectId: string; bolehUbah: boolean; bolehKelolaSkenario: boolean;
  onTutup: () => void; onUbah: (tambalan: Partial<Skenario>) => void;
}) {
  const [riwayat, setRiwayat] = useState<Riwayat[]>([]);
  const st = STATUS_UJI[skenario.status as keyof typeof STATUS_UJI] ?? STATUS_UJI.PENDING;

  // Escape menutup panel. KENAPA TIDAK DIBLOKIR SAAT FOKUS DI ISIAN:
  // setelah mengetik, fokus MEMANG ada di isian — kalau diblokir, Escape mati
  // tepat saat paling dibutuhkan.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onTutup(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onTutup]);

  /*
   * Dorong isi halaman ke kiri selama panel ini terbuka.
   *
   * KENAPA MENULIS KE DOM LANGSUNG, BUKAN LEWAT STATE:
   * <main> berada di luar pohon komponen ini (dibuat oleh halaman, bukan oleh
   * tabel), jadi tidak ada props yang bisa menjangkaunya. Atributnya dipasang
   * di sini dan aturan padding-nya ada di globals.css — dipisah supaya halaman
   * lain yang memakai panel ini tidak perlu mengulang logika yang sama.
   */
  useEffect(() => {
    const m = document.querySelector("main");
    if (!m) return;
    m.setAttribute("data-panel", "buka");
    return () => m.removeAttribute("data-panel");
  }, []);

  useEffect(() => {
    let batal = false;
    void (async () => {
      const r = await fetch(`/api/v1/riwayat?scenarioId=${skenario.id}`);
      if (!r.ok || batal) return;
      const j = await r.json();
      setRiwayat(j.riwayat ?? []);
    })();
    return () => { batal = true; };
  }, [skenario.id, skenario.diubah_pada]);

  return (
    <>
      <button type="button" aria-label="Tutup panel" onClick={onTutup}
        className="fixed inset-0 z-30 bg-tinta/10" />

      <aside role="dialog" aria-label={`Detail ${skenario.kode}`}
        className={cn(
          "fixed right-0 top-0 z-40 h-screen w-full overflow-y-auto border-l border-garis bg-kartu",
          "sm:w-[42%] sm:max-w-[620px]",
        )}>
        <header className="sticky top-0 z-10 border-b border-garis bg-kartu px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="tabular text-[12.5px] font-medium text-tinta-3">
                {skenario.kode} · Tahap {skenario.fase}
              </p>
              <h2 className="mt-0.5 text-[18px] font-bold leading-snug tracking-tight text-tinta">
                {skenario.judul}
              </h2>
            </div>
            <button type="button" onClick={onTutup} aria-label="Tutup"
              className="shrink-0 rounded px-2 py-1 text-[13px] text-tinta-3 hover:bg-kanvas hover:text-tinta">
              Tutup
            </button>
          </div>
        </header>

        <div className="space-y-5 px-6 py-5">
          <Bagian judul="Judul skenario">
            <Teks nilai={skenario.judul} kosong="Judul belum diisi"
              bolehUbah={bolehKelolaSkenario} onSimpan={(v) => onUbah({ judul: v })} />
          </Bagian>

          {/* Sifat: label kiri kecil dan redup, nilai kanan lebih terang.
              Susunan ini yang membuat panel terbaca cepat — mata menyapu kolom
              label, bukan membaca kalimat. */}
          <dl className="space-y-2.5">
            <Sifat label="Status">
              {bolehUbah ? (
                <select value={skenario.status}
                  onChange={(e) => onUbah({ status: e.target.value })}
                  className={cn("rounded px-2 py-1 text-[13.5px] font-medium", st.kelas)}>
                  {["PENDING","PASS","FAIL","BLOCKED"].map((x) => (
                    <option key={x} value={x}>{labelStatus(x)}</option>
                  ))}
                </select>
              ) : (
                <span className={cn("rounded px-2 py-1 text-[13.5px] font-medium", st.kelas)}>
                  {labelStatus(skenario.status)}
                </span>
              )}
            </Sifat>

            <Sifat label="Penguji">{skenario.penguji_nama ?? "—"}</Sifat>
            <Sifat label="Bukti">
              {skenario.jumlah_bukti > 0 ? `${skenario.jumlah_bukti} berkas` : "belum ada"}
            </Sifat>
            <Sifat label="Diubah">{capWaktuID(skenario.diubah_pada)}</Sifat>
          </dl>

          <Bagian judul="Langkah pengujian">
            <Teks nilai={skenario.langkah_pengujian} kosong="Belum diisi"
              bolehUbah={bolehKelolaSkenario} onSimpan={(v) => onUbah({ langkah_pengujian: v })} />
          </Bagian>

          <Bagian judul="Hasil yang diharapkan">
            <Teks nilai={skenario.hasil_diharapkan} kosong="Belum diisi"
              bolehUbah={bolehKelolaSkenario} onSimpan={(v) => onUbah({ hasil_diharapkan: v })} />
          </Bagian>

          <Bagian judul="Hasil aktual / temuan">
            <Teks nilai={skenario.hasil_aktual} kosong="Catat apa yang benar-benar terjadi saat pengujian"
              bolehUbah={bolehUbah} onSimpan={(v) => onUbah({ hasil_aktual: v })} />
          </Bagian>

          <Bagian judul="Catatan tindak lanjut">
            <Teks nilai={skenario.catatan_tindak_lanjut}
              kosong={skenario.status === "FAIL" || skenario.status === "BLOCKED"
                ? "WAJIB diisi untuk status Gagal atau Tertunda" : "Belum ada catatan"}
              bolehUbah={bolehUbah} onSimpan={(v) => onUbah({ catatan_tindak_lanjut: v })}
              sorot={skenario.status === "FAIL" || skenario.status === "BLOCKED"} />
          </Bagian>

          <div className="border-t border-garis pt-4">
            <BuktiSkenario projectId={projectId} scenarioId={skenario.id} bolehUbah={bolehUbah} bolehHapus={bolehKelolaSkenario} />
          </div>

          {/* Riwayat perubahan: NFR-1 mewajibkan jejak, dan jejak yang tidak
              bisa dilihat tidak ada gunanya saat menelusuri masalah. */}
          <div className="border-t border-garis pt-4">
            <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">
              Riwayat perubahan
            </p>
            {riwayat.length === 0 ? (
              <p className="text-[13px] text-tinta-3">Belum ada perubahan tercatat</p>
            ) : (
              <ul className="space-y-2">
                {riwayat.map((x) => (
                  <li key={x.id} className="border-l-2 border-garis pl-3">
                    <p className="text-[13px] text-tinta-2">
                      {x.aksi === "ubah_status" ? "Status" : x.aksi === "unggah_bukti" ? "Bukti" : "Catatan"}
                      {x.nilai_lama && x.nilai_baru && x.kolom === "status" ? (
                        <>: {labelStatus(x.nilai_lama)} → <strong className="font-semibold">{labelStatus(x.nilai_baru)}</strong></>
                      ) : x.nilai_baru ? (
                        <>: {x.nilai_baru.length > 60 ? x.nilai_baru.slice(0, 60) + "…" : x.nilai_baru}</>
                      ) : null}
                    </p>
                    <p className="text-[12px] text-tinta-3">
                      {x.oleh ?? "tidak diketahui"} · {capWaktuID(x.pada)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function Sifat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-[92px] shrink-0 pt-0.5 text-[13px] text-tinta-3">{label}</dt>
      <dd className="min-w-0 flex-1 text-[13.5px] text-tinta-2">{children}</dd>
    </div>
  );
}

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">{judul}</p>
      {children}
    </section>
  );
}

function Teks({
  nilai, kosong, bolehUbah, onSimpan, sorot,
}: {
  nilai: string | null; kosong: string; bolehUbah: boolean;
  onSimpan: (v: string) => void; sorot?: boolean;
}) {
  const [buka, setBuka] = useState(false);
  const [draf, setDraf] = useState(nilai ?? "");

  if (!bolehUbah) {
    return (
      <p className={cn("whitespace-pre-wrap text-[13.5px] leading-relaxed",
        nilai ? "text-tinta-2" : "text-tinta-3")}>
        {nilai || kosong}
      </p>
    );
  }

  if (!buka) {
    return (
      <button type="button" onClick={() => { setDraf(nilai ?? ""); setBuka(true); }}
        className={cn("block w-full whitespace-pre-wrap rounded px-2 py-1.5 text-left text-[13.5px] leading-relaxed hover:bg-kanvas",
          nilai ? "text-tinta-2" : "text-tinta-3",
          sorot && !nilai && "ring-1 ring-gagal/40")}>
        {nilai || kosong}
      </button>
    );
  }

  return (
    <textarea autoFocus rows={4} value={draf}
      onChange={(e) => setDraf(e.target.value)}
      onBlur={() => { setBuka(false); if (draf !== (nilai ?? "")) onSimpan(draf); }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); setDraf(nilai ?? ""); setBuka(false); }
      }}
      className="w-full rounded border border-aksi bg-kartu px-2 py-1.5 text-[13.5px] leading-relaxed text-tinta-2 outline-none" />
  );
}
