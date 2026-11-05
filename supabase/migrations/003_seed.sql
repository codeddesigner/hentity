-- Seed content so the board, chats and news are alive on day one. Seed profiles are marked is_seed.

insert into weeks (id, starts_at, ends_at, capacity)
select 45 + i,
  timestamptz '2026-11-02 06:00 Africa/Lagos' + (i * interval '7 days'),
  timestamptz '2026-11-09 06:00 Africa/Lagos' + (i * interval '7 days'),
  30
from generate_series(-2, 8) i;

insert into site_settings (key, value) values
  ('announcement', '{"enabled": false, "text": "", "link": ""}'),
  ('board', '{"capacity": 30, "reset": "Monday 06:00 WAT", "booking_weeks_ahead": 4}'),
  ('morning_brief', '{"length": "3 min listen", "languages": "English, Pidgin, Swahili", "items": ["$12M for West African payroll", "Open banking goes live in 2027", "900 upvotes for Swahili Speech Kit"]}'),
  ('stats', '{"products": 1240, "countries": 38, "makers": 9800}');

insert into profiles (id, username, name, headline, bio, country, city, website, x, linkedin, avatar_color, is_verified, is_seed, role) values
 ('00000000-0000-4000-a000-000000000001','ada','Ada Okafor','Founder of Ledgerline','Building bookkeeping for Lagos traders. Previously did books for market businesses by hand for three years. Ask me about mobile money reconciliation.','NG','Lagos','https://ledgerline.app','ada_builds','linkedin.com/in/adaokafor','linear-gradient(140deg,#f6a26b,#e8662c 45%,#a83a12)',true,true,'user'),
 ('00000000-0000-4000-a000-000000000002','ifeanyi','Ifeanyi Duru','Engineering at Ledgerline','','NG','Enugu','','','',null,false,true,'user'),
 ('00000000-0000-4000-a000-000000000003','sade','Sade Balogun','Design at Ledgerline','','NG','Lagos','','','','linear-gradient(140deg,#f472b6,#9d174d)',false,true,'user'),
 ('00000000-0000-4000-a000-000000000004','kofi','Kofi Mensah','Builder in Kumasi','','GH','Kumasi','','','','linear-gradient(140deg,#22c55e,#14532d)',false,true,'user'),
 ('00000000-0000-4000-a000-000000000005','wanjiru','Wanjiru Njeri','Founder of Swahili Speech Kit','','KE','Nairobi','','','','linear-gradient(140deg,#a78bfa,#5b21b6)',true,true,'user'),
 ('00000000-0000-4000-a000-000000000006','thandi','Thandi Bhengu','Clinic ops, Johannesburg','','ZA','Johannesburg','','','','linear-gradient(140deg,#38bdf8,#1e3a8a)',false,true,'user'),
 ('00000000-0000-4000-a000-000000000007','chidi','Chidi Eze','Engineering at Ledgerline','','NG','Lagos','','','','linear-gradient(140deg,#f2c14e,#9a5b0c)',false,true,'user'),
 ('00000000-0000-4000-a000-000000000008','ngozi','Ngozi Adeyemi','Shop owner, Yaba','','NG','Lagos','','','','linear-gradient(140deg,#fb7185,#9f1239)',false,true,'user'),
 ('00000000-0000-4000-a000-000000000009','tunde','Tunde Bakare','Fintech analyst','','NG','Abuja','','','',null,false,true,'user'),
 ('00000000-0000-4000-a000-000000000010','femi','Femi Ade','Founder of Previewly','','NG','Lagos','','','',null,true,true,'user'),
 ('00000000-0000-4000-a000-000000000011','youssef','Youssef Amrani','Founder of Souk OS','','MA','Casablanca','','','',null,true,true,'user'),
 ('00000000-0000-4000-a000-000000000012','kwame','Kwame Mensah','Accountant','','GH','Accra','','','',null,false,true,'user'),
 ('00000000-0000-4000-a000-000000000013','juma','Juma Otieno','Founder of Mtaa Maps','','KE','Nairobi','','','',null,true,true,'user'),
 ('00000000-0000-4000-a000-000000000014','abena','Abena Owusu','Founder of Farmcast','','GH','Accra','','','',null,true,true,'user'),
 ('00000000-0000-4000-a000-000000000015','claude','Hentity team','Curating African tech every morning','','NG','Lagos','','','',null,true,true,'user');

