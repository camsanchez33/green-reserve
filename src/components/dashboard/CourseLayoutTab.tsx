'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

function SectionCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-lg p-5">
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-1">{title}</div>
      {hint && <p className="text-xs text-ink-faint mb-4">{hint}</p>}
      <div className={hint ? 'space-y-3' : 'space-y-3 mt-4'}>{children}</div>
    </div>
  );
}

// Small inline status badge — the shared "no-silent-failures" pattern used
// throughout the dashboard: pending -> explicit success or explicit error,
// never a swallowed catch.
function RowStatus({ saving, saved, error }: { saving: boolean; saved: boolean; error: string }) {
  if (saving) return <span className="text-xs text-ink-faint">Saving…</span>;
  if (error) return <span className="text-xs text-bad flex items-center gap-1"><AlertCircle className="w-3 h-3"/>{error}</span>;
  if (saved) return <span className="text-xs text-ok flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/>Saved</span>;
  return null;
}

type Nine = { id: string; name: string; par: number; sortOrder: number };
type CourseProduct = { id: string; label: string; holes: number; nineIds: string[]; active: boolean; sortOrder: number };
type TeeSetNineRow = { id: string; teeSetId: string; nineId: string; yardage: number };
type ProductRatingRow = { id: string; teeSetId: string; courseProductId: string; rating: number; slope: number };
type TeeSet = { id: string; name: string; yardage: number; rating: number; slope: number; sortOrder: number; nineYardages: TeeSetNineRow[]; productRatings: ProductRatingRow[] };

