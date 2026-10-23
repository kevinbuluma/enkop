import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { readStored, writeStored } from '@/lib/safe-storage';

const intents = [
  { id: 'buy', label: 'Buy a home', to: '/properties', search: { status: 'Sale' } },
  { id: 'rent', label: 'Rent a home', to: '/properties', search: { status: 'Rent' } },
  { id: 'invest', label: 'Invest off-plan', to: '/contact', search: { interest: 'Off-plan investment' } },
  { id: 'list', label: 'Sell my property', to: '/contact', search: { interest: 'Selling' } },
  { id: 'consult', label: 'Book a consultation', to: '/contact', search: { interest: 'Consultancy' } },
] as const;

/** Lets visitors state their goal; remembered on-device to reorder actions next visit. */
export function IntentPicker() {
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => { setChosen(readStored('enkop:intent')); }, []);
  const ordered = chosen ? [...intents].sort((a, b) => Number(b.id === chosen) - Number(a.id === chosen)) : intents;
  return <div className="intent-picker">
    <p className="eyebrow">{chosen ? 'WELCOME BACK — CONTINUE WHERE YOU LEFT OFF' : 'WHAT BRINGS YOU TO ENKOP?'}</p>
    <div>{ordered.map(i => <Link key={i.id} to={i.to} search={i.search as never} className={chosen === i.id ? 'intent--on' : ''} onClick={() => writeStored('enkop:intent', i.id)}>{i.label}<ArrowUpRight size={15}/></Link>)}</div>
  </div>;
}