insert into companies (id, name, stage, city, country, team_size, founded, verified, owner_id) values
 ('00000000-0000-4000-b000-000000000001','Ledgerline Technologies Ltd','Pre-seed','Lagos','NG',6,2024,true,'00000000-0000-4000-a000-000000000001');

with p(slug,name,tagline,color,cat,cc,city,pay,votes,comments,verified,stage,status,week,owner,promoted,featured,countries,currencies,languages,platforms,website,description) as (values
 ('ledgerline','Ledgerline','Bookkeeping that reads your mobile money statements','#000000','Fintech','NG','Lagos','{Paystack,USSD}',1106,84,true,'Pre-seed','scheduled',45,'00000000-0000-4000-a000-000000000001',false,false,'{NG,GH,KE}','NGN · GHS · KES','English · Pidgin · Swahili','Web · Android · USSD','https://ledgerline.app','Small businesses in Lagos run on mobile money, but their records live in screenshots and WhatsApp threads. Ledgerline imports MTN MoMo, OPay and bank statements, categorises every transaction, and produces a monthly P&L you can send to a lender.'),
 ('swahili-speech-kit','Swahili Speech Kit','Speech-to-text API tuned for Swahili and Sheng','#2563eb','AI','KE','Nairobi','{M-Pesa,Card}',948,61,true,'Seed','scheduled',45,'00000000-0000-4000-a000-000000000005',false,false,'{KE,TZ}','KES','Swahili · English','API · Web','https://swahilispeech.dev','A speech recognition API trained on matatu radio, call-centre audio and 40 hours of student-labelled recordings.'),
 ('ward-health','Ward Health','Clinic queues and patient records that keep working offline','#16a34a','Health','RW','Kigali','{MTN MoMo}',812,40,true,'Seed','scheduled',45,'00000000-0000-4000-a000-000000000006',false,false,'{RW}','RWF','English · Kinyarwanda · French','Web · Android','https://wardhealth.rw','Queue screens, triage and patient records for clinics that lose power and data during the day.'),
 ('harbor-kyc','Harbor KYC','Identity checks across 14 African ID systems','#0f766e','Infrastructure','ZA','Cape Town','{Card,EFT}',120,3,true,'Series A+','scheduled',45,'00000000-0000-4000-a000-000000000006',true,false,'{ZA,NG,KE}','ZAR · USD','English','API','https://harborkyc.com','One API for NIN, BVN, Ghana Card, Huduma and ten more national identity systems.'),
 ('previewly','Previewly','Deploy previews for every pull request, billed in naira','#7c3aed','Dev Tools','NG','Lagos','{Paystack,Card}',603,41,false,'Seed','scheduled',45,'00000000-0000-4000-a000-000000000010',false,false,'{NG}','NGN','English','Web','https://previewly.dev','Preview deployments for every pull request, with local billing so teams stop fighting FX limits.'),
 ('farmcast','Farmcast','Hyperlocal rain forecasts over SMS for smallholder farmers','#ea580c','Agriculture','GH','Accra','{MTN MoMo,USSD}',540,27,true,'Pre-seed','scheduled',45,'00000000-0000-4000-a000-000000000014',false,false,'{GH}','GHS','English · Twi','SMS · USSD','https://farmcast.africa','Village-level rain forecasts delivered by SMS in English and Twi.'),
 ('souk-os','Souk OS','Inventory and WhatsApp orders for market traders','#db2777','Commerce','MA','Casablanca','{CMI,Cash}',388,12,false,'Bootstrapped','scheduled',45,'00000000-0000-4000-a000-000000000011',false,false,'{MA}','MAD','Arabic · French','Web · WhatsApp','https://soukos.ma','Stock, prices and WhatsApp orders in one place for traders in Moroccan souks.'),
 ('kobo-ledger','Kobo Ledger','Savings circles with reminders','#b45309','Fintech','GH','Kumasi','{MTN MoMo}',301,18,false,'Bootstrapped','scheduled',45,'00000000-0000-4000-a000-000000000004',false,false,'{GH}','GHS','English · Twi','Android','https://koboledger.app','Run a susu or esusu with automatic reminders and a shared ledger.'),
 ('invoicely-ng','Invoicely NG','VAT-ready invoices from WhatsApp','#16a34a','Fintech','NG','Abuja','{Paystack,Transfer}',284,22,true,'Bootstrapped','scheduled',45,'00000000-0000-4000-a000-000000000009',false,false,'{NG}','NGN','English','Web · WhatsApp','https://invoicely.ng','Send VAT-ready invoices from a WhatsApp chat and get paid by transfer.'),
 ('kasuwa','Kasuwa','Wholesale ordering for Kano market traders, in Hausa','#b45309','Commerce','NG','Kano','{USSD,Cash}',262,15,false,'Pre-seed','scheduled',45,'00000000-0000-4000-a000-000000000009',false,false,'{NG}','NGN','Hausa · English','USSD · Android','https://kasuwa.ng','Order wholesale stock by USSD in Hausa, with delivery tracked by the market union.'),
 ('tutor9ja','Tutor9ja','Live maths tutoring over WhatsApp voice notes','#db2777','Education','NG','Ibadan','{Paystack,Card}',233,19,false,'Seed','scheduled',45,'00000000-0000-4000-a000-000000000010',false,false,'{NG}','NGN','English · Yoruba','WhatsApp','https://tutor9ja.com','Book a tutor and learn maths through WhatsApp voice notes and photos of your working.'),
 ('pesapipe','PesaPipe','Payroll for casual workers, paid out to M-Pesa','#0891b2','Fintech','KE','Mombasa','{M-Pesa}',207,9,false,'Seed','scheduled',45,'00000000-0000-4000-a000-000000000013',false,false,'{KE}','KES','English · Swahili','Web','https://pesapipe.co.ke','Daily payroll for casual workers, paid straight to M-Pesa with statutory deductions.'),
 ('solarbox','SolarBox','Pay-as-you-go solar kits with remote shut-off','#ca8a04','Energy & Climate','RW','Musanze','{MTN MoMo,Airtel}',196,11,false,'Series A+','scheduled',45,'00000000-0000-4000-a000-000000000006',false,false,'{RW}','RWF','English · Kinyarwanda','Hardware · USSD','https://solarbox.rw','Solar kits paid in daily instalments, unlocked by mobile money.'),
 ('mtaa-maps','Mtaa Maps','Street-level addressing for informal settlements','#ea580c','Logistics','KE','Nairobi','{M-Pesa}',0,0,true,'Pre-seed','scheduled',46,'00000000-0000-4000-a000-000000000013',false,false,'{KE}','KES','English · Swahili','Web · Android','https://mtaamaps.co.ke','Addresses for places the map forgot, so deliveries and ambulances arrive.'),
 ('sankofa-learn','Sankofa Learn','WAEC and JAMB prep that works on 2G','#4f46e5','Education','GH','Accra','{MTN MoMo}',0,0,false,'Seed','scheduled',46,'00000000-0000-4000-a000-000000000014',false,false,'{GH,NG}','GHS · NGN','English','Android · Web','https://sankofalearn.com','Past questions and lessons that load on 2G and work offline.'),
 ('ledgerline-for-accountants','Ledgerline for Accountants','Client books and VAT returns in one workspace','#7c3aed','Fintech','NG','Lagos','{Paystack}',0,0,false,'Pre-seed','scheduled',47,'00000000-0000-4000-a000-000000000001',false,false,'{NG}','NGN','English','Web','https://ledgerline.app/accountants','Every client''s books and VAT returns in one place.'),
 ('momo-parser','MoMo Parser','Open-source parser for MTN MoMo and OPay statements','#2563eb','Dev Tools','NG','Lagos','{}',233,84,false,'Bootstrapped','changes',null,'00000000-0000-4000-a000-000000000001',false,false,'{NG,GH}','NGN · GHS','English','API','https://github.com/ledgerline/momo-parser','Parse mobile money statement PDFs into clean JSON.')
)
insert into products (slug,name,tagline,color,categories,country,city,pay_methods,upvote_count,comment_count,verified,stage,status,week_id,owner_id,promoted,featured,countries,currencies,languages,platforms,website,description,company_id,submitted_at,reviewed_at,support_pledge,intro,media)
select slug,name,tagline,color,array[cat],cc,city,pay::text[],votes,comments,verified,stage,status,week,owner::uuid,promoted,featured,countries::text[],currencies,languages,platforms,website,description,
  case when slug like 'ledgerline%' then '00000000-0000-4000-b000-000000000001'::uuid end, now() - interval '9 days', now() - interval '8 days', true,
  'Hi Hentity 👋 '||description,
  jsonb_build_array(jsonb_build_object('color',color), jsonb_build_object('color','#ff5b14'), jsonb_build_object('color','#16a34a'), jsonb_build_object('color','#2563eb'))
