import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Inter dipakai karena punya angka tabular dan x-height tinggi — penting untuk
 * tabel yang berisi tanggal, persentase, dan hitungan skenario.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "PSII TestHub",
  description: "Manajemen pengujian SIT & UAT",
  // Tidak boleh masuk mesin pencari: ini alat internal.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body className="font-sans">
        <a href="#konten-utama" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-100 focus:rounded-lg focus:bg-aksi focus:px-4 focus:py-3 focus:font-semibold focus:text-white">
          Lewati ke konten utama
        </a>
        {children}
      </body>
    </html>
  );
}
