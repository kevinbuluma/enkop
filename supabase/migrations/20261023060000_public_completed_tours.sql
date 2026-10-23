-- Visitors may read finished property tours, matching the master's public filter (status = 'completed').
-- Without it the mirror shows no tour videos when it serves public pages.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'property_tours' and policyname = 'completed tours visible') then
    create policy "completed tours visible" on public.property_tours for select to anon, authenticated using (status = 'completed');
  end if;
end $$;
