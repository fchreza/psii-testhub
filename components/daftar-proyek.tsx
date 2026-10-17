import type { ReactNode } from "react";
import { TombolHapusProyek } from "@/components/tombol-hapus-proyek";
import { TautanBukaProyek } from "@/components/tautan-buka-proyek";
import { tanggalID } from "@/lib/waktu";
import { labelJenisPengujian } from "@/lib/fase-proyek";

export type BarisProyek = {
  id: string;
  nama: string;
  aplikasi: string | null;
  modul: string | null;
  modul_aplikasi: string | null;
  jenis_pengujian: string;
  tahap: string;
  lingkungan: string;
  tanggal_mulai: string | Date | null;
  target_selesai: string | Date | null;
  pm_nama: string | null;
  total: number;
  lulus: number;
  gagal: number;
  tertunda: number;
  belum: number;
};

type Props = {
  daftar: BarisProyek[];
  lihatSemua: boolean;
  dapatMengelola: boolean;
  peran: string;
};

const LABEL_TAHAP: Record<string, string> = {
  PERSIAPAN: "Persiapan",
  SIT: "Sedang SIT",
  UAT: "Sedang UAT",
  WAITING_SIGNOFF: "Menunggu tanda tangan",
  SELESAI: "Selesai",
};

const WARNA_TAHAP: Record<string, string> = {
  PERSIAPAN: "border border-garis bg-kanvas text-tinta-2",
  SIT: "border border-cyan-200 bg-cyan-50 text-cyan-800",
  UAT: "border border-blue-200 bg-blue-50 text-blue-800",
  WAITING_SIGNOFF: "border border-tertunda/25 bg-tertunda-lembut text-tertunda",
  SELESAI: "border border-lulus/25 bg-lulus-lembut text-lulus",
};

function LencanaTahap({ tahap }: { tahap: string }) {
  return (
    <span className={`inline-flex w-fit shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-semibold ${WARNA_TAHAP[tahap] ?? "border border-garis bg-kanvas text-tinta-2"}`}>
      {LABEL_TAHAP[tahap] ?? tahap}
    </span>
  );
}

function aplikasiModul(p: BarisProyek) {
  return [p.aplikasi ?? p.modul_aplikasi, p.modul].filter(Boolean).join(" · ") || "—";
}

function periode(p: BarisProyek) {
  const mulai = p.tanggal_mulai ? tanggalID(p.tanggal_mulai) : null;
  const selesai = p.target_selesai ? tanggalID(p.target_selesai) : null;
  return mulai && selesai ? `${mulai} – ${selesai}` : mulai ?? selesai ?? "—";
}

function persenLulus(p: BarisProyek) {
  return p.total > 0 ? Math.round((p.lulus / p.total) * 100) : 0;
}

function Kelulusan({ proyek }: { proyek: BarisProyek }) {
  const persen = persenLulus(proyek);
  return (
    <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
      <span role="progressbar" aria-label={`Skenario lulus untuk ${proyek.nama}`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={persen}
        aria-valuetext={`${proyek.lulus} dari ${proyek.total} skenario lulus (${persen}%)`}
        className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-kanvas">
        <span className="block h-full rounded-full bg-lulus" style={{ width: `${persen}%` }} />
      </span>
      <span className="tabular text-[12.5px] text-tinta-2">{persen}% · {proyek.lulus}/{proyek.total}</span>
    </div>
  );
}

function AksiProyek({ proyek, peran }: { proyek: BarisProyek; peran: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <TautanBukaProyek href={`/proyek/${proyek.id}`} aria-label={`Buka proyek ${proyek.nama}`}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-aksi px-3 py-2 text-[13px] font-semibold text-white shadow-xs hover:bg-aksi/90 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-aksi-lembut">
        Buka proyek
      </TautanBukaProyek>
      {peran === "ADMIN" && <TombolHapusProyek projectId={proyek.id} nama={proyek.nama} />}
    </div>
  );
}

function DataKartu({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-tinta-3">{label}</dt>
      <dd className="mt-1 min-w-0 text-[13px] leading-snug text-tinta-2">{children}</dd>
    </div>
  );
}

function KartuProyek({ proyek, peran }: { proyek: BarisProyek; peran: string }) {
  const kendala = proyek.gagal + proyek.tertunda;
  return (
    <article className="flex h-full min-w-0 flex-col rounded-lg border border-garis bg-kartu p-4 shadow-xs">
      <header className="flex min-w-0 flex-col items-start gap-2">
        <h2 className="min-w-0 break-words text-[15px] font-semibold leading-snug text-tinta">
          <TautanBukaProyek href={`/proyek/${proyek.id}`} aria-label={`Buka proyek ${proyek.nama}`}
            className="rounded-sm hover:text-aksi focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-aksi-lembut">
            {proyek.nama}
          </TautanBukaProyek>
        </h2>
        <span className="max-w-full break-all font-mono text-[11px] text-tinta-3">{proyek.id}</span>
        <LencanaTahap tahap={proyek.tahap} />
      </header>

      <dl className="mt-4 flex-1 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-garis pt-3">
        <DataKartu label="Aplikasi / modul" className="col-span-2">
          <span className="break-words">{aplikasiModul(proyek)}</span>
        </DataKartu>
        <DataKartu label="Jenis pengujian">{labelJenisPengujian(proyek.jenis_pengujian)}</DataKartu>
        <DataKartu label="Periode"><span className="break-words">{periode(proyek)}</span></DataKartu>
        <DataKartu label="Kelulusan" className="col-span-2"><Kelulusan proyek={proyek} /></DataKartu>
        <DataKartu label="Kendala" className="col-span-2">
          {kendala > 0 ? <span className="font-medium text-gagal">{kendala} perlu tindak lanjut</span> : "—"}
        </DataKartu>
      </dl>

      <div className="mt-4 border-t border-garis pt-3">
        <AksiProyek proyek={proyek} peran={peran} />
      </div>
    </article>
  );
}

export function DaftarProyek({ daftar, lihatSemua, dapatMengelola, peran }: Props) {
  if (daftar.length === 0) {
    return (
      <div className="rounded-lg border border-garis bg-kartu px-6 py-12 text-center">
        <p className="text-[15px] font-medium text-tinta">Belum ada proyek</p>
        <p className="mx-auto mt-1 max-w-md text-[14px] leading-relaxed text-tinta-2">
          {lihatSemua
            ? dapatMengelola
              ? "Proyek adalah wadah untuk skenario SIT dan UAT. Tekan tombol di atas untuk membuat yang pertama."
              : "Belum ada proyek di portofolio yang dapat Anda lihat."
            : "Anda belum ditambahkan sebagai anggota proyek mana pun. Hubungi admin."}
        </p>
      </div>
    );
  }

  return (
    <div role="region" aria-label="Daftar proyek pengujian"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {daftar.map((proyek) => <KartuProyek key={proyek.id} proyek={proyek} peran={peran} />)}
    </div>
  );
}
