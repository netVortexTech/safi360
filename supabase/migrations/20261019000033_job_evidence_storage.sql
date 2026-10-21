-- 0033 · the job-evidence bucket and its policies live in version control
-- The field app uploads before/after photos to storage at
-- `job-evidence/<tenant_id>/<staff_id>/<booking_id>/<file>` (src/experiences/field/uploads.ts)
-- and both apps read them through short-lived signed URLs — but no migration ever created
-- the bucket or any storage.objects policy, so the setup only existed by hand in the
-- dashboard (unaudited) or not at all. Codify it:
--   * the bucket is private — PII-bearing photos are reachable only via signed URLs;
--   * every path is scoped to the caller's tenant folder;
--   * office roles cover the tenant; a CLEANER only writes under their own booking
--     assignments; nobody deletes evidence from a client.

insert into storage.buckets (id, name, public)
values ('job-evidence', 'job-evidence', false)
on conflict (id) do update set public = false;

drop policy if exists job_evidence_select on storage.objects;
create policy job_evidence_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-evidence'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
    and (
      app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')
      or (
        app.has_tenant_role('CLEANER')
        and app.is_assigned_cleaner(((storage.foldername(name))[3])::uuid)
      )
    )
  );

drop policy if exists job_evidence_insert on storage.objects;
create policy job_evidence_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'job-evidence'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
    and (
      app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')
      or (
        app.has_tenant_role('CLEANER')
        and app.is_assigned_cleaner(((storage.foldername(name))[3])::uuid)
      )
    )
  );

-- The uploader sends x-upsert (retries after a dropped connection), which needs UPDATE.
drop policy if exists job_evidence_update on storage.objects;
create policy job_evidence_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'job-evidence'
    and (storage.foldername(name))[1] = app.current_tenant_id()::text
    and (
      app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')
      or (
        app.has_tenant_role('CLEANER')
        and app.is_assigned_cleaner(((storage.foldername(name))[3])::uuid)
      )
    )
  );

-- No DELETE policy on purpose: job evidence is immutable from clients.
