import { Heart } from 'lucide-react';
import { useSaved } from '@/lib/personal';

export function SaveButton({ slug, title, withLabel = false, className = '' }: { slug: string; title: string; withLabel?: boolean; className?: string }) {
  const { isSaved, toggle } = useSaved();
  const on = isSaved(slug);
  return <button type="button" className={`save-button ${on ? 'save-button--on' : ''} ${className}`} aria-pressed={on} aria-label={on ? `Remove ${title} from saved` : `Save ${title}`} onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(slug); }}>
    <Heart size={17} fill={on ? 'currentColor' : 'none'} />{withLabel && <span>{on ? 'Saved' : 'Save'}</span>}
  </button>;
}
