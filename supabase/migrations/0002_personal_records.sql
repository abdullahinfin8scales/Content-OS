-- Infin8 OS: personal records (non-negotiables, day tasks, goals, journal, notes).
--
-- They sync through the same `records` table as everything else. Only the list
-- of allowed kinds changes. Apply this before deploying an app version that
-- writes the new kinds, or their uploads are refused.

alter table public.records drop constraint if exists records_kind_check;

alter table public.records
  add constraint records_kind_check
  check (kind in ('space', 'folder', 'doc', 'content', 'platform', 'nonneg', 'task', 'goal', 'journal', 'note'));
