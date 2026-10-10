import { useState } from 'react';
import { ImagePlus, Sparkles, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { captureVideoFrame } from '@/lib/video-frame';
import { streamImage } from '@/lib/stream-image';
import { saveSlide } from '@/lib/slides.functions';

type Scene = { id: string; label: string; video_path: string | null; video_url: string | null; image_path: string | null; active: boolean };

export function FallbackImageGenerator({ scene, disabled, onSaved }: { scene: Scene; disabled: boolean; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState('');
  const [final, setFinal] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function generate() {
    if (!scene.video_url || !scene.video_path) return;
    setBusy('Reading video…'); setError(''); setPreview(''); setFinal(false);
    try {
      const frame = await captureVideoFrame(scene.video_url);
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Please sign in again.');
      const form = new FormData();
      form.set('image', frame); form.set('slideId', scene.id); form.set('videoPath', scene.video_path); form.set('notes', notes);
      setBusy('Creating image…');
      await streamImage('/api/homepage-fallback', form, (src, done) => { setPreview(src); setFinal(done); }, undefined, { Authorization: `Bearer ${data.session.access_token}` });
    } catch (e) { setFinal(false); setError(e instanceof Error ? e.message : 'The image could not be created.'); }
    finally { setBusy(''); }
  }

  async function apply() {
    if (!final || !preview) return;
    setBusy('Saving image…'); setError('');
    let path: string | undefined;
    try {
      const blob = await (await fetch(preview)).blob();
      path = `homepage/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage.from('property-media').upload(path, blob, { contentType: 'image/png' });
      if (uploadError) throw new Error('The image could not be uploaded.');
      await saveSlide({ data: { id: scene.id, label: scene.label, video_path: scene.video_path, image_path: path, active: scene.active } });
      path = undefined;
      await onSaved(); setOpen(false); setPreview(''); setFinal(false);
    } catch (e) {
      if (path) await supabase.storage.from('property-media').remove([path]);
      setError(e instanceof Error ? e.message : 'The image could not be saved.');
    } finally { setBusy(''); }
  }

  if (!scene.video_url) return null;
  return <div className="studio-fallback">
    <Button variant="textArrow" disabled={disabled || !!busy} onClick={() => setOpen(!open)}><Sparkles size={15} /> Create matching image</Button>
    {open && <div className="enquiry-form studio-fallback-editor">
      <label>Style notes (optional)<textarea rows={2} maxLength={500} value={notes} disabled={!!busy} onChange={e => setNotes(e.target.value)} placeholder="Soft morning light, subtle film grain…" /></label>
      <div className="studio-actions"><Button variant="luxury" disabled={disabled || !!busy} onClick={generate}><Sparkles size={15} />{busy || (preview ? 'Generate another' : 'Generate image')}</Button>
        <Button variant="iconPlain" aria-label="Close image generator" disabled={!!busy} onClick={() => setOpen(false)}><X size={16} /></Button></div>
      <p className="studio-muted">Uses AI credits.</p>
      {preview && <img className={`studio-fallback-preview ${final ? '' : 'blur-2xl'}`} src={preview} alt={`Generated fallback for ${scene.label || 'homepage scene'}`} />}
      {final && <Button variant="textArrow" disabled={disabled || !!busy} onClick={apply}><ImagePlus size={15} /> Use as fallback image</Button>}
      {error && <p className="studio-error" role="alert">{error}</p>}
    </div>}
  </div>;
}