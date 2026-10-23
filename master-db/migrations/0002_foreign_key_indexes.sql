-- Cover the foreign keys Supabase's performance advisor flagged (lookups and cascades on property deletes).
create index if not exists enquiries_property_id on enquiries (property_id);
create index if not exists property_tours_property_id on property_tours (property_id);
