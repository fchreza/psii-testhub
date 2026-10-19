import PDFDocument from "pdfkit";
import path from "node:path";
import type { SnapshotLaporan, SkenarioLaporan } from "./laporan-final-types";

const PAGE = { width: 595.28, height: 841.89, left: 48, right: 48, top: 74, bottom: 785 };
const C = {
  ink: "#172B3A", navy: "#123447", teal: "#167C80", tealPale: "#E8F4F3",
  muted: "#5D6B73", line: "#D9E2E5", paper: "#FFFFFF", pale: "#F3F7F8",
  amber: "#8A5A00", amberPale: "#FFF4D7", green: "#176B4A", greenPale: "#E7F4ED",
  red: "#9D3434", redPale: "#FBECEC", gray: "#53616A", grayPale: "#EDF1F3",
};
const FONT_REG = path.join(process.cwd(), "public/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "public/fonts/DejaVuSans-Bold.ttf");

function teks(value: string | null | undefined): string {
  const cleaned = value?.trim();
  return cleaned ? cleaned : "Tidak tercatat";
}
function angka(value: number): string { return Number.isFinite(value) ? String(value) : "0"; }
function statusColor(status: string): { text: string; fill: string; label: string } {
  if (status === "PASS") return { text: C.green, fill: C.greenPale, label: "LULUS" };
  if (status === "FAIL") return { text: C.red, fill: C.redPale, label: "GAGAL" };
  if (status === "BLOCKED") return { text: C.amber, fill: C.amberPale, label: "TERTUNDA" };
  return { text: C.gray, fill: C.grayPale, label: "BELUM DIUJI" };
}
function wrapLines(doc: PDFKit.PDFDocument, text: string, width: number, font: string, size: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r/g, "").split("\n");
  doc.font(font).fontSize(size);
  for (const paragraph of paragraphs) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (doc.widthOfString(candidate) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      if (doc.widthOfString(word) <= width) { line = word; continue; }
      // Break pathological, unspaced values without clipping the right edge.
      let part = "";
      for (const char of word) {
        if (part && doc.widthOfString(part + char) > width) { lines.push(part); part = char; }
        else part += char;
      }
      line = part;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

export async function buatPdfLaporan(snapshot: SnapshotLaporan): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: PAGE.top, bottom: 56, left: PAGE.left, right: PAGE.right }, compress: true, info: {
    Title: `Laporan Akhir UAT — ${snapshot.proyek.nama}`,
    Author: snapshot.dibuatOleh || "PSII TestHub",
    Subject: `Dokumen ${snapshot.dokumenId}, versi ${snapshot.versi}`,
    Creator: "PSII TestHub — renderer lokal",
  } });
  doc.registerFont("Body", FONT_REG);
  doc.registerFont("Strong", FONT_BOLD);
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  let pageNo = 1;
  const chrome = (number: number) => {
    // Footer is deliberately below the content margin; temporarily relax PDFKit's
    // text-flow limit so drawing it cannot recursively create additional pages.
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 8;
    doc.save();
    doc.rect(0, 0, PAGE.width, 7).fill(C.teal);
    doc.font("Strong").fontSize(8).fillColor(C.navy).text("PSII TESTHUB", PAGE.left, 27, { lineBreak: false });
    doc.font("Body").fontSize(8).fillColor(C.muted).text("LAPORAN AKHIR UAT", PAGE.width - PAGE.right - 150, 27, { width: 150, align: "right", lineBreak: false });
    doc.moveTo(PAGE.left, 48).lineTo(PAGE.width - PAGE.right, 48).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.moveTo(PAGE.left, 800).lineTo(PAGE.width - PAGE.right, 800).lineWidth(0.6).strokeColor(C.line).stroke();
    doc.font("Body").fontSize(7.2).fillColor(C.muted).text(`Dokumen ${teks(snapshot.dokumenId)} · v${snapshot.versi}`, PAGE.left, 809, { width: 350, lineBreak: false });
    doc.font("Body").fontSize(7.2).fillColor(C.muted).text(`Halaman ${number}`, PAGE.width - PAGE.right - 90, 809, { width: 90, align: "right", lineBreak: false });
    doc.restore();
    doc.page.margins.bottom = previousBottomMargin;
  };
  chrome(pageNo);
  doc.on("pageAdded", () => { pageNo += 1; chrome(pageNo); });
  let y = PAGE.top;
  const usableWidth = PAGE.width - PAGE.left - PAGE.right;
  const newPage = () => { doc.addPage(); y = PAGE.top; };
  const ensure = (height: number) => { if (y + height > PAGE.bottom) newPage(); };
  const drawLines = (text: string, x: number, width: number, options: { size?: number; font?: string; color?: string; indent?: number } = {}): void => {
    const size = options.size ?? 9.2;
    const font = options.font ?? "Body";
    const lineHeight = size * 1.48;
    const lines = wrapLines(doc, text, width, font, size);
    for (const line of lines) {
      ensure(lineHeight + 1);
      doc.font(font).fontSize(size).fillColor(options.color ?? C.ink).text(line || " ", x + (options.indent ?? 0), y, { lineBreak: false });
      y += lineHeight;
    }
  };
  const heading = (title: string, subtitle?: string) => {
    ensure(subtitle ? 48 : 34);
    y += 9;
    doc.font("Strong").fontSize(15).fillColor(C.navy).text(title, PAGE.left, y, { width: usableWidth });
    y += 23;
    if (subtitle) { drawLines(subtitle, PAGE.left, usableWidth, { size: 8.5, color: C.muted }); y += 4; }
  };
  const field = (label: string, value: string | null | undefined, opts: { x?: number; width?: number; size?: number } = {}) => {
    const x = opts.x ?? PAGE.left;
    const width = opts.width ?? usableWidth;
    ensure(28);
    doc.font("Strong").fontSize(7.4).fillColor(C.muted).text(label.toLocaleUpperCase("id-ID"), x, y, { width });
    y += 10.5;
    drawLines(teks(value), x, width, { size: opts.size ?? 9.1, color: C.ink });
    y += 5;
  };
  const counts = (count: { total: number; lulus: number; gagal: number; tertunda: number; belum: number }, x: number, top: number, width: number, cardHeight = 58) => {
    const items = [
      ["TOTAL", count.total, C.navy], ["LULUS", count.lulus, C.green], ["GAGAL", count.gagal, C.red],
      ["TERTUNDA", count.tertunda, C.amber], ["BELUM DIUJI", count.belum, C.gray],
    ] as const;
    const gap = 6;
    const cardW = (width - gap * 4) / 5;
    items.forEach(([label, value, color], i) => {
      const cx = x + i * (cardW + gap);
      doc.roundedRect(cx, top, cardW, cardHeight, 5).fill(C.pale);
      doc.font("Strong").fontSize(7).fillColor(C.muted).text(label, cx + 7, top + 9, { width: cardW - 14, lineBreak: false });
      doc.font("Strong").fontSize(17).fillColor(color).text(angka(value), cx + 7, top + 24, { width: cardW - 14, lineBreak: false });
    });
  };
  const sectionBar = (title: string, rightText?: string) => {
    const titleWidth = rightText ? usableWidth * 0.7 : usableWidth - 20;
    const lines = wrapLines(doc, title, titleWidth, "Strong", 9.2);
    const barHeight = Math.max(25, lines.length * 13 + 10);
    ensure(barHeight + 9);
    doc.roundedRect(PAGE.left, y, usableWidth, barHeight, 4).fill(C.tealPale);
    lines.forEach((line, i) => {
      doc.font("Strong").fontSize(9.2).fillColor(C.navy).text(line, PAGE.left + 10, y + 6 + i * 13, { lineBreak: false });
    });
    if (rightText) doc.font("Body").fontSize(7.5).fillColor(C.muted).text(rightText, PAGE.left + usableWidth * 0.7, y + 8, { width: usableWidth * 0.3 - 10, align: "right", lineBreak: false });
    y += barHeight + 9;
  };

  // Cover and executive summary: recorded scope and dates are not interpreted as actual completion.
  y = 93;
  doc.roundedRect(PAGE.left, y, 4, 101, 2).fill(C.teal);
  doc.font("Strong").fontSize(10).fillColor(C.teal).text("DOKUMEN HASIL PENGUJIAN", PAGE.left + 16, y + 3, { width: usableWidth - 16 });
  doc.font("Strong").fontSize(24).fillColor(C.navy).text("Laporan Akhir UAT", PAGE.left + 16, y + 24, { width: usableWidth - 20 });
  y += 58;
  drawLines(teks(snapshot.proyek.nama), PAGE.left + 16, usableWidth - 26, { font: "Strong", size: 14, color: C.ink });
  y += 5;
  drawLines(`${teks(snapshot.proyek.jenisPengujian)} · ${teks(snapshot.proyek.tahap)}`, PAGE.left + 16, usableWidth - 26, { size: 9, color: C.muted });
  y += 24;
  doc.font("Strong").fontSize(9).fillColor(C.navy).text("RINGKASAN EKSEKUTIF", PAGE.left, y);
  y += 17;
  counts(snapshot.hitungan, PAGE.left, y, usableWidth, 61);
  y += 73;
  doc.roundedRect(PAGE.left, y, usableWidth, 58, 5).fill(C.amberPale);
  doc.rect(PAGE.left, y, 4, 58).fill(C.amber);
  doc.font("Strong").fontSize(8.5).fillColor(C.amber).text("CATATAN PEMBACAAN", PAGE.left + 12, y + 9);
  const note = "Penyelesaian UAT tidak dengan sendirinya berarti seluruh skenario lulus. Status, temuan, dan tindak lanjut berikut mencerminkan catatan yang tersimpan pada saat dokumen ini dibuat.";
  doc.font("Body").fontSize(8).fillColor(C.ink).text(note, PAGE.left + 12, y + 23, { width: usableWidth - 24, height: 31, lineGap: 1 });
  y += 72;
  sectionBar("Identitas dan ruang lingkup");
  const pairs: [string, string | null][] = [
    ["ID proyek", snapshot.proyek.id],
    ["Aplikasi", snapshot.proyek.aplikasi], ["Unit", snapshot.proyek.unit], ["PIC", snapshot.proyek.pic],
    ["Lingkup", snapshot.proyek.ruangLingkup], ["Lingkungan", snapshot.proyek.lingkungan], ["Dasar regulasi", snapshot.proyek.dasarRegulasi],
    ["Tanggal mulai tercatat", snapshot.proyek.tanggalMulai], ["Target selesai (target, bukan capaian)", snapshot.proyek.targetSelesai],
    ["Selesai tercatat pada", snapshot.proyek.selesaiPada],
  ];
  for (const [label, value] of pairs) field(label, value, { width: usableWidth, size: 8.5 });
  y += 2;
  field("Dokumen / versi", `${teks(snapshot.dokumenId)} · versi ${snapshot.versi}`, { size: 8.5 });
  field("Dibuat pada / oleh", `${teks(snapshot.dibuatPada)} · ${teks(snapshot.dibuatOleh)}`, { size: 8.5 });
  drawLines("Dokumen internal untuk pencatatan hasil UAT. Bukan tanda tangan elektronik atau berita acara serah terima.", PAGE.left, usableWidth, { size: 7.7, color: C.muted });

  // Per-module overview.
  heading("Rekap per modul", "Angka di bawah mengikuti rekap yang tersimpan di snapshot laporan.");
  if (snapshot.modul.length === 0) drawLines("Tidak ada modul tercatat.", PAGE.left, usableWidth);
  for (const modul of snapshot.modul) {
    const moduleTitle = `${teks(modul.kode)}  ${teks(modul.nama)}`;
    const moduleLines = wrapLines(doc, moduleTitle, usableWidth - 18, "Strong", 9);
    const moduleHeadingHeight = Math.max(26, moduleLines.length * 13 + 12);
    ensure(moduleHeadingHeight + 60);
    doc.roundedRect(PAGE.left, y, usableWidth, moduleHeadingHeight, 4).fill(C.pale);
    moduleLines.forEach((line, i) => doc.font("Strong").fontSize(9).fillColor(C.navy).text(line, PAGE.left + 9, y + 7 + i * 13, { lineBreak: false }));
    y += moduleHeadingHeight + 6;
    counts(modul.hitungan, PAGE.left, y, usableWidth, 49);
    y += 59;
  }

  // Scenario detail pages, stacked for readable wrapping rather than compressed table cells.
  heading("Rincian skenario", "Setiap skenario ditampilkan bersama modul asal, hasil tercatat, temuan, tindak lanjut, dan referensi bukti internal.");
  let scenarioOrdinal = 0;
  for (const modul of snapshot.modul) {
    if (!modul.skenario.length) continue;
    sectionBar(`${modul.kode} · ${modul.nama}`, `${modul.skenario.length} skenario`);
    for (const scenario of modul.skenario) {
      scenarioOrdinal += 1;
      const badge = statusColor(scenario.status);
      const badgeWidth = Math.max(68, doc.widthOfString(badge.label) + 18);
      const identity = `ID skenario: ${scenario.id} · Kode: ${scenario.kode}`;
      ensure(38);
      doc.moveTo(PAGE.left, y).lineTo(PAGE.width - PAGE.right, y).lineWidth(0.7).strokeColor(C.line).stroke();
      y += 9;
      doc.roundedRect(PAGE.width - PAGE.right - badgeWidth, y, badgeWidth, 19, 8).fill(badge.fill);
      doc.font("Strong").fontSize(7.7).fillColor(badge.text).text(badge.label, PAGE.width - PAGE.right - badgeWidth + 5, y + 6, { width: badgeWidth - 10, align: "center", lineBreak: false });
      drawLines(identity, PAGE.left, usableWidth - badgeWidth - 14, { font: "Strong", size: 8.1, color: C.muted });
      y += 4;
      drawLines(teks(scenario.judul), PAGE.left, usableWidth - 8, { font: "Strong", size: 9, color: C.navy });
      y += 2;
      const scenarioFields: [string, string | null][] = [
        ["Langkah", scenario.langkah], ["Hasil yang diharapkan", scenario.diharapkan],
        ["Hasil aktual tercatat", scenario.aktual], ["Temuan", scenario.temuan], ["Tindak lanjut", scenario.tindakLanjut],
        ["Penguji", scenario.penguji],
      ];
      for (const [label, value] of scenarioFields) {
        ensure(26);
        doc.font("Strong").fontSize(7.2).fillColor(C.muted).text(label, PAGE.left + 8, y, { width: 126, lineBreak: false });
        const content = teks(value);
        drawLines(content, PAGE.left + 136, usableWidth - 144, { size: 8.3, color: C.ink });
        y += 3;
      }
      const evidenceRefs = scenario.bukti.filter((ref) => ref.trim() && !/^(?:https?:\/\/|www\.)/i.test(ref.trim()));
      const evidenceText = evidenceRefs.length ? evidenceRefs.join(" · ") : "Tidak tercatat";
      ensure(26);
      doc.font("Strong").fontSize(7.2).fillColor(C.muted).text("Referensi bukti internal", PAGE.left + 8, y, { width: 126, lineBreak: false });
      drawLines(evidenceText, PAGE.left + 136, usableWidth - 144, { size: 8.1, color: C.ink });
      y += 3;
      doc.font("Body").fontSize(7.4).fillColor(C.muted).text(`Siap retest: ${scenario.siapRetest ? "Ya" : "Tidak"}`, PAGE.left + 8, y, { width: 180, lineBreak: false });
      y += 14;
    }
  }
  if (!scenarioOrdinal) drawLines("Tidak ada skenario tercatat.", PAGE.left, usableWidth);

  // Consolidated follow-up register.
  const followups: { module: string; scenario: SkenarioLaporan }[] = [];
  for (const modul of snapshot.modul) for (const scenario of modul.skenario) {
    if (scenario.tindakLanjut?.trim() || scenario.status !== "PASS" || !scenario.aktual?.trim()) {
      followups.push({ module: `${modul.kode} · ${modul.nama}`, scenario });
    }
  }
  heading("Daftar tindak lanjut", `${followups.length} item dengan catatan tindakan atau hasil yang memerlukan perhatian. Tindakan yang belum tercatat tidak dianggap selesai.`);
  if (!followups.length) drawLines("Tidak ada tindak lanjut yang tercatat.", PAGE.left, usableWidth);
  for (const item of followups) {
    ensure(46);
    const { scenario } = item;
    const status = statusColor(scenario.status);
    doc.roundedRect(PAGE.left, y, 4, 30, 2).fill(status.text);
    drawLines(`${item.module} · ${scenario.kode}`, PAGE.left + 12, usableWidth - 12, { font: "Strong", size: 8.7, color: C.navy });
    drawLines(scenario.tindakLanjut?.trim() || "Catatan tindakan belum tercatat; tindak lanjut tidak dapat dinyatakan selesai.", PAGE.left + 12, usableWidth - 12, { size: 8.5 });
    y += 8;
  }

  heading("Kesimpulan", "Kesimpulan mengikuti snapshot dan tidak mengubah status hasil tiap skenario.");
  drawLines(teks(snapshot.kesimpulan), PAGE.left, usableWidth, { size: 9.3 });
  if (snapshot.peringatan.length) {
    y += 12;
    sectionBar("Peringatan dan catatan");
    for (const warning of snapshot.peringatan) {
      ensure(24);
      doc.font("Strong").fontSize(9).fillColor(C.amber).text("•", PAGE.left + 4, y, { lineBreak: false });
      drawLines(warning, PAGE.left + 18, usableWidth - 18, { size: 8.7 });
      y += 4;
    }
  }
  doc.end();
  return finished;
}
