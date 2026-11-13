-- Minimal demo dataset: Gareth CV fixture, Hermes bot test diver, one company demo, admin placeholder.
insert into public.users (id, role, email, username, full_name) values
('11111111-1111-1111-1111-111111111111','diver','gareth@demo.doneunder.ai','gareth-demo','Gareth Nilsen'),
('dddddddd-dddd-dddd-dddd-dddddddddddd','diver','hermes@demo.doneunder.ai','hermes-demo','Hermes Test Diver'),
('99999999-9999-9999-9999-999999999999','company','northarc@demo.doneunder.ai',null,'North Arc Subsea'),
('cccccccc-cccc-cccc-cccc-cccccccccccc','admin','admin@doneunder.ai','admin','doneunder Admin')
on conflict do nothing;

insert into public.diver_profiles (user_id, headline, bio, sat_hours, dive_hours, welding_tickets, certifications, availability_status, location, mobilization_notice, verified) values
('11111111-1111-1111-1111-111111111111','Saturation Welder • 2,800+ hrs • IMCA Certified • Available July 2026','Specialist in hyperbaric wet welding and habitat repair.',2860,4200,array['CSWIP 3.1U'], '["IMCA","ADCI","OGUK Medical"]','available','Aberdeen, UK','Ready in 48h',true),
('dddddddd-dddd-dddd-dddd-dddddddddddd','Hermes bot test diver | cert date review','Synthetic profile for Hermes and Grok bot smoke tests.',0,0,array[]::text[], '["IMCA","BOSIET"]','available','Malmo, Sweden','Test only',false)
on conflict do nothing;

insert into public.companies (user_id, company_name, subscription_status, plan) values
('99999999-9999-9999-9999-999999999999','North Arc Subsea','active','249')
on conflict do nothing;

update public.users
set full_name = 'Gareth Darrin Middleton'
where id = '11111111-1111-1111-1111-111111111111';

update public.diver_profiles
set
  headline = 'Offshore Commercial Diver & DMT | 20+ Years | IMCA Ready',
  bio = 'Senior offshore commercial diver delivering air diving, DMT, and sat-support scopes across IRM and subsea construction campaigns.',
  location = 'Malmo, Sweden',
  mobilization_notice = 'Short notice, global mobilization',
  availability_status = 'available',
  sat_hours = 0,
  dive_hours = 0,
  headline_source = 'ai',
  bio_source = 'ai',
  polished_cv_markdown = E'# Gareth Darrin Middleton\n\n## Professional Summary\nSenior offshore commercial diver with 20+ years of international campaign experience in offshore and inshore operations.\n\n## Core Competencies\n- Air Diving Offshore/Onshore Construction\n- Saturation Support Operations\n- Diver Medic Technician (DMT)\n- Assistant Dive Supervision\n- Underwater Welding and Broco Cutting\n\n## Certifications\n- IMCA Trainee Air Diving Supervisor (exp 2027-07-26)\n- Diver Medic Technician (exp 2026-10-19)\n- OPITO BOSIET + HUET + CA-EBS (exp 2027-01-05)\n- OEUK Medical (exp 2027-03-27)\n- HSE Diver Medical (exp 2026-03-28)',
  polished_cv_json = jsonb_build_object(
    'location', 'Malmo, Sweden',
    'mobilization_notice', 'Short notice, global mobilization',
    'availability_status', 'available',
    'sat_hours', 0,
    'dive_hours', 0
  ),
  ambassador_public_headline = 'Offshore Commercial Diver & DMT | 20+ Years',
  ambassador_short_bio = 'Trusted for safe, high-performance offshore execution across IRM, subsea installation, and construction campaigns.',
  ambassador_key_highlights = array[
    '20+ years offshore/inshore campaign experience',
    'Diver Medic Technician and assistant supervision background',
    'International project exposure across Europe and Asia'
  ],
  cv_last_processed_at = now(),
  updated_at = now()
where user_id = '11111111-1111-1111-1111-111111111111';

delete from public.diver_experiences where diver_id = '11111111-1111-1111-1111-111111111111';
insert into public.diver_experiences (diver_id, company, project_name, location, role_title, date_start, date_end, summary, sort_order, source)
values
('11111111-1111-1111-1111-111111111111', 'SWESUB AB', 'Underwater construction scopes', 'Sweden', 'Construction Diver', '2024-01-01', null, 'Construction diver on multiple underwater construction projects.', 0, 'ai'),
('11111111-1111-1111-1111-111111111111', 'Hibiscus EP', 'MLJ1-MLJ2 clamp installation', 'Brunei', 'Air Diver / DMT / Sat Support', '2025-06-01', null, 'Subsea clamp installation support and sat operations support.', 1, 'ai'),
('11111111-1111-1111-1111-111111111111', 'DON', 'Excelerate Energy FSRU IRM', 'Bangladesh', 'Air Diver', '2025-02-01', '2025-03-31', 'Air diver for IRM campaign scope on FSRU assets.', 2, 'ai');

delete from public.diver_certifications where diver_id = '11111111-1111-1111-1111-111111111111';
insert into public.diver_certifications (diver_id, name, issue_date, expiry_date, cert_number, sort_order, source)
values
('11111111-1111-1111-1111-111111111111', 'IMCA Trainee Air Diving Supervisor', '2024-07-26', '2027-07-26', 'TADS-043-03', 0, 'ai'),
('11111111-1111-1111-1111-111111111111', 'Diver Medic Technician', '2024-10-19', '2026-10-19', 'DMT-122-09', 1, 'ai'),
('11111111-1111-1111-1111-111111111111', 'OPITO BOSIET with HUET and CA-EBS', '2023-01-04', '2027-01-05', null, 2, 'ai'),
('11111111-1111-1111-1111-111111111111', 'OEUK Medical Certificate', '2025-03-28', '2027-03-27', null, 3, 'ai'),
('11111111-1111-1111-1111-111111111111', 'HSE Diver Medical (MA1/MA2)', '2025-03-28', '2026-03-28', null, 4, 'ai');

delete from public.diver_certifications where diver_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
insert into public.diver_certifications (diver_id, name, issue_date, expiry_date, sort_order, source, expiry_confirmed)
values
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'HSE Part 2', '2020-01-01', '2030-12-31', 0, 'manual', true),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'OPITO BOSIET with HUET and CA-EBS', '2024-06-01', '2028-06-01', 1, 'manual', true),
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Offshore Diver Medical', '2025-01-15', '2026-01-15', 2, 'manual', true);

delete from public.diver_references where diver_id = '11111111-1111-1111-1111-111111111111';
insert into public.diver_references (diver_id, name, company, phone, sort_order, source)
values
('11111111-1111-1111-1111-111111111111', 'Jesper Skouv', 'Nordic Sub', '+45 41 42 09 01', 0, 'ai'),
('11111111-1111-1111-1111-111111111111', 'Micke Valander', 'HBM Construction', '+46 705 31 23 01', 1, 'ai'),
('11111111-1111-1111-1111-111111111111', 'Jonas Lassen', 'Lassen Construction', '+46 708 88 94 16', 2, 'ai');
