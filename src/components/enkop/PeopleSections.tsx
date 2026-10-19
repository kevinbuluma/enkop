type Member = { id: string; name: string; role: string; bio: string; photo_url: string | null };
type Quote = { id: string; quote: string; author: string; context: string };

export function TeamSection({ team, index = '02' }: { team: Member[]; index?: string }) {
  if (!team.length) return null;
  return <section className="team-section page-gutter" id="team">
    <p className="eyebrow"><span>{index} /</span> THE PEOPLE BEHIND ENKOP</p>
    <h2>Personally <em>represented.</em></h2>
    <div className="team-grid">{team.map(m => <article key={m.id} className="team-card">
      <div className="team-portrait">{m.photo_url ? <img src={m.photo_url} alt={`Portrait of ${m.name}`} loading="lazy" width="600" height="750" /> : <span aria-hidden="true">{m.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span>}</div>
      <h3>{m.name}</h3><p className="eyebrow">{m.role}</p>{m.bio && <p className="team-bio">{m.bio}</p>}
    </article>)}</div>
  </section>;
}

export function TestimonialsSection({ quotes, index = '03' }: { quotes: Quote[]; index?: string }) {
  if (!quotes.length) return null;
  return <section className="testimonials-section page-gutter" id="testimonials">
    <p className="eyebrow"><span>{index} /</span> IN THEIR WORDS</p>
    <div className="testimonial-grid">{quotes.map(q => <figure key={q.id} className="testimonial-card">
      <blockquote>“{q.quote}”</blockquote>
      <figcaption><strong>{q.author}</strong>{q.context && <span>{q.context}</span>}</figcaption>
    </figure>)}</div>
  </section>;
}
