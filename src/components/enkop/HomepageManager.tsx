import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Film, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { deleteSlide, getSlideAdmin, reorderSlides, saveSlide } from '@/lib/slides.functions';

type Data = Awaited<ReturnType<typeof getSlideAdmin>>;
type Slide = Data['slides'][number];

async function uploadMedia(file: File, kind: 'video' | 'image') {
  const okType = kind === 'video' ? /^video\/(mp4|webm)$/ : /^image\/(png|jpeg|webp)$/;
  const max = kind === 'video' ? 50 : 8;
  if (!okType.test(file.type)) throw new Error(kind === 'video' ? 'Use an MP4 or WebM video.' : 'Use a JPG, PNG or WebP image.');
  if (file.size > max * 1024 * 1024) throw new Error(`Files must be under ${max} MB.`);
  const ext = (file.type.split('/')[1] ?? 'bin').replace('jpeg', 'jpg');
  const path = `homepage/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('property-media').upload(path, file, { contentType: file.type });
  if (error) throw new Error('The file could not be uploaded. Please try again.');
  return path;
}

export function HomepageManager() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => getSlideAdmin().then(setData).catch(e => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError('');
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(null); }
  }
  const save = (s: Pick<Slide, 'label' | 'video_path' | 'image_path' | 'active'> & { id: string | null }) =>
    saveSlide({ data: { id: s.id, label: s.label, video_path: s.video_path, image_path: s.image_path, active: s.active } });

  function move(index: number, dir: -1 | 1) {
    if (!data) return;
    const ids = data.slides.map(s => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    setData({ ...data, slides: ids.map(id => data.slides.find(s => s.id === id)!) });
    run('order', () => reorderSlides({ data: { ids } }));
  }

  if (!data) return error ? <p className="studio-error">{error}</p> : <p className="studio-muted">Loading the homepage…</p>;
  const active = data.slides.filter(s => s.active).length;

  return <div className="studio-grid">
    <div className="enquiry-form">
      <p className="eyebrow">ADD A SCENE</p>
      <p className="studio-muted">Scenes play in order at the top of the homepage. Each one can have a video and a still image, which shows while the video loads and for visitors who prefer less motion.</p>
      <div><span className="studio-label">From a finished tour</span>
        {data.tours.length ? <div className="studio-picks">{data.tours.map(t => <button type="button" key={t.id} className="studio-pick" disabled={!!busy} onClick={() => run('add', () => save({ id: null, label: t.title, video_path: t.video_path, image_path: null, active: true }))}>
          {t.video_url ? <video src={t.video_url} muted playsInline preload="metadata" /> : <span />}<span>{t.title}<Plus size={14} /></span></button>)}</div>
          : <p className="studio-muted">No finished tours yet.</p>}</div>
      <div><span className="studio-label">Or upload your own</span>
        <div className="studio-upload-row">
          <label className="studio-file"><Film size={18} />Video<input type="file" accept="video/mp4,video/webm" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run('add', async () => save({ id: null, label: f.name.replace(/\.\w+$/, ''), video_path: await uploadMedia(f, 'video'), image_path: null, active: true })); }} /></label>
          <label className="studio-file"><ImagePlus size={18} />Image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run('add', async () => save({ id: null, label: f.name.replace(/\.\w+$/, ''), video_path: null, image_path: await uploadMedia(f, 'image'), active: true })); }} /></label>
        </div></div>
      {busy === 'add' && <p className="studio-muted">Adding…</p>}
      {error && <p className="studio-error" role="alert">{error}</p>}
    </div>

    <div>
      <div className="studio-head"><p className="eyebrow">HOMEPAGE SEQUENCE · {active} SHOWING</p></div>
      {!active && <p className="studio-muted">No scenes are showing, so the homepage uses its built-in reel.</p>}
      <div className="studio-tours">{data.slides.map((s, i) => <article key={s.id} className={`studio-tour ${s.active ? '' : 'studio-tour--off'}`}>
        <div className="studio-slide-media">
          {s.video_url ? <video src={s.video_url} poster={s.image_url ?? undefined} muted playsInline controls preload="metadata" /> : s.image_url ? <img src={s.image_url} alt={s.label || `Scene ${i + 1}`} /> : <div className="studio-tour-placeholder">Missing media</div>}
        </div>
        <div>
          <span>SCENE {String(i + 1).padStart(2, '0')}</span>
          <label className="studio-inline">Title<input defaultValue={s.label} maxLength={120} onBlur={e => { if (e.target.value !== s.label) run(s.id, () => save({ ...s, label: e.target.value })); }} /></label>
          <div className="studio-actions">
            <label className="studio-file studio-file--small">{s.video_path ? 'Replace video' : 'Add video'}<input type="file" accept="video/mp4,video/webm" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(s.id, async () => save({ ...s, video_path: await uploadMedia(f, 'video') })); }} /></label>
            <label className="studio-file studio-file--small">{s.image_path ? 'Replace image' : 'Add fallback image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(s.id, async () => save({ ...s, image_path: await uploadMedia(f, 'image') })); }} /></label>
            {data.tours.length > 0 && <select aria-label="Use a tour video" value="" disabled={!!busy} onChange={e => { const t = data.tours.find(t => t.id === e.target.value); if (t) run(s.id, () => save({ ...s, video_path: t.video_path })); }}><option value="">Use a tour video…</option>{data.tours.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>}
            {s.video_path && s.image_path && <Button variant="textArrow" disabled={!!busy} onClick={() => run(s.id, () => save({ ...s, video_path: null }))}>Remove video</Button>}
            {s.video_path && s.image_path && <Button variant="textArrow" disabled={!!busy} onClick={() => run(s.id, () => save({ ...s, image_path: null }))}>Remove image</Button>}
          </div>
          <div className="studio-actions">
            <Button variant="iconPlain" aria-label="Move up" disabled={!!busy || i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} /></Button>
            <Button variant="iconPlain" aria-label="Move down" disabled={!!busy || i === data.slides.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} /></Button>
            <label className="studio-toggle"><input type="checkbox" checked={s.active} disabled={!!busy} onChange={e => run(s.id, () => save({ ...s, active: e.target.checked }))} />Show on homepage</label>
            <Button variant="iconPlain" aria-label="Remove scene" disabled={!!busy} onClick={() => { if (window.confirm('Remove this scene from the homepage?')) run(s.id, () => deleteSlide({ data: { id: s.id } })); }}><Trash2 size={16} /></Button>
          </div>
          {busy === s.id && <span>Saving…</span>}
        </div>
      </article>)}</div>
    </div>
  </div>;
}
