"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Feedback, Field, Input } from "@/components/ui";
import { useFocusTrap } from "@/components/use-focus-trap";

type InfoAkun = { ada: boolean; username: string };

export function AkunUjiProyek({
  projectId, bolehKelola,
}: { projectId: string; bolehKelola: boolean }) {
  const [akun, setAkun] = useState<InfoAkun>({ ada: false, username: "" });
  const [memuat, setMemuat] = useState(true);
  const [kelola, setKelola] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordTerlihat, setPasswordTerlihat] = useState<string | null>(null);
  const [konfirmasiHapus, setKonfirmasiHapus] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [berhasil, setBerhasil] = useState<string | null>(null);
  const url = `/api/v1/proyek/${encodeURIComponent(projectId)}/akun-uji`;
  const dialogHapusRef = useFocusTrap<HTMLElement>(konfirmasiHapus, () => setKonfirmasiHapus(false));
  const perubahan = useMemo(
    () => usernameDraft.trim() !== akun.username || passwordDraft.length > 0,
    [akun.username, passwordDraft, usernameDraft],
  );

  const muatAkun = useCallback(async (signal?: AbortSignal) => {
    setMemuat(true);
    setGalat(null);
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.pesan ?? "Akun uji tidak dapat dimuat.");
      setAkun({ ada: Boolean(hasil.ada), username: typeof hasil.username === "string" ? hasil.username : "" });
    } catch (error) {
      if (signal?.aborted) return;
      setGalat(error instanceof Error ? error.message : "Akun uji tidak dapat dimuat.");
    } finally {
      if (!signal?.aborted) setMemuat(false);
    }
  }, [url]);

  useEffect(() => {
    const controller = new AbortController();
    void muatAkun(controller.signal);
    return () => controller.abort();
  }, [muatAkun]);

  function bukaForm() {
    setUsernameDraft(akun.username);
    setPasswordDraft("");
    setPasswordTerlihat(null);
    setGalat(null);
    setBerhasil(null);
    setKelola(true);
  }

  function tutupForm() {
    setKelola(false);
    setPasswordDraft("");
    setPasswordTerlihat(null);
    setGalat(null);
  }

  async function tampilkanPassword() {
    setSibuk(true); setGalat(null);
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "lihat" }), cache: "no-store",
      });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.pesan ?? "Password akun uji tidak dapat dibuka.");
      if (typeof hasil.password !== "string") throw new Error("Respons password tidak sah.");
      setPasswordTerlihat(hasil.password);
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Password akun uji tidak dapat dibuka.");
    } finally { setSibuk(false); }
  }

  async function simpan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sibuk || !perubahan) return;
    setSibuk(true); setGalat(null); setBerhasil(null);
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "simpan", username: usernameDraft, password: passwordDraft }),
      });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.pesan ?? "Akun uji gagal disimpan.");
      setAkun({ ada: true, username: hasil.username });
      setPasswordDraft(""); setPasswordTerlihat(null); setKelola(false);
      setBerhasil("Akun uji berhasil disimpan secara terenkripsi.");
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Akun uji gagal disimpan.");
    } finally { setSibuk(false); }
  }

  async function hapusAkun() {
    if (sibuk) return;
    setSibuk(true); setGalat(null); setBerhasil(null);
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "hapus" }),
      });
      const hasil = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(hasil.pesan ?? "Akun uji gagal dihapus.");
      setAkun({ ada: false, username: "" });
      setPasswordTerlihat(null); setPasswordDraft(""); setUsernameDraft("");
      setKelola(false); setKonfirmasiHapus(false);
      setBerhasil("Akun uji telah dihapus.");
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Akun uji gagal dihapus.");
      setKonfirmasiHapus(false);
    } finally { setSibuk(false); }
  }

  return (
    <section aria-labelledby={`judul-akun-uji-${projectId}`} className="border-t border-garis px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`judul-akun-uji-${projectId}`} className="text-[13.5px] font-semibold text-tinta">
            Akun pengujian <span className="ml-1 text-[11.5px] font-normal text-tinta-3">opsional</span>
          </h3>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-tinta-3">
            Username dan password untuk masuk ke lingkungan SIT/UAT. Hanya Admin, Internal PSII, dan penguji yang ditugaskan yang dapat melihatnya; Pimpinan tidak memiliki akses.
          </p>
        </div>
        {bolehKelola && !memuat && (
          <Button type="button" variant="secondary" onClick={kelola ? tutupForm : bukaForm}
            disabled={sibuk} className="min-h-9 px-3 py-1.5 text-[12.5px]">
            {kelola ? "Tutup form" : akun.ada ? "Ubah akun uji" : "Tambahkan akun uji"}
          </Button>
        )}
      </div>

      {memuat ? (
        <p role="status" className="mt-3 text-[13px] text-tinta-3">Memuat akun uji…</p>
      ) : akun.ada ? (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-lg border border-garis bg-kanvas/50 px-3 py-2.5">
            <dt className="text-[11.5px] font-medium text-tinta-3">Username</dt>
            <dd className="mt-1 break-all text-[13.5px] font-medium text-tinta">{akun.username}</dd>
          </div>
          <div className="min-w-0 rounded-lg border border-garis bg-kanvas/50 px-3 py-2.5">
            <dt className="text-[11.5px] font-medium text-tinta-3">Password</dt>
            <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <code className="max-w-full break-all text-[13.5px] font-medium text-tinta">
                {passwordTerlihat ?? "••••••••"}
              </code>
              <Button type="button" variant="ghost" disabled={sibuk}
                aria-pressed={passwordTerlihat !== null}
                onClick={() => passwordTerlihat === null ? void tampilkanPassword() : setPasswordTerlihat(null)}
                className="min-h-8 px-2 py-1 text-[12px]">
                {sibuk ? "Memuat…" : passwordTerlihat === null ? "Tampilkan password" : "Sembunyikan"}
              </Button>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-garis px-3 py-3 text-[13px] text-tinta-3">
          Belum ada akun uji untuk proyek ini.
        </p>
      )}

      {galat && <Feedback kind="error" className="mt-3">{galat}</Feedback>}
      {berhasil && <div role="status" aria-live="polite"><Feedback kind="success" className="mt-3">{berhasil}</Feedback></div>}

      {kelola && bolehKelola && (
        <form onSubmit={simpan} className="mt-4 space-y-3 rounded-lg border border-garis bg-kanvas/40 p-3 sm:p-4" aria-busy={sibuk}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`akun-uji-username-${projectId}`} label="Username" required>
              <Input id={`akun-uji-username-${projectId}`} autoComplete="off" required maxLength={160}
                value={usernameDraft} onChange={(e) => setUsernameDraft(e.target.value)} disabled={sibuk} />
            </Field>
            <Field id={`akun-uji-password-${projectId}`} label={akun.ada ? "Password baru" : "Password"} optional={akun.ada} required={!akun.ada}>
              <Input id={`akun-uji-password-${projectId}`} type="password" autoComplete="new-password"
                required={!akun.ada} maxLength={256} value={passwordDraft}
                placeholder={akun.ada ? "Kosongkan untuk mempertahankan password saat ini" : "Masukkan password akun uji"}
                onChange={(e) => setPasswordDraft(e.target.value)} disabled={sibuk} />
            </Field>
          </div>
          <p className="text-[12px] leading-relaxed text-tinta-3">
            Password disimpan terenkripsi. Saat akun sudah ada, kosongkan field password jika hanya ingin mengubah username.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {akun.ada ? (
              <Button type="button" variant="danger-quiet" onClick={() => setKonfirmasiHapus(true)} disabled={sibuk}
                className="min-h-9 px-3 py-1.5 text-[12.5px]">Hapus akun uji</Button>
            ) : <span />}
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={tutupForm} disabled={sibuk}
                className="min-h-9 px-3 py-1.5 text-[12.5px]">Batal</Button>
              <Button type="submit" variant="primary" disabled={!perubahan || sibuk} busy={sibuk}
                className="min-h-9 px-3 py-1.5 text-[12.5px]">Simpan akun uji</Button>
            </div>
          </div>
        </form>
      )}

      {konfirmasiHapus && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
          <button type="button" aria-label="Tutup konfirmasi hapus akun uji" disabled={sibuk}
            onClick={() => setKonfirmasiHapus(false)} className="absolute inset-0 bg-tinta/45 disabled:cursor-wait" />
          <section ref={dialogHapusRef} tabIndex={-1} role="alertdialog" aria-modal="true"
            aria-labelledby={`judul-hapus-akun-uji-${projectId}`}
            className="relative z-10 w-full max-w-md rounded-xl border border-garis bg-kartu p-5 shadow-2xl">
            <h4 id={`judul-hapus-akun-uji-${projectId}`} className="text-[16px] font-semibold text-tinta">Hapus akun uji?</h4>
            <p className="mt-2 text-[13px] leading-relaxed text-tinta-2">Username dan password terenkripsi untuk proyek ini akan dihapus. Jejak audit hanya mencatat bahwa kredensial dihapus, bukan nilainya.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" onClick={() => setKonfirmasiHapus(false)} disabled={sibuk}>Batal</Button>
              <Button type="button" variant="danger" onClick={() => void hapusAkun()} busy={sibuk}>Hapus akun uji</Button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
