import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { uploadMedia } from '@/lib/admin-client';
import { Button } from '@/components/ui/button';
import { deleteListing, getListings, saveListing } from '@/lib/listings.functions';
import { formatPrice } from '@/lib/enkop';

type Listing = Awaited<ReturnType<typeof getListings>>[number];

type Draft = {
  id: string | null;
  title: string; slug: string; neighborhood: string; city: string;
  property_type: string; listing_type: 'Sale' | 'Rent';
  price: string; currency: string;
  bedrooms: string; bathrooms: string; area_sqm: string; parking: string;
  description: string; amenities: string;
  image_paths: string[]; status: 'draft' | 'published'; featured: boolean;
  links: Record<string, string>; map_query: string;
};

const emptyDraft: Draft = {
  id: null, title: '', slug: '', neighborhood: '', city: 'Nairobi',
  property_type: 'Villa', listing_type: 'Sale', price: '', currency: 'KES',
  bedrooms: '4', bathrooms: '3', area_sqm: '', parking: '2',
  description: '', amenities: '', image_paths: [], status: 'draft', featured: false,
  links: {}, map_query: '',
};

export const LINK_KEYS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['listing', 'External listing page'], ['tour', 'Virtual tour / walkthrough']] as const;

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function ListingsManager() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = () => getListings().then(setListings).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    try { await deleteListing({ data: { id } }); setConfirmId(null); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Delete failed.'); }
  }

  if (error) return <p className="studio-error">{error}</p>;
  if (!listings) return <p className="studio-muted">Loading listings…</p>;

  if (draft) return <ListingEditor draft={draft} onDone={(saved) => { setDraft(null); if (saved) load(); }} />;

  return <div>
    <div className="studio-head"><p className="eyebrow">LISTINGS · {listings.length.toString().padStart(2, '0')}</p>
      <Button variant="luxury" onClick={() => setDraft(emptyDraft)}>New listing <Plus size={16} /></Button></div>
    {!listings.length && <p className="studio-muted">No listings yet. Add the first.</p>}
    <div className="listing-rows">{listings.map((l) => <article key={l.id} className="listing-row">
      {l.photo_urls?.[0] ? <img src={l.photo_urls[0]} alt="" /> : <div className="listing-row-blank" aria-hidden="true" />}
      <div className="listing-row-main">
        <strong>{l.title}</strong>
        <span>{l.neighborhood}, {l.city} · {formatPrice(l)}</span>
        <span className="listing-row-meta">{l.status === 'published' ? 'Published' : 'Draft'}{l.featured ? ' · Featured' : ''}{l.is_sample ? ' · Illustrative' : ''}</span>
      </div>
      <div className="listing-row-actions">
        <Button variant="textArrow" onClick={() => setDraft({
          id: l.id, title: l.title, slug: l.slug, neighborhood: l.neighborhood, city: l.city,
          property_type: l.property_type, listing_type: l.listing_type === 'Rent' ? 'Rent' : 'Sale',
          price: String(l.price), currency: l.currency, bedrooms: String(l.bedrooms), bathrooms: String(l.bathrooms),
          area_sqm: String(l.area_sqm), parking: String(l.parking), description: l.description,
          amenities: l.amenities.join(', '), image_paths: l.image_paths ?? [],
          status: l.status === 'published' ? 'published' : 'draft', featured: l.featured,
          links: (l.external_links ?? {}) as Record<string, string>, map_query: l.map_query ?? '',
        })}><Pencil size={14} /> Edit</Button>
        {confirmId === l.id
          ? <Button variant="textArrow" onClick={() => remove(l.id)}>Confirm delete <Trash2 size={14} /></Button>
          : <Button variant="textArrow" onClick={() => setConfirmId(l.id)}><Trash2 size={14} /> Delete</Button>}
      </div>
    </article>)}</div>
  </div>;
}

