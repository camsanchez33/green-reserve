'use client';

// MP-12 (ADMIN_V4 V4-9): split out of admin/courses/[id]/page.tsx, which had
// grown to 2,700 lines and 52 useState in one component. Moved verbatim; state
// and handlers come from useCourseDetail() via useCourse().

import { X, Search } from 'lucide-react';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatDate as fmtDate, formatMoney as fmtMoney } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { TX_STATUS, iCls } from './shared';
import { useCourse } from './context';

export function MoneyTab() {
  const { txItems, setRefundTarget, setRefundAmount, setRefundReason, setRefundError, refundNote, setRefundNote, txLoading, txError, txPage, setTxPage, txPages, txTotal, txFrom, setTxFrom, txTo, setTxTo, txSearch, setTxSearch, loadTransactions, openOperate } = useCourse();
  return (
            <div className="max-w-5xl">
              <Card className="p-4 mb-5">
                <div className="flex flex-wrap gap-3">
                  <div className="relative flex-1 min-w-52">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none" />
                    <input
                      placeholder="Search golfer name or email"
                      value={txSearch}
                      onChange={e => setTxSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') loadTransactions(1, txFrom, txTo, txSearch); }}
                      className={iCls + ' pl-9'}
                    />
                  </div>
                  <input type="date" value={txFrom} onChange={e => setTxFrom(e.target.value)} className={iCls + ' flex-1 min-w-36'} />
                  <input type="date" value={txTo} onChange={e => setTxTo(e.target.value)} className={iCls + ' flex-1 min-w-36'} />
                  <button
                    onClick={() => loadTransactions(1, txFrom, txTo, txSearch)}
                    className="bg-pine hover:bg-pine-hover text-white text-[12.5px] font-medium px-4 py-2 rounded-md transition-colors"
                  >
                    Load
                  </button>
                </div>
              </Card>

              {refundNote && (
                <div className="mb-4 text-sm font-medium px-4 py-2.5 rounded-md border bg-ok/5 text-ok border-ok/20 flex items-center justify-between gap-3">
                  <span>{refundNote}</span>
                  <button onClick={() => setRefundNote('')} className="text-ink-muted hover:text-ink transition-colors"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}

              {txLoading && <div className="text-center text-ink-muted py-12 text-sm">Loading...</div>}

              {!txLoading && txError && (
                <div className="mb-4 text-sm px-4 py-2.5 rounded-md border bg-bad/5 text-bad border-bad/20 flex items-center justify-between gap-3">
                  <span>{txError}</span>
                  <button onClick={() => loadTransactions(txPage, txFrom, txTo, txSearch)} className="text-xs font-medium underline underline-offset-2">Retry</button>
                </div>
              )}

              {!txLoading && !txError && txItems.length === 0 && (
                <Card className="text-center text-ink-muted py-12 text-sm">
                  No transactions found
                </Card>
              )}

              {!txLoading && txItems.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="px-5 py-2.5 border-b border-line-soft bg-paper/50 grid grid-cols-[1fr_1fr_90px_80px_100px_90px] gap-3 text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                    <span>Golfer</span>
                    <span>Detail</span>
                    <span>Amount</span>
                    <span>GR Fee</span>
                    <span>Status</span>
                    <span>Date</span>
                  </div>
                  <div className="divide-y divide-line-soft">
                    {txItems.map(tx => {
                      const st = TX_STATUS[tx.status] ?? { dot: 'neutral', label: tx.status };
                      return (
                        <div key={tx.id} className="px-5 py-3 grid grid-cols-[1fr_1fr_90px_80px_100px_90px] gap-3 items-center hover:bg-paper/50 transition-colors">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink truncate">{tx.golferName}</div>
                            <div className="text-xs text-ink-muted truncate">{tx.golferEmail}</div>
                          </div>
                          <div className="text-xs text-ink-soft truncate">
                            {tx.detail}
                            {tx.status === 'fee_charged' && tx.type === 'booking' && (
                              <button
                                onClick={() => openOperate(tx.date)}
                                className="ml-1.5 text-pine hover:underline"
                              >View</button>
                            )}
                            {tx.type === 'booking' && (tx.status === 'completed' || tx.status === 'paid') && (
                              <button
                                onClick={() => { setRefundTarget(tx); setRefundAmount(''); setRefundReason(''); setRefundError(''); }}
                                className="ml-1.5 text-ink-muted hover:text-bad hover:underline"
                              >Refund</button>
                            )}
                          </div>
                          <div className="text-sm font-medium text-ink tabular-nums">{fmtMoney(tx.amount)}</div>
                          <div className="text-xs text-ok tabular-nums">{tx.platformFee > 0 ? fmtMoney(tx.platformFee) : '—'}</div>
                          <div><StatusDot status={st.dot} label={st.label} /></div>
                          <div className="text-xs text-ink-muted tabular-nums">{fmtDate(tx.date)}</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {!txLoading && txPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-ink-muted">Page {txPage} of {txPages} · {txTotal} total</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { const p = txPage - 1; setTxPage(p); loadTransactions(p, txFrom, txTo, txSearch); }}
                      disabled={txPage <= 1}
                      className="text-sm text-ink-soft hover:text-ink disabled:opacity-30 px-3 py-1.5 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors"
                    >Prev</button>
                    <button
                      onClick={() => { const p = txPage + 1; setTxPage(p); loadTransactions(p, txFrom, txTo, txSearch); }}
                      disabled={txPage >= txPages}
                      className="text-sm text-ink-soft hover:text-ink disabled:opacity-30 px-3 py-1.5 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors"
                    >Next</button>
                  </div>
                </div>
              )}
            </div>
          );
}
