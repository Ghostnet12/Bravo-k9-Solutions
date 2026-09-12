import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { trainingFocusName } from '../shared/catalog.js';

// Generated only after the schedule route has checked the requesting account.
export async function schedulePdf(schedule) {
  const regular = fileURLToPath(new URL('../client/public/fonts/montserrat-400.ttf', import.meta.url));
  const bold = fileURLToPath(new URL('../client/public/fonts/montserrat-700.ttf', import.meta.url));
  const doc = new PDFDocument({ size: 'LETTER', margin: 48, font: regular, bufferPages: true,
    info: { Title: `Bravo schedule - ${schedule.month}`, Author: 'Bravo K9 Solutions' } });
  doc.registerFont('regular', regular); doc.registerFont('bold', bold);
  const chunks = [];
  const ready = new Promise((resolve, reject) => { doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const width = 516;
  const text = value => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ');
  const date = value => DateTime.fromISO(String(value), { zone: 'America/Chicago' }).toFormat('ccc, LLL d, yyyy');
  function paragraph(value, { size = 10, strong = false, gap = 8 } = {}) {
    doc.font(strong ? 'bold' : 'regular').fontSize(size).fillColor('#111111').text(text(value), 48, doc.y, { width, lineGap: 3 });
    doc.y += gap;
  }
  function space(height) { if (doc.y + height > 720) doc.addPage(); }
  paragraph('BRAVO K9 SOLUTIONS', { size: 12, strong: true });
  paragraph(DateTime.fromISO(`${schedule.month}-01`).toFormat('MMMM yyyy'), { size: 24, strong: true });
  paragraph(schedule.client.name, { size: 14, strong: true });
  paragraph('All times are local to Aberdeen, South Dakota.');
  if (schedule.firstPaidAt) paragraph(`Membership payment / start: ${DateTime.fromISO(new Date(schedule.firstPaidAt).toISOString(), {zone: 'America/Chicago'}).toFormat('LLL d, yyyy h:mm a')}`);
  if (schedule.firstTrainingDay) paragraph(`First paid scheduled visit: ${date(schedule.firstTrainingDay)}`);
  paragraph('Saved booking dates. Requested visits await Bravo confirmation. Cancelled visits remain labelled.');
  for (const visit of schedule.visits) {
    const time = DateTime.fromFormat(visit.time, 'HH:mm').toFormat('h:mm a');
    const details = [
      `${date(visit.date)} - ${time}`,
      `${visit.service === 'training' ? trainingFocusName(visit.trainingFocus) : visit.service} - ${visit.dogName}`,
      `Trainer: ${visit.trainer}`,
      `${visit.status.toUpperCase()} - ${visit.paymentStatus === 'covered' ? 'Membership covered' : visit.paymentStatus} - #${visit.bookingId.slice(-6)}`,
    ];
    const height = details.reduce((sum, line, i) => sum + doc.font(i ? 'regular' : 'bold').fontSize(i ? 10 : 12).heightOfString(text(line), { width, lineGap: 3 }) + 6, 16);
    space(height);
    doc.moveTo(48, doc.y).lineTo(564, doc.y).strokeColor('#aaaaaa').stroke(); doc.y += 10;
    details.forEach((line, i) => paragraph(line, { size: i ? 10 : 12, strong: !i, gap: 6 }));
  }
  if (!schedule.visits.length) paragraph('No saved visits in this month.');
  space(80); paragraph('Membership dates', { size: 15, strong: true });
  for (const term of schedule.terms) {
    space(70);
    paragraph(`${term.serviceIds.join(' + ')}: ${term.validFrom ? date(new Date(term.validFrom).toISOString()) : 'Start date not recorded'} - ${date(new Date(term.validUntil).toISOString())}. ${new Date(term.validUntil) <= new Date() ? 'Expired' : term.status}`);
  }
  if (!schedule.terms.length) paragraph('No paid monthly membership recorded.');
  const { count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.font('regular').fontSize(8).fillColor('#444444').text(`Bravo K9 Solutions | Page ${i + 1} of ${count}`, 48, 735, { width, lineBreak: false, lineGap: 0 });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return ready;
}
