import type { Config } from "tailwindcss";

/**
 * Token warna.
 *
 * Dipilih tenang dan netral: ini alat kerja yang dibuka berjam-jam oleh
 * penguji yang sedang mencatat hasil, bukan halaman pemasaran. Warna dipakai
 * HANYA untuk makna status, bukan hiasan.
 *
 * Warna status uji mengikuti konvensi yang sudah dikenal tim di spreadsheet:
 * hijau = lulus, merah = gagal, kuning = tertunda, abu = belum diuji.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        kanvas: "#F7F8FA",
        kartu: "#FFFFFF",
        garis: "#E4E7EC",
        "garis-kuat": "#98A2B3",
        tinta: "#101828",
        "tinta-2": "#475467",
        "tinta-3": "#667085",
        aksi: "#1570EF",
        "aksi-lembut": "#EFF8FF",
        lulus: "#067647",
        "lulus-lembut": "#ECFDF3",
        gagal: "#B42318",
        "gagal-lembut": "#FEF3F2",
        tertunda: "#B54708",
        "tertunda-lembut": "#FFFAEB",
      },
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
