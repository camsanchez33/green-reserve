// Analytics → Reviews (Cam 2026-11-17, lanes/dashboard.md item 5): one monthly written report as a PDF.
// Server only, @react-pdf/renderer, no browser. The same words the page shows (the stored review, never
// re-written here), under the page's headings: Summary, Where it beat expectations, Where it fell short,
// What to try, and By area when the report stored it (reports from 2026-11-17 on). No numbers of its own.
import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { ReviewBody, AreaRow } from './monthly-review';
import { areaValue, areaChange, pdfText } from './report-figures';

const styles = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 64, paddingHorizontal: 56, fontSize: 10.5, fontFamily: 'Helvetica', color: '#1C1C18', lineHeight: 1.45 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  meta: { fontSize: 9, color: '#6E6D64', marginBottom: 18 },
  h2: { fontSize: 12.5, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 4 },
  p: { marginBottom: 6 },
  li: { flexDirection: 'row', marginBottom: 4, paddingLeft: 8 },
  bullet: { width: 10 },
  liText: { flex: 1 },
  tr: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#E6E3D6' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: '#6E6D64' },
  c1: { flex: 2 },
  c: { flex: 1, textAlign: 'right' },
  foot: { position: 'absolute', bottom: 28, left: 56, right: 56, fontSize: 8, color: '#98968B', flexDirection: 'row', justifyContent: 'space-between' },
});

export type ReportPdfInput = { courseName: string; monthLabel: string; lastMonthLabel: string | null; review: ReviewBody; byArea: AreaRow[] | null };

function List({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((t, i) => (
        <View key={i} style={styles.li} wrap={false}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.liText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function ReportPdf({ r: raw }: { r: ReportPdfInput }) {
  // Every string the page prints, the model's own words included, through pdfText (Helvetica's glyphs).
  const r = { ...raw, courseName: pdfText(raw.courseName), review: { verdict: pdfText(raw.review.verdict), wentWell: raw.review.wentWell.map(pdfText), fellShort: raw.review.fellShort.map(pdfText), recommendations: raw.review.recommendations.map(pdfText) } };
  const sections: [string, string[]][] = [
    ['Where it beat expectations', r.review.wentWell],
    ['Where it fell short', r.review.fellShort],
    ['What to try', r.review.recommendations],
  ];
  const area = r.byArea && r.byArea.length ? r.byArea : null;
  return (
    <Document title={`${r.courseName} — ${r.monthLabel} report`} author="GreenReserve">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{r.monthLabel}</Text>
        <Text style={styles.meta}>{r.courseName} · Monthly report</Text>
        <Text style={styles.h2}>Summary</Text>
        <Text style={styles.p}>{r.review.verdict}</Text>
        {sections.filter(([, items]) => items.length > 0).map(([h, items]) => (
          <View key={h}>
            <Text style={styles.h2}>{h}</Text>
            <List items={items} />
          </View>
        ))}
        {area && (
          <View wrap={false}>
            <Text style={styles.h2}>By area</Text>
            <View style={styles.tr}>
              <Text style={[styles.c1, styles.th]}>Area</Text>
              <Text style={[styles.c, styles.th]}>{r.monthLabel.split(' ')[0]}</Text>
              <Text style={[styles.c, styles.th]}>{r.lastMonthLabel ? r.lastMonthLabel.split(' ')[0] : 'Month before'}</Text>
              <Text style={[styles.c, styles.th]}>Change</Text>
            </View>
            {area.map(a => (
              <View key={a.key} style={styles.tr}>
                <Text style={styles.c1}>{a.label}</Text>
                <Text style={styles.c}>{pdfText(areaValue(a.unit, a.thisMonth))}</Text>
                <Text style={styles.c}>{pdfText(areaValue(a.unit, a.lastMonth))}</Text>
                <Text style={styles.c}>{pdfText(areaChange(a))}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.foot} fixed>
          <Text>Written by GreenReserve from {r.courseName}&apos;s own numbers.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderMonthlyReportPdf(r: ReportPdfInput): Promise<Buffer> {
  return Buffer.from(await renderToBuffer(<ReportPdf r={r} />));
}
