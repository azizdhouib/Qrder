import { jsPDF } from "jspdf";

function money(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function downloadVatReportPdf(opts: {
  restaurantName: string;
  fromIso: string;
  toIso: string;
  totals: { htCents: number; tvaCents: number; ttcCents: number };
  buckets: {
    rate10: { label: string; htCents: number; tvaCents: number; ttcCents: number };
    rate20: { label: string; htCents: number; tvaCents: number; ttcCents: number };
    rate55: { label: string; htCents: number; tvaCents: number; ttcCents: number };
    exempt: { label: string; htCents: number; tvaCents: number; ttcCents: number };
  };
  note?: string;
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let y = 16;
  doc.setFontSize(18);
  doc.text("Rapport TVA — Qrder", 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 95);
  doc.text(opts.restaurantName, 14, y);
  y += 6;
  doc.text(`Période : ${opts.fromIso.slice(0, 10)} → ${opts.toIso.slice(0, 10)}`, 14, y);
  y += 10;
  doc.setTextColor(20, 20, 25);
  doc.setFontSize(11);
  doc.text(`Total HT : ${money(opts.totals.htCents)}`, 14, y);
  y += 6;
  doc.text(`Total TVA : ${money(opts.totals.tvaCents)}`, 14, y);
  y += 6;
  doc.text(`Total TTC : ${money(opts.totals.ttcCents)}`, 14, y);
  y += 10;
  doc.setFontSize(10);
  const rows: [string, string, string, string][] = [
    ["Taux", "HT", "TVA", "TTC"],
    [
      opts.buckets.rate10.label,
      money(opts.buckets.rate10.htCents),
      money(opts.buckets.rate10.tvaCents),
      money(opts.buckets.rate10.ttcCents)
    ],
    [
      opts.buckets.rate20.label,
      money(opts.buckets.rate20.htCents),
      money(opts.buckets.rate20.tvaCents),
      money(opts.buckets.rate20.ttcCents)
    ],
    [
      opts.buckets.rate55.label,
      money(opts.buckets.rate55.htCents),
      money(opts.buckets.rate55.tvaCents),
      money(opts.buckets.rate55.ttcCents)
    ],
    [
      opts.buckets.exempt.label,
      money(opts.buckets.exempt.htCents),
      money(opts.buckets.exempt.tvaCents),
      money(opts.buckets.exempt.ttcCents)
    ]
  ];
  rows.forEach((line, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.text(line[0], 14, y);
    doc.text(line[1], 72, y);
    doc.text(line[2], 112, y);
    doc.text(line[3], 152, y);
    y += 6;
  });
  y += 4;
  if (opts.note) {
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 110);
    const split = doc.splitTextToSize(opts.note, 180);
    doc.text(split, 14, y);
  }
  doc.save(`qrder-rapport-tva-${opts.fromIso.slice(0, 10)}.pdf`);
}

export function downloadDailyClosePdf(opts: {
  restaurantName: string;
  fromIso: string;
  toIso: string;
  lines: { label: string; value: string }[];
  hourlyPeaks: string;
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let y = 16;
  doc.setFontSize(18);
  doc.text("Clôture de caisse — Qrder", 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 95);
  doc.text(opts.restaurantName, 14, y);
  y += 6;
  doc.text(`Période : ${opts.fromIso.slice(0, 10)} → ${opts.toIso.slice(0, 10)}`, 14, y);
  y += 12;
  doc.setTextColor(20, 20, 25);
  doc.setFontSize(10.5);
  opts.lines.forEach(({ label, value }) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 110, y);
    y += 7;
    if (y > 270) {
      doc.addPage();
      y = 16;
    }
  });
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Fenêtre de forte activité", 14, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(opts.hourlyPeaks, 14, y);
  doc.save(`qrder-cloture-${opts.fromIso.slice(0, 10)}.pdf`);
}
