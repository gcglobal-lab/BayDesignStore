-- =============================================================================
-- Bay Design Base — initial data copied from the Homebase account (Oct 2026)
-- =============================================================================
-- Contains staff names, emails and phone numbers: keep this repository private.
--
-- Nobody can sign in until an admin sets their password in Team ▸ Roster (click the name,
-- type or generate a password, Save) — or "Passwords for N without one" for everyone at once.
-- =============================================================================

-- Location (Settings ▸ Basic info). Set latitude/longitude from Settings ▸ Locations
-- ("Use my current location" while standing in the building) to turn on geofencing.
insert into locations (name, phone, address1, city, state, postal_code, country, timezone, business_type, business_category)
values ('Bay Design Store Warehouse & Showroom', '(239) 778-9709', '5510 Shirley Street', 'Naples', 'Florida', '34109',
        'United States', 'America/New_York', 'Retail', 'Furniture/Home Goods');

-- Roles (Team ▸ Departments/Roles). Downtown/Uptown use the schedule colours from Homebase.
insert into job_roles (name, color) values
  ('Admin', '#5B4A8B'),
  ('Admin Assistant', '#7B6BA8'),
  ('Carpenter', '#8A6A3F'),
  ('Design Assistant', '#B08D57'),
  ('Designer', '#A8834F'),
  ('Downtown', '#C0354E'),
  ('Driver-stock', '#4E6B69'),
  ('General Manager', '#2E2A25'),
  ('GM Downtown', '#9C2B40'),
  ('GM Uptown', '#1F5F99'),
  ('Install', '#6F675D'),
  ('owner', '#1E1C19'),
  ('Stock', '#5F7F6E'),
  ('Time-off (all day)', '#5A2A82'),
  ('Uptown', '#2F7FC1'),
  ('Vendor', '#7F9C98');

