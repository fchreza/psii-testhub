"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TabelSkenario, type Modul, type Orang, type Skenario } from "@/components/tabel-skenario";
import { useFocusTrap } from "@/components/use-focus-trap";
import { Button, Feedback } from "@/components/ui";
import type { FasePengujian } from "@/lib/fase-proyek";

type Statistik = { total: number; lulus: number; gagal: number; tertunda: number; belum: number };

type Props = {
  projectId: string;
  fase: FasePengujian;
  faseTersedia: FasePengujian[];
  skenarioAwal: Skenario[];
  statistikAwal: Statistik;
  modul: Modul[];
  orang: Orang[];
  sayaId: string;
  bolehUbah: boolean;
  bolehKelolaSkenario: boolean;
};

export function AreaSkenarioProyek({
  projectId, fase, faseTersedia, skenarioAwal, statistikAwal, modul, orang, sayaId,
  bolehUbah, bolehKelolaSkenario,
}: Props) {
  const [skenario, setSkenario] = useState(skenarioAwal);
  const [statistik, setStatistik] = useState(statistikAwal);
  const [menyegarkan, setMenyegarkan] = useState(false);
  const [drafAktif, setDrafAktif] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "status" | "galat" | "peringatan"; teks: string } | null>(null);
  const [tautanTertunda, setTautanTertunda] = useState<string | null>(null);
  const pengendali = useRef<AbortController | null>(null);
  const pengaturRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTertunda = useRef(false);
  const router = useRouter();
  const dialogNavigasiRef = useFocusTrap<HTMLElement>(tautanTertunda !== null, () => setTautanTertunda(null));

  useEffect(() => {
    setSkenario(skenarioAwal);
    setStatistik(statistikAwal);
  }, [skenarioAwal, statistikAwal]);

  const segarkan = useCallback(async (manual: boolean) => {
    if (drafAktif) {
      refreshTertunda.current = true;
      if (manual) setPesan({ jenis: "peringatan", teks: "Selesaikan atau buang draf skenario sebelum memperbarui data." });
      return;
    }
    pengendali.current?.abort();
    const controller = new AbortController();
    pengendali.current = controller;
    setMenyegarkan(true);
    setPesan(null);

    try {
      const url = `/api/v1/proyek/${encodeURIComponent(projectId)}/ringkasan?fase=${encodeURIComponent(fase)}`;
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const hasil = await response.json().catch(() => ({ pesan: "Respons server tidak dapat dibaca." }));
      if (!response.ok) throw new Error(hasil.pesan ?? "Data proyek belum dapat diperbarui.");
      if (!Array.isArray(hasil.skenario) || !hasil.statistik) {
        throw new Error("Format data terbaru tidak sesuai. Coba perbarui lagi.");
      }
      if (controller.signal.aborted) return;

      setSkenario(hasil.skenario as Skenario[]);
      setStatistik(hasil.statistik as Statistik);
      setPesan({
        jenis: "status",
        teks: manual ? "Tabel skenario dan statistik sudah diperbarui." : "Perubahan tersimpan; tabel dan statistik sudah disinkronkan.",
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        setPesan({
          jenis: "galat",
          teks: error instanceof Error ? error.message : "Tidak dapat memperbarui data. Periksa koneksi lalu coba lagi.",
        });
      }
    } finally {
      if (pengendali.current === controller) {
        pengendali.current = null;
        setMenyegarkan(false);
      }
    }
  }, [projectId, fase, drafAktif]);

  const jadwalkanRefresh = useCallback(() => {
    if (pengaturRefresh.current) clearTimeout(pengaturRefresh.current);
    pengaturRefresh.current = setTimeout(() => {
      pengaturRefresh.current = null;
      void segarkan(false);
    }, 250);
  }, [segarkan]);

  useEffect(() => {
    if (drafAktif) {
      pengendali.current?.abort();
      const jagaKeluar = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
      const jagaNavigasi = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const tautan = target.closest("nav a[href]") as HTMLAnchorElement | null;
        if (!tautan || tautan.target === "_blank" || !tautan.href.startsWith(window.location.origin)) return;
        if (tautan.href === window.location.href) return;
        event.preventDefault();
        event.stopPropagation();
        setTautanTertunda(tautan.href);
      };
      window.addEventListener("beforeunload", jagaKeluar);
      document.addEventListener("click", jagaNavigasi, true);
      return () => {
        window.removeEventListener("beforeunload", jagaKeluar);
        document.removeEventListener("click", jagaNavigasi, true);
      };
    }
    if (refreshTertunda.current) {
      refreshTertunda.current = false;
      if (pengaturRefresh.current) {
        clearTimeout(pengaturRefresh.current);
        pengaturRefresh.current = null;
      }
      void segarkan(false);
    }
  }, [drafAktif, segarkan]);

  useEffect(() => () => {
    if (pengaturRefresh.current) clearTimeout(pengaturRefresh.current);
    pengendali.current?.abort();
  }, []);

  const persen = statistik.total > 0 ? Math.round((statistik.lulus / statistik.total) * 100) : 0;
  const kartu = [
    ["Total", statistik.total, "text-tinta"],
    ["Lulus", statistik.lulus, "text-lulus"],
    ["Gagal", statistik.gagal, "text-gagal"],
    ["Tertunda", statistik.tertunda, "text-tertunda"],
    ["Belum diuji", statistik.belum, "text-tinta-3"],
    ["Kelulusan", `${persen}%`, "text-tinta"],
  ] as const;

  return (
    <>
      <section aria-label={`Ringkasan fase ${fase}`} aria-busy={menyegarkan} className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-tinta-3">Ringkasan fase {fase}</p>
          <Button type="button" variant="secondary" onClick={() => void segarkan(true)} disabled={drafAktif}
            busy={menyegarkan}
            title={drafAktif ? "Selesaikan atau buang draf sebelum refresh" : undefined}
            className="min-h-9 px-3 py-1.5 text-[12.5px]">
            {!menyegarkan && (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                <path d="M5.6 9a7 7 0 0 1 12.1-2.3L20 12M4 12l2.3 5.3A7 7 0 0 0 18.4 15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
            )}
            {menyegarkan ? "Memperbarui…" : drafAktif ? "Draf belum disimpan" : "Refresh tabel & statistik"}
          </Button>
        </div>
        {pesan && (
          <Feedback kind={pesan.jenis === "galat" ? "error" : pesan.jenis === "peringatan" ? "warning" : "success"} className="mb-2">
            {pesan.teks}
          </Feedback>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {kartu.map(([label, nilai, warna]) => (
            <div key={label} className="rounded-lg border border-garis bg-kartu px-3.5 py-3">
              <p className="text-[12px] font-medium uppercase tracking-wide text-tinta-3">{label}</p>
              <p className={`tabular mt-0.5 text-[22px] font-bold leading-none ${warna}`}>{nilai}</p>
            </div>
          ))}
        </div>
      </section>

      <nav aria-label="Tahap pengujian" className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-garis pb-3">
        {faseTersedia.map((tahap) => (
          <Link key={tahap} href={`/proyek/${projectId}?fase=${tahap}`}
            aria-current={tahap === fase ? "page" : undefined}
            className={tahap === fase
              ? "rounded-md bg-aksi px-3 py-2 text-[13.5px] font-medium text-white"
              : "rounded-md px-3 py-2 text-[13.5px] text-tinta-2 hover:bg-kartu"}>
            Tahap {tahap}
            {tahap === fase && <span className="ml-1.5 tabular opacity-80">{skenario.filter((x) => !x.id.startsWith("draft:")).length}</span>}
          </Link>
        ))}
      </nav>

      <TabelSkenario
        projectId={projectId}
        fase={fase}
        skenarioAwal={skenario}
        modul={modul}
        orang={orang}
        sayaId={sayaId}
        bolehUbah={bolehUbah}
        bolehKelolaSkenario={bolehKelolaSkenario}
        onDataMutasi={jadwalkanRefresh}
        onDraftChange={setDrafAktif}
      />
      {tautanTertunda && (
        <div className="fixed inset-0 z-80 flex items-center justify-center bg-tinta/50 p-4 backdrop-blur-[2px]">
          <section ref={dialogNavigasiRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="judul-tinggalkan-draf"
            className="w-full max-w-sm rounded-xl border border-garis bg-kartu p-5 shadow-2xl">
            <h2 id="judul-tinggalkan-draf" className="text-[16px] font-semibold text-tinta">Tinggalkan draf?</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-tinta-2">Ada perubahan skenario yang belum disimpan. Jika melanjutkan, draf tersebut akan dibuang.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button autoFocus onClick={() => setTautanTertunda(null)}>Tetap di halaman</Button>
              <Button variant="danger" onClick={() => {
                const tujuan = tautanTertunda;
                setTautanTertunda(null);
                if (tujuan) {
                  const url = new URL(tujuan);
                  router.push(`${url.pathname}${url.search}${url.hash}`);
                }
              }}>
                Buang draf &amp; lanjutkan
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
