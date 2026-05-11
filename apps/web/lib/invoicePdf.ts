import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export type InvoicePdfVariant = "a4" | "thermal";

/**
 * Exporte l’élément DOM en PDF (même rendu que l’aperçu à l’écran).
 * Pour le ticket 80 mm, le conteneur doit déjà être en variante thermique (classe CSS).
 */
export async function exportInvoiceElementToPdf(
  element: HTMLElement,
  opts: { variant: InvoicePdfVariant; fileName: string }
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: opts.variant === "thermal" ? 2.5 : 2,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight
  });

  const imgData = canvas.toDataURL("image/png", 1.0);
  const imgWpx = canvas.width;
  const imgHpx = canvas.height;

  if (opts.variant === "a4") {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const innerW = pageW - margin * 2;
    const innerH = pageH - margin * 2;
    const ratio = Math.min(innerW / (imgWpx * 0.264583), innerH / (imgHpx * 0.264583));
    const drawW = (imgWpx * 0.264583) * ratio;
    const drawH = (imgHpx * 0.264583) * ratio;
    let y = margin + Math.max(0, (innerH - drawH) / 2);
    pdf.addImage(imgData, "PNG", margin + (innerW - drawW) / 2, y, drawW, drawH, undefined, "FAST");
    pdf.save(opts.fileName.endsWith(".pdf") ? opts.fileName : `${opts.fileName}.pdf`);
    return;
  }

  const paperWmm = 80;
  const drawWmm = paperWmm;
  const drawHmm = (imgHpx / imgWpx) * paperWmm;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [paperWmm, Math.min(400, Math.max(60, drawHmm + 4))],
    compress: true
  });
  pdf.addImage(imgData, "PNG", 0, 2, drawWmm, drawHmm, undefined, "FAST");
  pdf.save(opts.fileName.endsWith(".pdf") ? opts.fileName : `${opts.fileName}.pdf`);
}
