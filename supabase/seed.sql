insert into public.users (id, role, email, username, full_name) values
('11111111-1111-1111-1111-111111111111','diver','gareth@demo.doneunder.ai','gareth','Gareth Nilsen'),
('22222222-2222-2222-2222-222222222222','diver','elin@demo.doneunder.ai','elin','Elin Strand'),
('33333333-3333-3333-3333-333333333333','diver','omar@demo.doneunder.ai','omar','Omar Halabi'),
('44444444-4444-4444-4444-444444444444','diver','johan@demo.doneunder.ai','johan','Johan Persson'),
('55555555-5555-5555-5555-555555555555','diver','ricardo@demo.doneunder.ai','ricardo','Ricardo Sousa'),
('66666666-6666-6666-6666-666666666666','diver','martin@demo.doneunder.ai','martin','Martin Lowe'),
('77777777-7777-7777-7777-777777777777','diver','sami@demo.doneunder.ai','sami','Sami Kareem'),
('88888888-8888-8888-8888-888888888888','diver','isak@demo.doneunder.ai','isak','Isak Moen'),
('99999999-9999-9999-9999-999999999999','company','northarc@demo.doneunder.ai',null,'North Arc Subsea'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','company','bluespan@demo.doneunder.ai',null,'BlueSpan Offshore'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','company','baltic@demo.doneunder.ai',null,'Baltic Marine Works'),
('cccccccc-cccc-cccc-cccc-cccccccccccc','admin','admin@doneunder.ai','admin','doneunder Admin')
on conflict do nothing;

insert into public.diver_profiles (user_id, headline, bio, sat_hours, dive_hours, welding_tickets, certifications, availability_status, location, mobilization_notice, verified) values
('11111111-1111-1111-1111-111111111111','Saturation Welder • 2,800+ hrs • IMCA Certified • Available July 2026','Specialist in hyperbaric wet welding and habitat repair.',2860,4200,array['CSWIP 3.1U'], '["IMCA","ADCI","OGUK Medical"]','available','Aberdeen, UK','Ready in 48h',true),
('22222222-2222-2222-2222-222222222222','Saturation Diver • NDT Tech • Offshore Wind Specialist','Monopile inspection and defect mapping.',1900,3500,array[]::text[], '["IMCA","PCN NDT"]','deployed','Bergen, NO','Available from 10 Aug',true),
('33333333-3333-3333-3333-333333333333','Deep-sea Construction Diver • 2,200 sat hrs','Pipeline tie-ins and subsea metrology.',2200,4100,array[]::text[], '["ADCI","IMCA","BOSIET"]','available','Rotterdam, NL','Ready in 72h',true),
('44444444-4444-4444-4444-444444444444','Air/Sat Diver • Offshore shutdown scopes','Emergency leak clamp installation specialist.',1600,3900,array[]::text[], '["IMCA","OGUK Medical"]','available','Gothenburg, SE','Ready in 24h',true),
('55555555-5555-5555-5555-555555555555','Saturation ROV-Assisted Diver • 1,400 sat hrs','Deep intervention and survey support.',1400,3000,array[]::text[], '["IMCA","ROV Pilot Intro"]','deployed','Lisbon, PT','Available 01 Sep',true),
('66666666-6666-6666-6666-666666666666','Wet Welder • Structural Repair • 2,050 sat hrs','Hull and jacket steel repair specialist.',2050,3800,array['CSWIP 3.1U'], '["IMCA"]','available','Newcastle, UK','Ready in 5 days',true),
('77777777-7777-7777-7777-777777777777','NDT and Inspection Diver • Asset Integrity','Ultrasonic and MPI campaign experience.',1750,3400,array[]::text[], '["PCN NDT","ADCI"]','available','Doha, QA','Ready in 72h',false),
('88888888-8888-8888-8888-888888888888','Offshore Wind Diver • Supervisor Pathway','Strong HSE reporting and maintenance ops.',1200,2800,array[]::text[], '["IMCA","First Aid Offshore"]','deployed','Esbjerg, DK','Available after campaign',true)
on conflict do nothing;

insert into public.companies (user_id, company_name, subscription_status, plan) values
('99999999-9999-9999-9999-999999999999','North Arc Subsea','active','249'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','BlueSpan Offshore','active','199'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Baltic Marine Works','past_due','149')
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

delete from public.diver_references where diver_id = '11111111-1111-1111-1111-111111111111';
insert into public.diver_references (diver_id, name, company, phone, sort_order, source)
values
('11111111-1111-1111-1111-111111111111', 'Jesper Skouv', 'Nordic Sub', '+45 41 42 09 01', 0, 'ai'),
('11111111-1111-1111-1111-111111111111', 'Micke Valander', 'HBM Construction', '+46 705 31 23 01', 1, 'ai'),
('11111111-1111-1111-1111-111111111111', 'Jonas Lassen', 'Lassen Construction', '+46 708 88 94 16', 2, 'ai');
