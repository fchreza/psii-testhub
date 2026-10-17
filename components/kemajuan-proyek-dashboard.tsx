import Link from "next/link";
import type { ModulDashboard, ProyekDashboard } from "@/lib/dashboard";
import { labelJenisPengujian } from "@/lib/fase-proyek";
import { cn } from "@/lib/format";
import { tanggalID } from "@/lib/waktu";

const LABEL_TAHAP: Record<string, string> = {
  PERSIAPAN: "Persiapan",
  SIT: "SIT",
  UAT: "UAT",
  WAITING_SIGNOFF: "Menunggu ttd",
  SELESAI: "Selesai",
};

function PersentaseModul({ modul, namaProyek }: { modul: ModulDashboard; namaProyek: string }) {
  const persen = (nilai: number) => (modul.total > 0 ? (nilai / modul.total) * 100 : 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 break-words text-[13.5px] text-tinta">
          <span className="tabular mr-1.5 rounded-sm bg-kanvas px-1.5 py-0.5 text-[12px] text-tinta-2">
            {modul.kode}
          </span>
          {modul.nama}
        </p>
        <p className="tabular text-[12.5px] text-tinta-3">
          {modul.lulus}/{modul.total} lulus
          {modul.gagal > 0 && <span className="text-gagal"> · {modul.gagal} gagal</span>}
          {modul.tertunda > 0 && <span className="text-tertunda"> · {modul.tertunda} tertunda</span>}
          {modul.belum > 0 && <span> · {modul.belum} belum diuji</span>}
        </p>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-kanvas"
        role="img"
        aria-label={`${modul.nama}, proyek ${namaProyek}: ${modul.lulus} lulus, ${modul.gagal} gagal, ${modul.tertunda} tertunda, ${modul.belum} belum diuji dari ${modul.total} skenario`}>
        {modul.lulus > 0 && <span aria-hidden="true" className="bg-lulus" style={{ width: `${persen(modul.lulus)}%` }} />}
        {modul.gagal > 0 && <span aria-hidden="true" className="bg-gagal" style={{ width: `${persen(modul.gagal)}%` }} />}
        {modul.tertunda > 0 && <span aria-hidden="true" className="bg-tertunda" style={{ width: `${persen(modul.tertunda)}%` }} />}
        {modul.belum > 0 && <span aria-hidden="true" className="bg-garis-kuat" style={{ width: `${persen(modul.belum)}%` }} />}
      </div>
    </div>
  );
}

function DetailModul({ proyek, modul }: { proyek: ProyekDashboard; modul: ModulDashboard[] }) {
  if (modul.length === 0) return null;
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-kanvas focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-aksi-lembut">
        <span className="min-w-0 text-[13px]">
          <span className="font-semibold text-tinta">Progres modul</span>
          <span className="ml-1 text-tinta-3">untuk proyek </span>
          <span className="font-medium text-tinta-2">{proyek.nama}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-aksi-lembut px-2 py-0.5 text-[11.5px] font-medium text-aksi">
            {modul.length} modul
          </span>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"
            className="h-4 w-4 text-tinta-3 transition-transform group-open:rotate-180 motion-reduce:transition-none">
            <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          </svg>
        </span>
      </summary>
      <div className="mt-1 rounded-lg border border-garis bg-kanvas/50 px-4 py-4 sm:px-5">
        <div className="space-y-4">
          {modul.map((m) => (
            <PersentaseModul key={`${m.project_id}-${m.kode}`} modul={m} namaProyek={proyek.nama} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-garis pt-3 text-[12px] text-tinta-3">
          {([ ["bg-lulus", "Lulus"], ["bg-gagal", "Gagal"], ["bg-tertunda", "Tertunda"], ["bg-garis-kuat", "Belum diuji"] ] as [string, string][]).map(([warna, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-xs", warna)} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </details>
  );
}

export function KemajuanProyekDashboard({
  proyek,
  modulPerProyek,
}: {
  proyek: ProyekDashboard[];
  modulPerProyek: ReadonlyMap<string, ModulDashboard[]>;
}) {
  const urut = [...proyek].sort((a, b) => {
    const persenA = a.total > 0 ? a.lulus / a.total : 0;
    const persenB = b.total > 0 ? b.lulus / b.total : 0;
    return persenA - persenB;
  });

  return (
    <section aria-label="Kemajuan per proyek" className="mb-6">
      <h2 className="mb-2 text-[15px] font-semibold text-tinta">Kemajuan per proyek</h2>
      <div role="region" aria-label="Kemajuan proyek dan modul" tabIndex={0}
        className="overflow-x-auto rounded-lg border border-garis bg-kartu focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-aksi-lembut">
        <table className="w-full min-w-[900px] border-collapse text-[13.5px]">
          <caption className="sr-only">
            Tingkat kelulusan tiap proyek. Progres modul berada di bawah proyek induknya dan dapat dibuka.
            Angka kelulusan proyek dihitung dari seluruh skenario, termasuk yang belum diuji.
          </caption>
          <thead>
            <tr className="border-b border-garis bg-kanvas text-left">
              {["Proyek", "Jenis pengujian", "Tahap", "Kelulusan", "Lulus / total", "Kendala", "Target"].map((judul) => (
                <th key={judul} scope="col" className="whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-tinta-3">
                  {judul}
                </th>
              ))}
            </tr>
          </thead>
          {urut.map((p) => {
            const persen = p.total > 0 ? Math.round((p.lulus / p.total) * 100) : 0;
            const kendala = p.gagal + p.tertunda;
            const modul = modulPerProyek.get(p.id) ?? [];
            return (
              <tbody key={p.id}>
                <tr className="border-b border-garis">
                  <td className="px-3 py-2.5">
                    <Link href={`/proyek/${p.id}`} className="font-medium text-tinta hover:text-aksi">
                      {p.nama}
                    </Link>
                    {(p.aplikasi ?? p.modul_aplikasi) || p.modul ? (
                      <span className="mt-0.5 block text-[12px] text-tinta-3">
                        {[p.aplikasi ?? p.modul_aplikasi, p.modul].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-tinta-2">{labelJenisPengujian(p.jenis_pengujian)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-tinta-2">
                    {LABEL_TAHAP[p.tahap] ?? p.tahap}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-kanvas" aria-hidden="true">
                        <span className={cn("block h-full rounded-full",
                          persen >= 80 ? "bg-lulus" : persen >= 40 ? "bg-tertunda" : "bg-gagal")}
                          style={{ width: `${persen === 0 ? 0 : Math.max(3, persen)}%` }} />
                      </span>
                      <span className="tabular text-[13px] font-medium text-tinta">{persen}%</span>
                    </span>
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2.5 text-tinta-2">{p.lulus} / {p.total}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {kendala > 0 ? (
                      <span className="text-[12.5px] font-medium text-gagal">
                        {p.gagal > 0 && `${p.gagal} gagal`}
                        {p.gagal > 0 && p.tertunda > 0 && " · "}
                        {p.tertunda > 0 && `${p.tertunda} tertunda`}
                      </span>
                    ) : <span className="text-[12.5px] text-tinta-3">—</span>}
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2.5 text-[12.5px] text-tinta-2">
                    {p.target_selesai ? tanggalID(p.target_selesai) : "—"}
                  </td>
                </tr>
                {modul.length > 0 && (
                  <tr className="border-b border-garis">
                    <td colSpan={7} className="px-2 py-1.5 sm:px-3">
                      <DetailModul proyek={p} modul={modul} />
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}
