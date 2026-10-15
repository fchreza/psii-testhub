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
      <body className="font-sans">{children}</body>
    </html>
  );
}
