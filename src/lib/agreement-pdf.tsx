// AGREEMENT_SPEC AG-2 §2 — the signed-agreement PDF. Server only.
//
// Renders the document's Markdown (the exact text the signer saw, hashed) plus
// a signature block: course legal name, signer name/title/email, accepted-at
// in ET and UTC, IP, version, text hash, and the sentence saying how it was
// signed. @react-pdf/renderer, no browser. Markdown support is deliberately
// small — headings, paragraphs, bullets, bold stripped — because that is all
// the documents use; anything fancier renders as plain text rather than
// silently disappearing.
import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { LoadedDocument } from './agreements';

export type SignatureBlock = {
  courseName: string;
  legalName: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  acceptedAt: Date;
  ip: string;
  acceptanceId: string;
  authorityAttested: boolean;
  marketingOptOut: boolean;
  legacy: boolean;
};

const styles = StyleSheet.create({
  page: { paddingTop: 56, paddingBottom: 64, paddingHorizontal: 56, fontSize: 10.5, fontFamily: 'Helvetica', color: '#1C1C18', lineHeight: 1.45 },
  eyebrow: { fontSize: 8, color: '#87867C', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  meta: { fontSize: 9, color: '#6E6D64', marginBottom: 18 },
  h2: { fontSize: 12.5, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 4 },
  h3: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 3 },
  p: { marginBottom: 6 },
  li: { flexDirection: 'row', marginBottom: 3, paddingLeft: 8 },
  bullet: { width: 10 },
  liText: { flex: 1 },
  sig: { marginTop: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#D9D6C8' },
  sigTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  row: { flexDirection: 'row', marginBottom: 2 },
  k: { width: 130, color: '#6E6D64', fontSize: 9.5 },
  v: { flex: 1, fontSize: 9.5 },
  foot: { position: 'absolute', bottom: 28, left: 56, right: 56, fontSize: 8, color: '#98968B', flexDirection: 'row', justifyContent: 'space-between' },
});

type Block = { kind: 'h2' | 'h3' | 'p' | 'li'; text: string };

/** The small Markdown subset the documents use, as blocks. */
export function markdownBlocks(md: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ kind: 'p', text: clean(para.join(' ')) }); para = []; } };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^<!--.*-->\s*$/.test(line.trim())) continue;           // HTML comments (the counsel marker)
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith('### ')) { flush(); out.push({ kind: 'h3', text: clean(line.slice(4)) }); continue; }
    if (line.startsWith('## ')) { flush(); out.push({ kind: 'h2', text: clean(line.slice(3)) }); continue; }
    if (line.startsWith('# ')) { flush(); out.push({ kind: 'h2', text: clean(line.slice(2)) }); continue; }
    if (/^\s*[-*]\s+/.test(line)) { flush(); out.push({ kind: 'li', text: clean(line.replace(/^\s*[-*]\s+/, '')) }); continue; }
    if (/^---+$/.test(line.trim())) { flush(); continue; }
    para.push(line.trim());
  }
  flush();
  return out;
}
function clean(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
    .replace(/&nbsp;/g, ' ');
}

const fmtEt = (d: Date) => d.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }) + ' ET';

export function AgreementPdf({ doc, sig }: { doc: LoadedDocument; sig: SignatureBlock }) {
  const blocks = markdownBlocks(doc.markdown);
  return (
    <Document title={`${doc.title} v${doc.version} — ${sig.legalName || sig.courseName}`} author="GreenReserve">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.eyebrow}>GreenReserve · {doc.title}</Text>
        <Text style={styles.title}>{doc.title}</Text>
        <Text style={styles.meta}>Version {doc.version} · effective {doc.effectiveAt} · sha256 {doc.hash}</Text>
        {blocks.map((b, i) => {
          if (b.kind === 'h2') return <Text key={i} style={styles.h2}>{b.text}</Text>;
          if (b.kind === 'h3') return <Text key={i} style={styles.h3}>{b.text}</Text>;
          if (b.kind === 'li') return <View key={i} style={styles.li}><Text style={styles.bullet}>•</Text><Text style={styles.liText}>{b.text}</Text></View>;
          return <Text key={i} style={styles.p}>{b.text}</Text>;
        })}
        <View style={styles.sig} wrap={false}>
          <Text style={styles.sigTitle}>{sig.legacy ? 'Acceptance on record' : 'Signed electronically'}</Text>
          {[
            ['Course', sig.courseName],
            ['Legal name', sig.legalName || '—'],
            ['Signed by', sig.signerName ? `${sig.signerName}${sig.signerTitle ? ', ' + sig.signerTitle : ''}` : '—'],
            ['Email', sig.signerEmail || '—'],
            ['Accepted at', `${fmtEt(sig.acceptedAt)} (${sig.acceptedAt.toISOString()} UTC)`],
            ['IP address', sig.ip || '—'],
            ['Document', `${doc.document} v${doc.version}`],
            ['Text hash', doc.hash],
            ['Record id', sig.acceptanceId],
            ...(doc.document === 'operator_agreement' ? [['Authority', sig.authorityAttested ? 'Signer attested they are authorized to bind the course' : 'Not attested']] : []),
            ...(doc.document === 'brand_license' ? [['Marketing use', sig.marketingOptOut ? 'Opted out' : 'Permitted']] : []),
          ].map(([k, v]) => (
            <View key={k} style={styles.row}><Text style={styles.k}>{k}</Text><Text style={styles.v}>{v}</Text></View>
          ))}
          <Text style={{ marginTop: 8, fontSize: 9, color: '#6E6D64' }}>
            {sig.legacy
              ? 'Accepted by checkbox in the GreenReserve dashboard before signature capture existed; migrated to this record.'
              : 'Signed electronically by clicking "Sign and continue" on greenreserve.app. The text above is the exact document presented, identified by its sha256 hash.'}
          </Text>
        </View>
        <View style={styles.foot} fixed>
          <Text>GreenReserve · greenreserve.app</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderAgreementPdf(doc: LoadedDocument, sig: SignatureBlock): Promise<Buffer> {
  const buf = await renderToBuffer(<AgreementPdf doc={doc} sig={sig} />);
  return Buffer.from(buf);
}
