-- NYD: Gareth's school — website + contact + bump to priority 1
update public.school_outreach_targets
set
  name = 'Norsk Yrkesdykkerskole (NYD)',
  priority = 1,
  location = 'Fagerstrand (Oslo area)',
  website = 'https://nyd.no/',
  notes = 'IDSA Level 4; Havtil/NPD path. Gareth trained here — strong personal intro. Contact: info@nyd.no',
  contact_email = 'info@nyd.no',
  updated_at = now()
where slug = 'nyd';