export default function CourseLayoutTab() {
  const [nines, setNines] = useState<Nine[]>([]);
  const [products, setProducts] = useState<CourseProduct[]>([]);
  const [teeSets, setTeeSets] = useState<TeeSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [ninesRes, productsRes, teeSetsRes] = await Promise.all([
        fetch('/api/operator/nines'),
        fetch('/api/operator/course-products'),
        fetch('/api/operator/tee-sets'),
      ]);
      if (!ninesRes.ok || !productsRes.ok || !teeSetsRes.ok) throw new Error();
      setNines(await ninesRes.json());
      setProducts(await productsRes.json());
      setTeeSets(await teeSetsRes.json());
    } catch {
      setLoadError('Could not load your course layout. Refresh to try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-sm text-ink-muted py-10 text-center">Loading…</div>;
  if (loadError) return (
    <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-sm flex items-center gap-2">
      <AlertCircle className="w-4 h-4"/>{loadError}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-pine/5 border border-pine/20 rounded-md px-4 py-3 text-sm text-ink-soft">
        Most courses don&apos;t need this tab — the Holes/Par/Yardage fields on Course Info are enough for a
        standard 18-hole (or 9-hole) course. Set up Nines and Products here only if you have a 27+ hole layout
        with combos golfers choose between (e.g. &quot;North + South&quot;, &quot;South + West&quot;).
      </div>
      <NinesSection nines={nines} setNines={setNines} products={products} />
      <ProductsSection products={products} setProducts={setProducts} nines={nines} />
      <TeeSetsSection teeSets={teeSets} setTeeSets={setTeeSets} nines={nines} products={products} />
    </div>
  );
}

// ── Nines ────────────────────────────────────────────────────────────────
function NinesSection({ nines, setNines, products }: { nines: Nine[]; setNines: (n: Nine[]) => void; products: CourseProduct[] }) {
  const [draft, setDraft] = useState<{ name: string; par: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  async function addNine() {
    if (!draft?.name.trim()) return;
    setSavingId('new'); setErrorId(null);
    const res = await fetch('/api/operator/nines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draft.name.trim(), par: Number(draft.par) || 36 }),
    });
    const data = await res.json();
    setSavingId(null);
    if (!res.ok) { setErrorId('new'); setErrorMsg(data.error || 'Could not add nine.'); return; }
    setNines([...nines, data]);
    setDraft(null);
  }

  async function updateNine(id: string, patch: Partial<Nine>) {
    setSavingId(id); setErrorId(null);
    const res = await fetch('/api/operator/nines', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    setSavingId(null);
    if (!res.ok) { setErrorId(id); setErrorMsg(data.error || 'Could not save.'); return; }
    setNines(nines.map(n => n.id === id ? data : n));
    setSavedId(id); setTimeout(() => setSavedId(null), 1500);
  }

  async function deleteNine(id: string) {
    const nine = nines.find(n => n.id === id);
    if (!nine) return;
    if (!confirm(`Delete "${nine.name}"? This can't be undone.`)) return;
    setSavingId(id); setErrorId(null);
    const res = await fetch('/api/operator/nines', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    setSavingId(null);
    if (!res.ok) { setErrorId(id); setErrorMsg(data.error || 'Could not delete.'); return; }
    setNines(nines.filter(n => n.id !== id));
  }

  return (
    <SectionCard title="Nines" hint="Named nines on your course — North, South, West, etc.">
      {nines.map(nine => (
        <div key={nine.id} className="flex items-center gap-3">
          <input defaultValue={nine.name} onBlur={e => e.target.value.trim() && e.target.value !== nine.name && updateNine(nine.id, { name: e.target.value.trim() })}
            className={iCls + ' flex-1'} placeholder="Nine name" />
          <input type="number" defaultValue={nine.par} onBlur={e => Number(e.target.value) !== nine.par && updateNine(nine.id, { par: Number(e.target.value) })}
            className={iCls + ' w-20'} placeholder="Par" />
          <RowStatus saving={savingId === nine.id} saved={savedId === nine.id} error={errorId === nine.id ? errorMsg : ''} />
          <button onClick={() => deleteNine(nine.id)} className="text-ink-faint hover:text-bad transition-colors shrink-0" title="Delete nine">
            <Trash2 className="w-4 h-4"/>
          </button>
        </div>
      ))}
      {draft ? (
        <div className="flex items-center gap-3">
          <input autoFocus value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
            className={iCls + ' flex-1'} placeholder="e.g. North" />
          <input type="number" value={draft.par} onChange={e => setDraft({ ...draft, par: e.target.value })}
            className={iCls + ' w-20'} placeholder="36" />
          <button onClick={addNine} disabled={savingId === 'new'} className="text-xs font-medium text-pine hover:underline disabled:opacity-50 shrink-0">
            {savingId === 'new' ? 'Adding…' : 'Add'}
          </button>
          <button onClick={() => setDraft(null)} className="text-xs text-ink-faint hover:text-ink shrink-0">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setDraft({ name: '', par: '36' })} className="flex items-center gap-1.5 text-xs font-medium text-pine hover:underline">
          <Plus className="w-3.5 h-3.5"/> Add a nine
        </button>
      )}
      {errorId === 'new' && <p className="text-xs text-bad">{errorMsg}</p>}
      {nines.length > 0 && products.length === 0 && (
        <p className="text-xs text-ink-faint pt-1">Next: set up Bookable Products below to define which combos golfers can book.</p>
      )}
    </SectionCard>
  );
}

// ── Products ─────────────────────────────────────────────────────────────
function ProductsSection({ products, setProducts, nines }: { products: CourseProduct[]; setProducts: (p: CourseProduct[]) => void; nines: Nine[] }) {
  const [draft, setDraft] = useState<{ label: string; holes: string; nineIds: string[] } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  async function addProduct() {
    if (!draft?.label.trim()) return;
    setSavingId('new'); setErrorId(null);
    const res = await fetch('/api/operator/course-products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: draft.label.trim(), holes: Number(draft.holes) || 18, nineIds: draft.nineIds, active: true }),
    });
    const data = await res.json();
    setSavingId(null);
    if (!res.ok) { setErrorId('new'); setErrorMsg(data.error || 'Could not add product.'); return; }
    setProducts([...products, data]);
    setDraft(null);
  }

  async function updateProduct(id: string, patch: Partial<CourseProduct>) {
    setSavingId(id); setErrorId(null);
    const res = await fetch('/api/operator/course-products', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    setSavingId(null);
    if (!res.ok) { setErrorId(id); setErrorMsg(data.error || 'Could not save.'); return; }
    setProducts(products.map(p => p.id === id ? data : p));
    setSavedId(id); setTimeout(() => setSavedId(null), 1500);
  }

  async function deleteProduct(id: string) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    if (!confirm(`Delete "${product.label}"? This can't be undone.`)) return;
    setSavingId(id); setErrorId(null);
    const res = await fetch('/api/operator/course-products', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setSavingId(null);
    if (!res.ok) { setErrorId(id); setErrorMsg('Could not delete.'); return; }
    setProducts(products.filter(p => p.id !== id));
  }

  function toggleDraftNine(nineId: string) {
    if (!draft) return;
    setDraft({ ...draft, nineIds: draft.nineIds.includes(nineId) ? draft.nineIds.filter(id => id !== nineId) : [...draft.nineIds, nineId] });
  }

  return (
    <SectionCard title="Bookable Products" hint="What a golfer actually books — e.g. &quot;North + South&quot; as an 18-hole round.">
      {nines.length === 0 && products.length === 0 ? (
        <p className="text-sm text-ink-faint">Add at least one nine above before setting up products.</p>
      ) : (
        <>
          {products.map(product => (
            <div key={product.id} className="border border-line-soft rounded-md p-3 space-y-2">
              <div className="flex items-center gap-3">
                <input defaultValue={product.label} onBlur={e => e.target.value.trim() && e.target.value !== product.label && updateProduct(product.id, { label: e.target.value.trim() })}
                  className={iCls + ' flex-1'} placeholder="e.g. North + South" />
                <select defaultValue={product.holes} onChange={e => updateProduct(product.id, { holes: Number(e.target.value) })} className={iCls + ' w-28'}>
                  <option value={18}>18 holes</option>
                  <option value={9}>9 holes</option>
                </select>
                <button onClick={() => updateProduct(product.id, { active: !product.active })}
                  className={'text-xs font-medium px-2.5 py-1.5 rounded-md shrink-0 transition-colors ' + (product.active ? 'bg-ok/10 text-ok' : 'bg-line-soft text-ink-faint')}>
                  {product.active ? 'Active' : 'Inactive'}
                </button>
                <RowStatus saving={savingId === product.id} saved={savedId === product.id} error={errorId === product.id ? errorMsg : ''} />
                <button onClick={() => deleteProduct(product.id)} className="text-ink-faint hover:text-bad transition-colors shrink-0" title="Delete product">
                  <Trash2 className="w-4 h-4"/>
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {nines.map(nine => {
                  const checked = product.nineIds.includes(nine.id);
                  return (
                    <button key={nine.id}
                      onClick={() => updateProduct(product.id, { nineIds: checked ? product.nineIds.filter(id => id !== nine.id) : [...product.nineIds, nine.id] })}
                      className={'text-xs px-2.5 py-1 rounded-md border transition-colors ' + (checked ? 'bg-pine text-white border-pine' : 'bg-paper text-ink-soft border-line hover:border-line-strong')}>
                      {nine.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {draft ? (
            <div className="border border-line-soft rounded-md p-3 space-y-2">
              <div className="flex items-center gap-3">
                <input autoFocus value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })}
                  className={iCls + ' flex-1'} placeholder="e.g. North + South" />
                <select value={draft.holes} onChange={e => setDraft({ ...draft, holes: e.target.value })} className={iCls + ' w-28'}>
                  <option value={18}>18 holes</option>
                  <option value={9}>9 holes</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {nines.map(nine => (
                  <button key={nine.id} onClick={() => toggleDraftNine(nine.id)}
                    className={'text-xs px-2.5 py-1 rounded-md border transition-colors ' + (draft.nineIds.includes(nine.id) ? 'bg-pine text-white border-pine' : 'bg-paper text-ink-soft border-line hover:border-line-strong')}>
                    {nine.name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={addProduct} disabled={savingId === 'new'} className="text-xs font-medium text-pine hover:underline disabled:opacity-50">
                  {savingId === 'new' ? 'Adding…' : 'Add product'}
                </button>
                <button onClick={() => setDraft(null)} className="text-xs text-ink-faint hover:text-ink">Cancel</button>
              </div>
              {errorId === 'new' && <p className="text-xs text-bad">{errorMsg}</p>}
            </div>
          ) : (
            <button onClick={() => setDraft({ label: '', holes: '18', nineIds: [] })} className="flex items-center gap-1.5 text-xs font-medium text-pine hover:underline">
              <Plus className="w-3.5 h-3.5"/> Add a product
            </button>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ── Tee Sets ─────────────────────────────────────────────────────────────
function TeeSetsSection({ teeSets, setTeeSets, nines, products }: {
  teeSets: TeeSet[]; setTeeSets: (t: TeeSet[]) => void; nines: Nine[]; products: CourseProduct[];
}) {
  const [draft, setDraft] = useState<{ name: string; yardage: string; rating: string; slope: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  async function addTeeSet() {
    if (!draft?.name.trim()) return;
    setSavingId('new'); setErrorId(null);
    const res = await fetch('/api/operator/tee-sets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draft.name.trim(), yardage: Number(draft.yardage) || 0, rating: Number(draft.rating) || 0, slope: Number(draft.slope) || 0 }),
    });
    const data = await res.json();
    setSavingId(null);
    if (!res.ok) { setErrorId('new'); setErrorMsg(data.error || 'Could not add tee set.'); return; }
    setTeeSets([...teeSets, data]);
    setDraft(null);
  }

  async function patchTeeSet(id: string, patch: Record<string, unknown>) {
    setSavingId(id); setErrorId(null);
    const res = await fetch('/api/operator/tee-sets', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    setSavingId(null);
    if (!res.ok) { setErrorId(id); setErrorMsg(data.error || 'Could not save.'); return; }
    setTeeSets(teeSets.map(t => t.id === id ? data : t));
    setSavedId(id); setTimeout(() => setSavedId(null), 1500);
  }

  function setNineYardage(teeSet: TeeSet, nineId: string, yardage: number) {
    const nineYardages = teeSet.nineYardages.filter(y => y.nineId !== nineId);
    nineYardages.push({ id: '', teeSetId: teeSet.id, nineId, yardage });
    patchTeeSet(teeSet.id, { nineYardages: nineYardages.map(y => ({ nineId: y.nineId, yardage: y.yardage })) });
  }

  function setProductRating(teeSet: TeeSet, courseProductId: string, field: 'rating' | 'slope', value: number) {
    const existing = teeSet.productRatings.find(r => r.courseProductId === courseProductId);
    const productRatings = teeSet.productRatings.filter(r => r.courseProductId !== courseProductId);
    productRatings.push({
      id: '', teeSetId: teeSet.id, courseProductId,
      rating: field === 'rating' ? value : (existing?.rating ?? 0),
      slope: field === 'slope' ? value : (existing?.slope ?? 0),
    });
    patchTeeSet(teeSet.id, { productRatings: productRatings.map(r => ({ courseProductId: r.courseProductId, rating: r.rating, slope: r.slope })) });
  }

  async function deleteTeeSet(id: string) {
    const teeSet = teeSets.find(t => t.id === id);
    if (!teeSet) return;
    if (!confirm(`Delete "${teeSet.name}"? This can't be undone.`)) return;
    setSavingId(id); setErrorId(null);
    const res = await fetch('/api/operator/tee-sets', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setSavingId(null);
    if (!res.ok) { setErrorId(id); setErrorMsg('Could not delete.'); return; }
    setTeeSets(teeSets.filter(t => t.id !== id));
  }

  return (
    <SectionCard title="Tee Sets" hint="Tee boxes (Blue/White/Red...) with per-nine yardage and per-product rating/slope, if configured above.">
      {teeSets.map(teeSet => (
        <div key={teeSet.id} className="border border-line-soft rounded-md p-3 space-y-3">
          <div className="flex items-center gap-3">
            <input defaultValue={teeSet.name} onBlur={e => e.target.value.trim() && e.target.value !== teeSet.name && patchTeeSet(teeSet.id, { name: e.target.value.trim() })}
              className={iCls + ' flex-1'} placeholder="Tee name" />
            <input type="number" defaultValue={teeSet.yardage} onBlur={e => Number(e.target.value) !== teeSet.yardage && patchTeeSet(teeSet.id, { yardage: Number(e.target.value) })}
              className={iCls + ' w-24'} placeholder="Yardage" title="Total yardage" />
            <input type="number" step="0.1" defaultValue={teeSet.rating} onBlur={e => Number(e.target.value) !== teeSet.rating && patchTeeSet(teeSet.id, { rating: Number(e.target.value) })}
              className={iCls + ' w-20'} placeholder="Rating" title="Course rating" />
            <input type="number" defaultValue={teeSet.slope} onBlur={e => Number(e.target.value) !== teeSet.slope && patchTeeSet(teeSet.id, { slope: Number(e.target.value) })}
              className={iCls + ' w-20'} placeholder="Slope" title="Slope" />
            <RowStatus saving={savingId === teeSet.id} saved={savedId === teeSet.id} error={errorId === teeSet.id ? errorMsg : ''} />
            <button onClick={() => deleteTeeSet(teeSet.id)} className="text-ink-faint hover:text-bad transition-colors shrink-0" title="Delete tee set">
              <Trash2 className="w-4 h-4"/>
            </button>
          </div>

          {nines.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-ink-faint mb-1.5">Per-nine yardage</div>
              <div className="flex flex-wrap gap-2">
                {nines.map(nine => {
                  const row = teeSet.nineYardages.find(y => y.nineId === nine.id);
                  return (
                    <div key={nine.id} className="flex items-center gap-1.5">
                      <span className="text-xs text-ink-muted">{nine.name}</span>
                      <input type="number" defaultValue={row?.yardage || ''} placeholder="0"
                        onBlur={e => setNineYardage(teeSet, nine.id, Number(e.target.value) || 0)}
                        className="w-16 bg-paper border border-line rounded-md px-2 py-1 text-xs text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {products.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.06em] text-ink-faint mb-1.5">Per-product rating / slope</div>
              <div className="flex flex-wrap gap-3">
                {products.map(product => {
                  const row = teeSet.productRatings.find(r => r.courseProductId === product.id);
                  return (
                    <div key={product.id} className="flex items-center gap-1.5">
                      <span className="text-xs text-ink-muted">{product.label}</span>
                      <input type="number" step="0.1" defaultValue={row?.rating || ''} placeholder="Rtg"
                        onBlur={e => setProductRating(teeSet, product.id, 'rating', Number(e.target.value) || 0)}
                        className="w-16 bg-paper border border-line rounded-md px-2 py-1 text-xs text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10" />
                      <input type="number" defaultValue={row?.slope || ''} placeholder="Slp"
                        onBlur={e => setProductRating(teeSet, product.id, 'slope', Number(e.target.value) || 0)}
                        className="w-16 bg-paper border border-line rounded-md px-2 py-1 text-xs text-ink outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      {draft ? (
        <div className="flex items-center gap-3">
          <input autoFocus value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
            className={iCls + ' flex-1'} placeholder="e.g. Blue" />
          <input type="number" value={draft.yardage} onChange={e => setDraft({ ...draft, yardage: e.target.value })} className={iCls + ' w-24'} placeholder="Yardage" />
          <input type="number" step="0.1" value={draft.rating} onChange={e => setDraft({ ...draft, rating: e.target.value })} className={iCls + ' w-20'} placeholder="Rating" />
          <input type="number" value={draft.slope} onChange={e => setDraft({ ...draft, slope: e.target.value })} className={iCls + ' w-20'} placeholder="Slope" />
          <button onClick={addTeeSet} disabled={savingId === 'new'} className="text-xs font-medium text-pine hover:underline disabled:opacity-50 shrink-0">
            {savingId === 'new' ? 'Adding…' : 'Add'}
          </button>
          <button onClick={() => setDraft(null)} className="text-xs text-ink-faint hover:text-ink shrink-0">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setDraft({ name: '', yardage: '', rating: '', slope: '' })} className="flex items-center gap-1.5 text-xs font-medium text-pine hover:underline">
          <Plus className="w-3.5 h-3.5"/> Add a tee set
        </button>
      )}
      {errorId === 'new' && <p className="text-xs text-bad">{errorMsg}</p>}
    </SectionCard>
  );
}