from p;

update products set review_note = 'add a short demo video and a link to the repo.', review_items = '[{"section":"Media","title":"Media · Demo video","detail":"Add a short demo video"},{"section":"Basics","title":"Basic information · Website","detail":"Link to the repo"}]' where slug = 'momo-parser';

insert into product_makers (product_id, user_id, role)
select id, '00000000-0000-4000-a000-000000000002', 'Engineering' from products where slug = 'ledgerline'
union all select id, '00000000-0000-4000-a000-000000000003', 'Design' from products where slug = 'ledgerline'
union all select id, '00000000-0000-4000-a000-000000000007', 'Engineering' from products where slug in ('ledgerline','ledgerline-for-accountants');

-- comments on Ledgerline
with l as (select id from products where slug = 'ledgerline'),
c1 as (insert into comments (product_id, user_id, body, created_at) select id, '00000000-0000-4000-a000-000000000012', 'Tried it on a GTBank statement and it got 47 of 50 transactions right. Any plans for Ghana Mobile Money?', now() - interval '6 hours' from l returning id, product_id)
insert into comments (product_id, parent_id, user_id, body, created_at)
select product_id, id, '00000000-0000-4000-a000-000000000001', 'Thank you Kwame! MTN MoMo Ghana is in testing now; Telecel Cash next. Can I DM you for a sample statement?', now() - interval '5 hours' from c1;
update products set comment_count = 84 where slug = 'ledgerline';

