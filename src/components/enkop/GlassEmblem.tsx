// A slowly turning glass ENKOP building mark. The logo cut-out is used as a mask on thin stacked
// layers: the inner layers read as the glass's thickness and edges, the two faces carry a frosted
// glass sheen, a moving highlight and a faint tint of the mark's gold and ivory. Pure CSS 3D.
const DEPTH_LAYERS = 14;

export function GlassEmblem({ className = '' }: { className?: string }) {
  const half = (DEPTH_LAYERS - 1) / 2;
  return <div className={`glass-emblem ${className}`} aria-hidden="true">
    <div className="glass-emblem-spin">
      {Array.from({ length: DEPTH_LAYERS }, (_, i) => {
        const face = i === 0 ? ' glass-emblem-layer--back' : i === DEPTH_LAYERS - 1 ? ' glass-emblem-layer--front' : '';
        return <span key={i} className={`glass-emblem-layer${face}`} style={{ ['--z' as string]: (i - half).toFixed(1) }} />;
      })}
    </div>
    <span className="glass-emblem-shadow" />
  </div>;
}
