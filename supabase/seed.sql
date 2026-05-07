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
