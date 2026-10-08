import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ImagePlus, LogOut, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Site } from '@/components/enkop/Site';
import { getStudio, pollTour, startTour } from '@/lib/tours.functions';
import { HomepageManager } from '@/components/enkop/HomepageManager';

export const Route = createFileRoute('/admin')({
  ssr: false,
  head: () => ({ meta: [
    { title: 'Tour Studio | ENKOP Administration' },
    { name: 'description', content: 'ENKOP administrators upload property photos and create cinematic property-tour videos.' },
    { property: 'og:title', content: 'Tour Studio | ENKOP' },
    { property: 'og:description', content: 'Create cinematic property tours from photographs.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: Admin,
});

type Studio = Awaited<ReturnType<typeof getStudio>>;
type Tour = Studio['tours'][number];

function Admin() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return <Site><section className="interior-hero page-gutter studio-hero"><p className="eyebrow">ENKOP / ADMINISTRATION</p><h1>Tour<br/><em>studio.</em></h1></section>
    <section className="studio page-gutter">{session === undefined ? <p className="studio-muted">Loading…</p> : session ? <StudioPanel /> : <SignIn />}</section>
  </Site>;
}

function SignIn() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email: String(f.get('email')), password: String(f.get('password')) });
    if (error) setError(error.message);
    setBusy(false);
  }
  return <form className="enquiry-form studio-signin" onSubmit={submit}><p className="eyebrow">ADMINISTRATOR SIGN IN</p>
    <label>Email<input name="email" type="email" required autoComplete="email" /></label>
    <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
    {error && <p className="studio-error" role="alert">{error}</p>}
    <Button type="submit" variant="luxury" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} /></Button></form>;
}

