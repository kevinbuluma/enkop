import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useServerFn } from '@tanstack/react-start';
import { uploadMedia } from '@/lib/admin-client';
import { Button } from '@/components/ui/button';
import { deleteContent, getContentAdmin, saveSeasonSettings, saveTeamMember, saveTestimonial } from '@/lib/content.functions';
import { computeSeason, seasonLabels, toConfig, type SeasonSettings } from '@/lib/season';

type Admin = Awaited<ReturnType<typeof getContentAdmin>>;
const defaults: SeasonSettings = { enabled: true, seasonalProfile: 'tropical', hemisphere: 'south', timeZone: 'Africa/Nairobi', location: 'Nairobi, Kenya', intensity: 1, customRanges: [] };
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function useAdmin() {
  const fetch = useServerFn(getContentAdmin);
  const [data, setData] = useState<Admin | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { fetch().then(setData).catch(e => setError(e.message)); }, [fetch]);
  useEffect(load, [load]);
  return { data, error, load };
}

export function SeasonManager() {
  const { data, error, load } = useAdmin();
  const save = useServerFn(saveSeasonSettings);
  const [s, setS] = useState<SeasonSettings>(defaults);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (data?.season) setS(data.season); }, [data]);
  if (error) return <p className="studio-error" role="alert">{error}</p>;
  if (!data) return <p className="studio-muted">Loading seasonal settings…</p>;
  const set = (p: Partial<SeasonSettings>) => { setS({ ...s, ...p }); setMsg(''); };
  const preview = computeSeason(new Date(), toConfig(s));
  return <form className="studio-panel listing-editor" onSubmit={async e => { e.preventDefault(); try { await save({ data: s }); setMsg('Saved — visitors see the change on their next page load.'); load(); } catch (err) { setMsg((err as Error).message); } }}>
    <div className="studio-head"><h2>Seasonal atmosphere</h2><p className="studio-muted">Today shows: <strong>{seasonLabels[preview] ?? preview}</strong></p></div>
    <label className="listing-featured"><input type="checkbox" checked={s.enabled} onChange={e => set({ enabled: e.target.checked })} /> Show seasonal atmosphere on the site</label>
    <div className="form-row">
      <label>Climate profile<select value={s.seasonalProfile} onChange={e => set({ seasonalProfile: e.target.value as SeasonSettings['seasonalProfile'] })}><option value="tropical">Kenya tropical (dry / long rains / cool / short rains)</option><option value="temperate-four-season">Four seasons (winter, spring, summer, autumn)</option><option value="custom">Custom month ranges</option></select></label>
      <label>Hemisphere<select value={s.hemisphere} onChange={e => set({ hemisphere: e.target.value as 'north' | 'south' })}><option value="south">Southern</option><option value="north">Northern</option></select></label>
    </div>
    <div className="form-row">
      <label>Location label<input value={s.location} maxLength={80} onChange={e => set({ location: e.target.value })} /></label>
      <label>Time zone<select value={s.timeZone} onChange={e => set({ timeZone: e.target.value })}>{['Africa/Nairobi', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Australia/Sydney', 'UTC'].map(z => <option key={z}>{z}</option>)}</select></label>
    </div>
    <label>Effect intensity · {Math.round(s.intensity * 100)}%<input type="range" min="0" max="1" step="0.1" value={s.intensity} onChange={e => set({ intensity: Number(e.target.value) })} /></label>
    {s.seasonalProfile === 'custom' && <fieldset className="listing-links"><legend className="studio-label">Custom ranges (first match wins)</legend>
      {s.customRanges.map((r, i) => <div key={i} className="form-row">
        <label>From<select value={r.from} onChange={e => set({ customRanges: s.customRanges.map((x, j) => j === i ? { ...x, from: Number(e.target.value) } : x) })}>{months.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}</select></label>
        <label>To<select value={r.to} onChange={e => set({ customRanges: s.customRanges.map((x, j) => j === i ? { ...x, to: Number(e.target.value) } : x) })}>{months.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}</select></label>
        <label>Mood<select value={r.season} onChange={e => set({ customRanges: s.customRanges.map((x, j) => j === i ? { ...x, season: e.target.value as typeof r.season } : x) })}>{Object.entries(seasonLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <Button type="button" variant="textArrow" onClick={() => set({ customRanges: s.customRanges.filter((_, j) => j !== i) })}><Trash2 size={14} /> Remove</Button>
      </div>)}
      {s.customRanges.length < 12 && <Button type="button" variant="textArrow" onClick={() => set({ customRanges: [...s.customRanges, { from: 1, to: 2, season: 'dry-warm' }] })}><Plus size={14} /> Add range</Button>}
    </fieldset>}
    <p className="studio-muted">Preview a season on the homepage (only for you, just this visit): {['winter', 'spring', 'summer', 'autumn', 'long-rains', 'short-rains', 'dry-warm', 'cool-dry'].map(k => <a key={k} href={`/?season=${k}`} target="_blank" rel="noopener noreferrer" style={{ marginRight: 12, textDecoration: 'underline' }}>{seasonLabels[k]}</a>)}<a href="/?season=auto" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>End preview</a></p>
    <p className="studio-muted">Rain seasons bring the storm atmosphere: clouds over page changes, rainfall and rain on glass. Intensity below 1 makes it gentler; visitors can choose Gentle or Off from the footer, and reduced-motion visitors get a still version.</p>
    {msg && <p className="studio-muted" role="status">{msg}</p>}
    <Button type="submit" variant="primary">Save seasonal settings <ArrowRight size={16} /></Button>
  </form>;
}

type Member = { id: string | null; name: string; role: string; bio: string; photo_path: string | null; position: number; active: boolean; photo_url?: string | null };

export function TeamManager() {
  const { data, error, load } = useAdmin();
  const save = useServerFn(saveTeamMember);
  const del = useServerFn(deleteContent);
  const [edit, setEdit] = useState<Member | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (error) return <p className="studio-error" role="alert">{error}</p>;
  if (!data) return <p className="studio-muted">Loading team…</p>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!edit) return; setBusy(true); setMsg('');
    try {
      let photo_path = edit.photo_path;
      if (file) {
        if (file.size > 8 * 1024 * 1024) throw new Error('Portraits must be under 8MB.');
        const path = `team/${crypto.randomUUID()}.${file.name.split('.').pop()?.toLowerCase() || 'jpg'}`;
        try { await uploadMedia(path, file); }
        catch { throw new Error('The portrait could not be uploaded.'); }
        photo_path = path;
      }
      await save({ data: { id: edit.id, name: edit.name, role: edit.role, bio: edit.bio, photo_path, position: edit.position, active: edit.active } });
      setEdit(null); setFile(null); load();
    } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  };
  return <div className="studio-panel">
    <div className="studio-head"><h2>Team</h2><Button variant="textArrow" onClick={() => { setEdit({ id: null, name: '', role: '', bio: '', photo_path: null, position: data.team.length, active: true }); setFile(null); setMsg(''); }}>New member <Plus size={14} /></Button></div>
    {msg && !edit && <p className="studio-error" role="alert">{msg}</p>}
    <div className="listing-rows">{data.team.map((m: Member) => <div key={m.id} className="listing-row">
      {m.photo_url ? <img src={m.photo_url} alt="" /> : <span className="team-initial">{m.name[0]}</span>}
      <div><strong>{m.name}</strong><span className="listing-row-meta">{m.role}{m.active ? '' : ' · Hidden'}{m.bio ? '' : ' · No bio yet'}{m.photo_url ? '' : ' · No portrait yet'}</span></div>
      <div className="listing-row-actions"><Button variant="textArrow" onClick={() => { setEdit(m); setFile(null); }}>Edit</Button><Button variant="textArrow" aria-label={`Remove ${m.name}`} onClick={async () => { if (!confirm(`Remove ${m.name}?`)) return; setMsg(''); try { await del({ data: { table: 'team_members', id: m.id! } }); } catch (err) { setMsg((err as Error).message || 'The team member could not be removed.'); } load(); }}><Trash2 size={14} /></Button></div>
    </div>)}</div>
    {edit && <form className="listing-editor" onSubmit={submit}>
      <div className="form-row"><label>Name<input required minLength={2} maxLength={100} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></label><label>Role<input maxLength={100} value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value })} /></label></div>
      <label>Biography<textarea rows={4} maxLength={1500} value={edit.bio} onChange={e => setEdit({ ...edit, bio: e.target.value })} placeholder="A few sentences in their own voice." /></label>
      <div className="form-row"><label>Order<input type="number" min="0" value={edit.position} onChange={e => setEdit({ ...edit, position: Number(e.target.value) || 0 })} /></label><label className="listing-featured"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> Show on the site</label></div>
      <label className="studio-add"><ImagePlus size={20} /><span>{file ? file.name : edit.photo_path ? 'Replace portrait' : 'Upload portrait'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
      {msg && <p className="studio-error" role="alert">{msg}</p>}
      <div className="form-row"><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save member'} <ArrowRight size={16} /></Button><Button type="button" variant="textArrow" onClick={() => { setEdit(null); setFile(null); }}>Cancel</Button></div>
    </form>}
  </div>;
}