-- channels
insert into channels (slug, name, description, kind, pinned, pinned_link, position) values
 ('general','general','Say hello, share what you are building','channel',null,null,1),
 ('launch-week','launch-week','Week 45 launches: cheer each other on, ask questions, swap feedback','channel','Board resets Monday 06:00 WAT · 28 of 30 spots taken for week 46','/',2),
 ('fintech','fintech','Payments, lending, bookkeeping and everything money','channel',null,null,3),
 ('ai-and-data','ai-and-data','Models, datasets and African languages','channel',null,null,4),
 ('feedback-swap','feedback-swap','Swap reviews of each other''s products','channel',null,null,5),
 ('hiring','hiring','Roles at Hentity startups','channel',null,null,6),
 ('funding','funding','Rounds, investors and fundraising questions','channel',null,null,7);
update channels set pinned = 'Maker AMA today at 16:00 WAT · Ada and Chidi answer by voice', description = 'Product room · makers answer here first' where slug = 'p-ledgerline';

do $$
declare lw uuid; ft uuid; lr uuid; fs uuid; m uuid; ssk uuid;
begin
  select id into lw from channels where slug = 'launch-week';
  select id into ft from channels where slug = 'fintech';
  select id into fs from channels where slug = 'feedback-swap';
  select id into lr from channels where slug = 'p-ledgerline';
  select id into ssk from products where slug = 'swahili-speech-kit';
  insert into messages (channel_id, user_id, body, created_at) values (lw, '00000000-0000-4000-a000-000000000001', 'Morning everyone! Ledgerline is live for week 45. Would love feedback on onboarding, especially if you have ever reconciled OPay statements by hand.', date_trunc('day', now()) + interval '7 hours 12 minutes');
  insert into messages (channel_id, user_id, kind, body, product_id, created_at) values (lw, '00000000-0000-4000-a000-000000000005', 'product', 'We just crossed 900 upvotes. Thank you, Nairobi! Asante sana to everyone who tested the beta.', ssk, date_trunc('day', now()) + interval '9 hours 40 minutes') returning id into m;
  insert into messages (channel_id, user_id, parent_id, body, created_at) values
    (lw, '00000000-0000-4000-a000-000000000001', m, 'Huge. What did you use for the Sheng training data?', date_trunc('day', now()) + interval '9 hours 44 minutes'),
    (lw, '00000000-0000-4000-a000-000000000005', m, 'Mostly matatu radio recordings with permission, plus 40 hours we paid students to label.', date_trunc('day', now()) + interval '9 hours 47 minutes'),
    (lw, '00000000-0000-4000-a000-000000000004', m, 'Any plans for Twi? Happy to connect you with a team in Kumasi.', date_trunc('day', now()) + interval '9 hours 52 minutes'),
    (lw, '00000000-0000-4000-a000-000000000005', m, 'Yes please! DMing you now.', date_trunc('day', now()) + interval '9 hours 55 minutes');
  insert into messages (channel_id, kind, body, created_at) values (lw, 'system', 'Ward Health moved up to #3 · 812 upvotes', date_trunc('day', now()) + interval '9 hours 58 minutes');
  insert into messages (channel_id, user_id, kind, body, duration, transcript, created_at) values (lw, '00000000-0000-4000-a000-000000000004', 'voice', '', 42, 'Congratulations to everyone launching this week. If you are building for farmers in Ghana, come and find me in feedback-swap, I will test anything with a USSD flow.', date_trunc('day', now()) + interval '10 hours 5 minutes');
  insert into messages (channel_id, user_id, body, created_at) values (lw, '00000000-0000-4000-a000-000000000006', 'Tried Ward Health at a clinic in Joburg last month. The queue screen alone saved the nurses an hour a day.', date_trunc('day', now()) + interval '10 hours 18 minutes');
  insert into messages (channel_id, user_id, body, created_at) values (ft, '00000000-0000-4000-a000-000000000009', 'CBN just published the new open banking timelines', date_trunc('day', now()) + interval '8 hours 47 minutes');
  insert into messages (channel_id, user_id, body, created_at) values (fs, '00000000-0000-4000-a000-000000000010', 'Swap: I review yours, you review mine?', now() - interval '2 days');
  if lr is not null then
    insert into messages (channel_id, user_id, body, created_at) values (lr, '00000000-0000-4000-a000-000000000008', 'Does it handle Moniepoint exports yet? Half my customers moved over this year.', date_trunc('day', now()) + interval '9 hours 58 minutes');
    insert into messages (channel_id, user_id, kind, body, duration, transcript, created_at) values (lr, '00000000-0000-4000-a000-000000000001', 'voice', '', 42, 'Not yet, but it is the next import we are shipping. Chidi has it working on our test files.', date_trunc('day', now()) + interval '10 hours 2 minutes');
    insert into messages (channel_id, user_id, body, created_at) values (lr, '00000000-0000-4000-a000-000000000007', 'Moniepoint CSV import ships Friday. If you want early access, reply here and we will flip it on for you.', date_trunc('day', now()) + interval '10 hours 4 minutes');
  end if;