function StudioPanel() {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<'tours' | 'homepage'>('tours');
  const load = useCallback(() => getStudio().then(setStudio).catch((e) => setLoadError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const signOut = <Button variant="textArrow" onClick={() => supabase.auth.signOut()}>Sign out <LogOut size={15} /></Button>;
  if (loadError) return <div><p className="studio-error">{loadError}</p>{signOut}</div>;
  if (!studio) return <p className="studio-muted">Loading the studio…</p>;
  if (!studio.isAdmin) return <div><p className="studio-muted">This account does not have administrator access.</p>{signOut}</div>;
  return <><div className="studio-tabs" role="tablist">{([['tours', 'Property tours'], ['homepage', 'Homepage scenes']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
  {tab === 'homepage' ? <HomepageManager /> : <div className="studio-grid"><CreateTour properties={studio.properties} busy={studio.tours.some(t => t.status === 'queued' || t.status === 'in_progress')} onCreated={load} />
    <div><div className="studio-head"><p className="eyebrow">RECENT TOURS</p>{signOut}</div><TourList tours={studio.tours} properties={studio.properties} onChange={load} /></div></div>}</>;
}

function CreateTour({ properties, busy, onCreated }: { properties: Studio['properties']; busy: boolean; onCreated: () => void }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [direction, setDirection] = useState('');
  const [state, setState] = useState<'idle' | 'uploading' | 'starting'>('idle');
  const [error, setError] = useState('');
  const previews = files.map(f => URL.createObjectURL(f));
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [files]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(list: FileList | null) {
    if (!list) return;
    const ok = Array.from(list).filter(f => /^image\/(png|jpeg|webp)$/.test(f.type) && f.size <= 8 * 1024 * 1024);
    if (ok.length < list.length) setError('Use JPG, PNG or WebP photos under 8 MB.'); else setError('');
    setFiles(prev => [...prev, ...ok].slice(0, 3));
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (!propertyId || !files.length) { setError('Choose a property and at least one photo.'); return; }
    try {
      setState('uploading');
      const paths = await Promise.all(files.map(async (file, i) => {
        const ext = (file.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
        const path = `${propertyId}/photos/${Date.now()}-${i}.${ext}`;
        const { error } = await supabase.storage.from('property-media').upload(path, file, { contentType: file.type });
        if (error) throw new Error('A photo could not be uploaded. Please try again.');
        return path;
      }));
      setState('starting');
      await startTour({ data: { propertyId, photoPaths: paths, direction } });
      setFiles([]); setDirection(''); onCreated();
    } catch (err) { setError(err instanceof Error ? err.message : 'The tour could not be started.'); }
    finally { setState('idle'); }
  }

  return <form className="enquiry-form" onSubmit={submit}><p className="eyebrow">NEW CINEMATIC TOUR</p>
    <label>Property<select value={propertyId} onChange={e => setPropertyId(e.target.value)}>{properties.map(p => <option key={p.id} value={p.id}>{p.title} — {p.neighborhood}</option>)}</select></label>
    <div><span className="studio-label">Photos · up to 3 · the first opens the tour</span>
      <div className="studio-photos">{previews.map((src, i) => <div key={src} className="studio-photo"><img src={src} alt={`Selected photo ${i + 1}`} /><button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={14} /></button></div>)}
        {files.length < 3 && <label className="studio-add"><ImagePlus size={22} /><span>Add photo</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { pick(e.target.files); e.target.value = ''; }} /></label>}</div></div>
    <label>Direction (optional)<textarea rows={3} maxLength={500} value={direction} onChange={e => setDirection(e.target.value)} placeholder="e.g. Golden hour, begin at the entrance and glide toward the garden." /></label>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {busy && <p className="studio-muted">A tour is generating. You can start another once it finishes.</p>}
    <Button type="submit" variant="luxury" disabled={state !== 'idle' || busy || !files.length}>{state === 'uploading' ? 'Uploading photos…' : state === 'starting' ? 'Starting…' : 'Create tour'} <ArrowRight size={16} /></Button>
    <p className="studio-muted">Each tour is an 8-second clip and uses AI credits. Generation takes one to three minutes.</p></form>;
}

function TourList({ tours, properties, onChange }: { tours: Tour[]; properties: Studio['properties']; onChange: () => void }) {
  const [live, setLive] = useState<Record<string, Tour>>({});
  const [pollError, setPollError] = useState('');
  const changed = useRef(onChange); changed.current = onChange;
  const pending = tours.find(t => t.status === 'queued' || t.status === 'in_progress');
  useEffect(() => {
    if (!pending) return;
    let stop = false;
    const tick = async () => {
      try {
        const t = await pollTour({ data: { tourId: pending.id } });
        if (stop) return;
        setPollError(''); setLive(l => ({ ...l, [t.id]: t }));
        if (t.status === 'completed' || t.status === 'failed') { changed.current(); return; }
      } catch (e) { if (!stop) setPollError(e instanceof Error ? e.message : 'Status check failed.'); }
      if (!stop) timer = window.setTimeout(tick, 8000);
    };
    let timer = window.setTimeout(tick, 4000);
    return () => { stop = true; window.clearTimeout(timer); };
  }, [pending?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tours.length) return <p className="studio-muted">No tours yet. Upload photos to create the first.</p>;
  return <div className="studio-tours">{pollError && <p className="studio-error">{pollError}</p>}{tours.map(base => {
    const t = live[base.id] ?? base;
    const title = properties.find(p => p.id === t.property_id)?.title ?? 'Property';
    return <article key={t.id} className="studio-tour">
      {t.video_url ? <video src={t.video_url} controls playsInline preload="metadata" /> : <div className="studio-tour-placeholder">{t.status === 'failed' ? 'Not created' : `Generating${t.progress ? ` · ${t.progress}%` : '…'}`}</div>}
      <div><strong>{title}</strong><span>{new Date(t.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        {t.status === 'failed' && <p className="studio-error">{t.error}</p>}
        {t.video_url && <a className="inline-arrow" href={t.video_url} download>Download <ArrowRight size={15} /></a>}</div>
    </article>;
  })}</div>;
}