-- Team roster
with loc as (select id from locations limit 1)
insert into employees (first_name, last_name, email, phone, login_id, access_level, status, title, is_contractor, location_id)
select v.first_name, v.last_name, v.email, v.phone, v.login_id, v.access_level::access_level, v.status::employee_status, v.title, v.is_contractor, loc.id
from loc, (values
  ('Dawn',        'Melsheimer',  'dawn@baydesignstore.com',                '(267) 261-3899', 'dawn.melsheimer',     'employee', 'active',  null,            false),
  ('Dee',         'Boykin',      'deeboykin6@outlook.com',                 '(239) 888-0599', 'dee.boykin',          'employee', 'active',  null,            false),
  ('Eduardo',     'Campos',      'lalocampos503@icloud.com',               '(239) 580-7271', 'eduardo.campos',      'employee', 'active',  null,            false),
  ('Gerber',      'Morales',     null,                                     '(239) 484-9383', 'gerber.morales',      'employee', 'active',  null,            false),
  ('Hemant',      'Singh',       'hemant@baydesignstore.com',              '(827) 991-1846', 'hemant.singh',        'manager',  'active',  null,            false),
  ('James',       'Kreuzberg',   'james@baydesignstore.com',               null,             'james.kreuzberg',     'employee', 'active',  null,            false),
  ('Jessica',     'Bablitz',     'jessica@baydesignstore.com',             '(262) 620-0832', 'jessica.bablitz',     'manager',  'active',  null,            false),
  -- Email was cut off in the Homebase screenshot ("…@gmail.c") — please verify.
  ('Jose Ignacio','Monasi',      'joseignaciomonasimurgueytiio@gmail.com', '(239) 777-7984', 'jose.monasi',         'employee', 'active',  null,            false),
  ('Karina',      'Silver',      'karina@baydesignstore.com',              '(239) 398-5593', 'karina.silver',       'employee', 'active',  null,            false),
  ('Kim',         'Wilbrett',    'kim@baydesignstore.com',                 '(239) 404-5332', 'kim.wilbrett',        'employee', 'active',  null,            false),
  ('Kimberly',    'Hill',        'kimberly@baydesignstore.com',            '(734) 395-3502', 'kimberly.hill',       'employee', 'active',  null,            false),
  ('Leah',        'Spencer',     'leah@baydesignstore.com',                '(267) 242-6402', 'leah.spencer',        'employee', 'active',  null,            false),
  ('Lisa',        'Storms',      'lisa@baydesignstore.com',                '(732) 330-1508', 'lisa.storms',         'employee', 'active',  null,            false),
  ('Luis',        'Orbegoso',    'luigy@baydesignstore.com',               '(239) 330-5420', 'luis.orbegoso',       'manager',  'active',  'Account Owner', false),
  ('Lynn',        'Stein',       'lynn@baydesignstore.com',                '(248) 388-1111', 'lynn.stein',          'employee', 'active',  null,            false),
  ('Marco',       'Obregoso',    null,                                     '(239) 601-3054', 'marco.obregoso',      'employee', 'active',  null,            false),
  ('Marianne',    '',            'maridolce239@gmail.com',                 '(239) 778-7104', 'marianne',            'employee', 'active',  'Contractor',    true),
  ('Melissa',     'Dial',        'melissa@baydesignstore.com',             '(239) 628-7557', 'melissa.dial',        'employee', 'active',  null,            false),
  ('Sergio Jr',   'Orbegoso',    'sergio.orbegoso.lwths@gmail.com',        '(239) 601-4208', 'sergio.jr.orbegoso',  'manager',  'active',  null,            false),
  ('Sergio',      'Orbegoso',    'sergio@baydesignstore.com',              '(239) 601-4822', 'sergio.orbegoso',     'employee', 'active',  null,            false),
  ('Susan',       'Bay',         'susan@baydesignstore.com',               '(734) 604-1710', 'susan.bay',           'employee', 'active',  null,            false),
  ('Victoria',    'Bird',        'victoria@baydesignstore.com',            '(617) 820-8048', 'victoria.bird',       'employee', 'pending', null,            false),
  ('Weednel',     'Delphonse',   'tpbyweednel15@gmail.com',                '(239) 315-2732', 'weednel.delphonse',   'manager',  'active',  null,            false),
  ('Yael',        'Rocha',       'yael@baydesignstore.com',                '(385) 219-0750', 'yael.rocha',          'manager',  'active',  null,            false)
) as v(first_name, last_name, email, phone, login_id, access_level, status, title, is_contractor);

-- Primary roles shown in the roster, plus the Downtown/Uptown roles people were scheduled under.
insert into employee_roles (employee_id, role_id, is_primary)
select e.id, r.id, v.is_primary
from (values
  ('hemant.singh',     'Admin',           true),
  ('jessica.bablitz',  'Admin Assistant', true),
  ('jessica.bablitz',  'Downtown',        false),
  ('jessica.bablitz',  'Uptown',          false),
  ('leah.spencer',     'Designer',        true),
  ('leah.spencer',     'Downtown',        false),
  ('leah.spencer',     'Uptown',          false),
  ('marco.obregoso',   'Driver-stock',    true),
  ('melissa.dial',     'Designer',        true),
  ('melissa.dial',     'Downtown',        false),
  ('melissa.dial',     'Uptown',          false),
  ('susan.bay',        'owner',           true),
  ('james.kreuzberg',  'Downtown',        true),
  ('lynn.stein',       'Downtown',        true),
  ('lynn.stein',       'Uptown',          false),
  ('marianne',         'Uptown',          true),
  ('yael.rocha',       'Uptown',          true)
) as v(login_id, role_name, is_primary)
join employees e on e.login_id = v.login_id
join job_roles r on r.name = v.role_name;

-- Wages (only Marianne had one in Homebase)
insert into employee_wages (employee_id, wage_type, amount, effective_from)
select id, 'hourly', 27.00, date '2026-01-01' from employees where login_id = 'marianne';