end $$;

-- news
insert into articles (slug, title, dek, bullets, topic, country, source, source_url, source_initials, color, read_minutes, is_lead, status, channel_slug, comment_count, published_at, product_ids) values
 ('paystack-alumni-raise-12m-seed-payroll-west-africa','Paystack alumni raise $12M seed for payroll across West Africa','The round will take Salaro into Ghana and Côte d''Ivoire. Three Hentity makers were early customers, including Ledgerline.',
   array['Salaro, a payroll and payslip tool for SMEs, raised a $12M seed led by a Lagos fund.','The money goes to Ghana and Côte d''Ivoire launches, plus statutory filings (PAYE, pension, NHF) in each country.','Founders previously built payroll at Paystack. Ledgerline and two other Hentity products already integrate with it.'],
   'Funding','NG','TechCabal','https://techcabal.com','TC','#ff5b14',5,true,'published','funding',24, now() - interval '2 hours', (select array_agg(id) from products where slug = 'ledgerline')),
 ('cbn-open-banking-go-live-2027','CBN publishes the go-live timeline for open banking in 2027','Banks must expose account and transaction APIs by Q2. Fintechs building on statements may need to switch.',
   array['Tier-1 banks must expose account and transaction APIs by Q2 2027.','Statement-parsing products get a 12-month transition window.','Consent screens must follow a common design from the CBN.'],
   'Policy','NG','Nairametrics','https://nairametrics.com','NM','#2563eb',4,false,'published','fintech',48, now() - interval '4 hours', '{}'),
 ('swahili-speech-kit-900-upvotes','Swahili Speech Kit passes 900 upvotes on launch day','The Nairobi team trained on matatu radio and 40 hours of student-labelled audio. Twi is next.',
   array['Swahili Speech Kit crossed 900 upvotes in its first day on the board.','The model was trained on matatu radio recordings and 40 hours of labelled student audio.','A Twi model is in progress with a team in Kumasi.'],
   'From Hentity','KE','Hentity',null,'H','#7c3aed',3,false,'published','launch-week',31, now() - interval '5 hours', (select array_agg(id) from products where slug = 'swahili-speech-kit')),
 ('ward-health-40-rwandan-clinics','Ward Health now runs patient queues in 40 Rwandan clinics','The Kigali startup says average waiting time fell by 52 minutes after the queue screen rollout.',
   array['Ward Health is live in 40 clinics across Rwanda.','Average waiting time fell by 52 minutes after the queue screens went in.','The product keeps working offline when power or data drops.'],
   'Health','RW','The New Times','https://newtimes.co.rw','NT','#16a34a',4,false,'published','general',12, now() - interval '8 hours', (select array_agg(id) from products where slug = 'ward-health')),
 ('mtn-momo-cuts-merchant-fees-ghana','MTN MoMo cuts merchant fees in Ghana to 0.5%','Small merchants under GH₵ 5,000 a month pay nothing until March. Payment startups expect more QR adoption.',
   array['Merchant fees drop to 0.5% from December.','Merchants under GH₵ 5,000 a month pay nothing until March.','Startups expect a jump in QR payments at market stalls.'],
   'Fintech','GH','Techpoint Africa','https://techpoint.africa','TA','#ca8a04',3,false,'published','fintech',19, now() - interval '11 hours', '{}');

do $$
declare a uuid; c uuid;
begin
  select id into a from articles where slug = 'paystack-alumni-raise-12m-seed-payroll-west-africa';
  insert into comments (article_id, user_id, body, created_at) values (a, '00000000-0000-4000-a000-000000000001', 'We integrated with Salaro in March. Their PAYE export saved our customers a full day every month. Well deserved.', now() - interval '90 minutes') returning id into c;
  insert into comments (article_id, user_id, body, created_at) values (a, '00000000-0000-4000-a000-000000000004', 'Ghana payroll is a different beast: SSNIT tiers, GRA. Curious how fast they can ship that.', now() - interval '60 minutes');
  update articles set comment_count = 24 where id = a;
end $$;
