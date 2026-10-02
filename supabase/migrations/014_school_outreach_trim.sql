-- Trim outreach: HSE SCUBA-only / leisure / military out of primary DoneUnder ICP
update public.school_outreach_targets
set
  status = 'skip',
  priority = 0,
  notes = 'Primarily PADI leisure centre; HSE SCUBA only (media/scientific entry) — not SSDE graduate factory. Skipped after Gareth review.',
  updated_at = now()
where slug = 'andark';

update public.school_outreach_targets
set
  status = 'skip',
  priority = 0,
  notes = 'HSE SCUBA only, media/scientific focus — not surface-supplied construction. Skipped after Gareth review.',
  updated_at = now()
where slug = 'bristol-channel-diving';

update public.school_outreach_targets
set
  status = 'skip',
  priority = 0,
  notes = 'Military school — different outreach. Skipped from civilian graduate pipeline.',
  updated_at = now()
where slug = 'irish-navy-diving';

-- Second-wave inshore Level 2 (keep todo, lower priority)
update public.school_outreach_targets
set
  priority = 3,
  notes = 'IDSA Level 2 (inshore SS ~30 m) — real commercial but second wave after L3+/SSDE schools.',
  updated_at = now()
where slug in ('luksia', 'osnz-frog');