function ListingEditor({ draft: initial, onDone }: { draft: Draft; onDone: (saved: boolean) => void }) {
  const [draft, setDraft] = useState(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [error, setError] = useState('');
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  function pick(list: FileList | null) {
    if (!list) return;
    const ok = Array.from(list).filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type) && f.size <= 10 * 1024 * 1024);
    if (ok.length < list.length) setError('Use JPG, PNG or WebP photos under 10 MB.'); else setError('');
    setFiles((prev) => [...prev, ...ok].slice(0, Math.max(0, 12 - draft.image_paths.length)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    const price = Number(draft.price);
    if (!draft.title || !price) { setError('A title and price are required.'); return; }
    try {
      let imagePaths = draft.image_paths;
      let id = draft.id;
      // New listing: save first to get an id, then upload photos under it.
      if (!id && files.length) {
        setState('saving');
        const created = await saveListing({ data: toPayload({ ...draft, image_paths: [] }, null) });
        id = created.id;
      }
      if (files.length && id) {
        setState('uploading');
        const uploaded = await Promise.all(files.map(async (file, i) => {
          const ext = (file.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
          const path = `${id}/gallery/${Date.now()}-${i}.${ext}`;
          try { return await uploadMedia(path, file); }
          catch { throw new Error('A photo could not be uploaded. Please try again.'); }
        }));
        imagePaths = [...imagePaths, ...uploaded];
      }
      setState('saving');
      await saveListing({ data: toPayload({ ...draft, image_paths: imagePaths }, id) });
      onDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'The listing could not be saved.'); }
    finally { setState('idle'); }
  }

  const previews = files.map((f) => URL.createObjectURL(f));
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [files]); // eslint-disable-line react-hooks/exhaustive-deps

  return <form className="enquiry-form listing-editor" onSubmit={submit}>
    <div className="studio-head"><p className="eyebrow">{draft.id ? 'EDIT LISTING' : 'NEW LISTING'}</p>
      <Button variant="textArrow" type="button" onClick={() => onDone(false)}><X size={14} /> Cancel</Button></div>
    <div className="form-row">
      <label>Title<input value={draft.title} required minLength={3} maxLength={120} onChange={(e) => set({ title: e.target.value, slug: draft.id ? draft.slug : slugify(e.target.value) })} /></label>
      <label>Web address (slug)<input value={draft.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(e) => set({ slug: slugify(e.target.value) })} /></label>
    </div>
    <div className="form-row">
      <label>Neighbourhood<input value={draft.neighborhood} required maxLength={80} onChange={(e) => set({ neighborhood: e.target.value })} /></label>
      <label>City<input value={draft.city} required maxLength={80} onChange={(e) => set({ city: e.target.value })} /></label>
    </div>
    <div className="form-row">
      <label>Property type<select value={draft.property_type} onChange={(e) => set({ property_type: e.target.value })}>{['Villa', 'Apartment', 'Townhouse', 'Penthouse', 'Estate', 'Land'].map((t) => <option key={t}>{t}</option>)}</select></label>
      <label>Listing<select value={draft.listing_type} onChange={(e) => set({ listing_type: e.target.value as 'Sale' | 'Rent' })}><option>Sale</option><option>Rent</option></select></label>
    </div>
    <div className="form-row">
      <label>Price<input type="number" min="1" value={draft.price} required onChange={(e) => set({ price: e.target.value })} /></label>
      <label>Currency<select value={draft.currency} onChange={(e) => set({ currency: e.target.value })}><option>KES</option><option>USD</option><option>EUR</option></select></label>
    </div>
    <div className="form-row">
      <label>Bedrooms<input type="number" min="0" max="50" value={draft.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} /></label>
      <label>Bathrooms<input type="number" min="0" max="50" value={draft.bathrooms} onChange={(e) => set({ bathrooms: e.target.value })} /></label>
      <label>Area (m²)<input type="number" min="0" value={draft.area_sqm} onChange={(e) => set({ area_sqm: e.target.value })} /></label>
      <label>Parking<input type="number" min="0" max="50" value={draft.parking} onChange={(e) => set({ parking: e.target.value })} /></label>
    </div>
    <label>Description<textarea rows={4} maxLength={4000} value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="A short, evocative description of the residence." /></label>
    <label>Amenities (comma separated)<input value={draft.amenities} maxLength={1000} onChange={(e) => set({ amenities: e.target.value })} placeholder="Heated pool, Staff quarters, Garden" /></label>
    <label>Location for map (area or landmark — avoid exact house numbers)<input value={draft.map_query} maxLength={200} onChange={(e) => set({ map_query: e.target.value })} placeholder="Karen, Nairobi" /></label>
    <fieldset className="listing-links"><legend className="studio-label">Explore this property elsewhere · paste real links only</legend>
      {LINK_KEYS.map(([k, label]) => <label key={k}>{label}<input type="url" value={draft.links[k] ?? ''} maxLength={500} placeholder="https://" onChange={(e) => set({ links: { ...draft.links, [k]: e.target.value } })} /></label>)}
    </fieldset>
    <div>
      <span className="studio-label">Photos · up to 12 · the first is the cover</span>
      <div className="studio-photos">
        {draft.image_paths.map((p, i) => <div key={p} className="studio-photo"><span className="studio-photo-name">Photo {i + 1}</span><button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => set({ image_paths: draft.image_paths.filter((x) => x !== p) })}><X size={14} /></button></div>)}
        {previews.map((src, i) => <div key={src} className="studio-photo"><img src={src} alt={`New photo ${i + 1}`} /><button type="button" aria-label={`Remove new photo ${i + 1}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={14} /></button></div>)}
        {draft.image_paths.length + files.length < 12 && <label className="studio-add"><ImagePlus size={22} /><span>Add photo</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { pick(e.target.files); e.target.value = ''; }} /></label>}
      </div>
    </div>
    <div className="form-row">
      <label>Status<select value={draft.status} onChange={(e) => set({ status: e.target.value as 'draft' | 'published' })}><option value="draft">Draft — hidden from the site</option><option value="published">Published — visible to visitors</option></select></label>
      <label className="listing-featured"><input type="checkbox" checked={draft.featured} onChange={(e) => set({ featured: e.target.checked })} /> Feature on the homepage</label>
    </div>
    {error && <p className="studio-error" role="alert">{error}</p>}
    <Button type="submit" variant="luxury" disabled={state !== 'idle'}>{state === 'uploading' ? 'Uploading photos…' : state === 'saving' ? 'Saving…' : 'Save listing'} <ArrowRight size={16} /></Button>
  </form>;
}

function toPayload(d: Draft, id: string | null) {
  return {
    id,
    title: d.title, slug: d.slug, neighborhood: d.neighborhood, city: d.city,
    property_type: d.property_type, listing_type: d.listing_type,
    price: Number(d.price), currency: d.currency,
    bedrooms: Number(d.bedrooms) || 0, bathrooms: Number(d.bathrooms) || 0,
    area_sqm: Number(d.area_sqm) || 0, parking: Number(d.parking) || 0,
    description: d.description,
    amenities: d.amenities.split(',').map((a) => a.trim()).filter(Boolean).slice(0, 30),
    image_paths: d.image_paths, status: d.status, featured: d.featured,
    external_links: Object.fromEntries(Object.entries(d.links).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)),
    map_query: d.map_query.trim() || null,
  };
}