type Quote = { id: string | null; quote: string; author: string; context: string; approved: boolean; position: number };

export function TestimonialsManager() {
  const { data, error, load } = useAdmin();
  const save = useServerFn(saveTestimonial);
  const del = useServerFn(deleteContent);
  const [edit, setEdit] = useState<Quote | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (error) return <p className="studio-error" role="alert">{error}</p>;
  if (!data) return <p className="studio-muted">Loading testimonials…</p>;
  return <div className="studio-panel">
    <div className="studio-head"><h2>Testimonials</h2><Button variant="textArrow" onClick={() => setEdit({ id: null, quote: '', author: '', context: '', approved: false, position: data.testimonials.length })}>New quote <Plus size={14} /></Button></div>
    <p className="studio-muted">Only quotes marked “Approved by the client” appear on the site.</p>
    {data.testimonials.length === 0 && !edit && <p className="studio-muted">No testimonials yet. The section stays hidden until you approve one.</p>}
    <div className="listing-rows">{data.testimonials.map((q: Quote) => <div key={q.id} className="listing-row">
      <div><strong>“{q.quote.slice(0, 90)}{q.quote.length > 90 ? '…' : ''}”</strong><span className="listing-row-meta">{q.author}{q.context ? ` · ${q.context}` : ''} · {q.approved ? 'Approved' : 'Awaiting approval'}</span></div>
      <div className="listing-row-actions"><Button variant="textArrow" onClick={() => setEdit(q)}>Edit</Button><Button variant="textArrow" aria-label="Delete this testimonial" onClick={async () => { if (!confirm('Delete this testimonial?')) return; setMsg(''); try { await del({ data: { table: 'testimonials', id: q.id! } }); } catch (err) { setMsg((err as Error).message || 'The testimonial could not be deleted.'); } load(); }}><Trash2 size={14} /></Button></div>
    </div>)}</div>
    {msg && !edit && <p className="studio-error" role="alert">{msg}</p>}
    {edit && <form className="listing-editor" onSubmit={async e => { e.preventDefault(); if (busy) return; setMsg(''); setBusy(true); try { await save({ data: edit }); setEdit(null); load(); } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); } }}>
      <label>Quote<textarea required minLength={5} rows={4} maxLength={1200} value={edit.quote} onChange={e => setEdit({ ...edit, quote: e.target.value })} /></label>
      <div className="form-row"><label>Client name<input required minLength={2} maxLength={100} value={edit.author} onChange={e => setEdit({ ...edit, author: e.target.value })} /></label><label>Context (optional)<input maxLength={120} value={edit.context} onChange={e => setEdit({ ...edit, context: e.target.value })} placeholder="Bought in Karen, 2026" /></label></div>
      <div className="form-row"><label>Order<input type="number" min="0" value={edit.position} onChange={e => setEdit({ ...edit, position: Number(e.target.value) || 0 })} /></label><label className="listing-featured"><input type="checkbox" checked={edit.approved} onChange={e => setEdit({ ...edit, approved: e.target.checked })} /> Approved by the client</label></div>
      {msg && <p className="studio-error" role="alert">{msg}</p>}
      <div className="form-row"><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save quote'} <ArrowRight size={16} /></Button><Button type="button" variant="textArrow" onClick={() => setEdit(null)}>Cancel</Button></div>
    </form>}
  </div>;
}
