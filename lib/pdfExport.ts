import { HistoryItem } from './historyStorage';

/**
 * Helper to parse a pipe-separated string into clean key-value rows
 */
function parseDetailsToRows(detailsStr: string): [string, string][] {
  if (!detailsStr) return [];
  const parts = detailsStr.split(/\s*\|\s*/);
  const rows: [string, string][] = [];

  parts.forEach((part) => {
    const colonIdx = part.indexOf(':');
    if (colonIdx !== -1) {
      const key = part.slice(0, colonIdx).trim();
      const value = part.slice(colonIdx + 1).trim();
      rows.push([key, value]);
    } else {
      rows.push(['Detail', part.trim()]);
    }
  });

  return rows;
}

/**
 * Generates and downloads a clean, formatted PDF report of all stored calculation history.
 */
export async function exportAllHistoryPDF(items: HistoryItem[]): Promise<void> {
  if (!items || items.length === 0 || typeof window === 'undefined') return;

  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = (autoTableModule.default || autoTableModule) as typeof import('jspdf-autotable').default;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Header Banner
  doc.setFillColor(30, 58, 138); // Dark Navy Blue
  doc.rect(0, 0, 210, 30, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('Retail Calculation History Report', 14, 17);

  // Subtitle / Generated metadata
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(219, 234, 254);
  doc.text(`Generated on: ${new Date().toLocaleString()}  |  Total Records: ${items.length}`, 14, 24);

  // Table Data - Convert pipe-separated details into clean bullet points for readability
  const tableData = items.map((item, index) => {
    const formattedDetails = item.details
      .split(/\s*\|\s*/)
      .map((d) => `• ${d.trim()}`)
      .join('\n');

    const formattedResult = item.result
      .split(/\s*\|\s*/)
      .join('\n');

    return [
      (index + 1).toString(),
      item.type,
      formattedResult,
      formattedDetails,
      item.timestamp,
    ];
  });

  autoTable(doc, {
    startY: 36,
    head: [['#', 'Category', 'Calculated Result', 'Input Parameters & Details', 'Time']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [30, 41, 59],
      cellPadding: 4,
      valign: 'top',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 26, fontStyle: 'bold' },
      2: { cellWidth: 54, fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 26, halign: 'center' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 12, right: 12, bottom: 20 },
    didDrawPage: (data) => {
      // Footer page numbering
      const pageStr = `Page ${data.pageNumber}`;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(pageStr, 198, 287, { align: 'right' });
      doc.text('Retail Calculator Tool — Detailed Calculations Report', 12, 287);
    },
  });

  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`retail_calculation_history_${dateStr}.pdf`);
}

/**
 * Generates and downloads a clean, detailed, itemized PDF document for a single calculation.
 */
export async function exportSingleItemPDF(item: HistoryItem): Promise<void> {
  if (!item || typeof window === 'undefined') return;

  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = (autoTableModule.default || autoTableModule) as typeof import('jspdf-autotable').default;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Header Banner
  doc.setFillColor(30, 58, 138); // Dark Navy Blue
  doc.rect(0, 0, 210, 32, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text(`${item.type.toUpperCase()} CALCULATION RECORD`, 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(219, 234, 254);
  doc.text(`Recorded Date & Time: ${item.timestamp}  |  Record ID: ${item.id}`, 14, 26);

  // Result Section Highlight Box
  doc.setFillColor(236, 253, 245); // Emerald light background
  doc.setDrawColor(16, 185, 129); // Emerald border
  doc.setLineWidth(0.6);
  doc.roundedRect(14, 38, 182, 32, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(5, 150, 105);
  doc.text('CALCULATED OUTCOME / RESULT', 20, 47);

  // Split result if multi-line
  const resultLines = item.result.split(/\s*\|\s*/);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(6, 78, 59);

  let currentY = 55;
  resultLines.forEach((line) => {
    doc.text(line, 20, currentY);
    currentY += 6;
  });

  // Parameters Section Heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text('Full Calculation Parameters & Input Details', 14, 78);

  // Parse details into itemized Key-Value table rows
  const detailRows = parseDetailsToRows(item.details);

  autoTable(doc, {
    startY: 83,
    head: [['Parameter / Field', 'Value / Details']],
    body: detailRows.length > 0 ? detailRows : [['Details', item.details]],
    theme: 'grid',
    headStyles: {
      fillColor: [51, 65, 85], // Slate 700
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 10,
      textColor: [15, 23, 42],
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 65, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: 'auto' },
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      // Footer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Retail Calculator Tool — Official Calculation Voucher', 14, 287);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 196, 287, { align: 'right' });
    },
  });

  const cleanType = item.type.toLowerCase().replace(/[^a-z0-9]/g, '_');
  doc.save(`calculation_${cleanType}_${item.id.slice(0, 8)}.pdf`);
}
