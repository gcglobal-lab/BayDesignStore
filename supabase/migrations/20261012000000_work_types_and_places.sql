-- =============================================================================
-- Bay Design Base — job types and readable clock-in places
-- =============================================================================
--   * Each role has a work type (showroom / designer / warehouse / driver) that
--     decides which time clock someone sees on their Home screen.
--   * Every clock in/out stores a readable place: the store name when inside a
--     store's geofence ("Uptown", "Downtown"), otherwise the street address.
--   * Designers and drivers can add a note (client / route) when clocking in.
--   * Two stores: Uptown (5510 Shirley St) and Downtown (326 13th Ave S).
-- =============================================================================

create type work_type as enum ('showroom', 'designer', 'warehouse', 'driver');

alter table job_roles add column work_type work_type not null default 'showroom';

update job_roles set work_type = 'designer'  where lower(name) in ('designer', 'design assistant');
update job_roles set work_type = 'warehouse' where lower(name) in ('stock', 'install', 'carpenter');
update job_roles set work_type = 'driver'    where lower(name) in ('driver-stock', 'driver');

alter table time_entries
  add column clock_in_place  text check (char_length(clock_in_place) <= 200),
  add column clock_out_place text check (char_length(clock_out_place) <= 200),
  add column clock_in_note   text check (char_length(clock_in_note) <= 300);

-- Store locations. Coordinates: Downtown from OpenStreetMap (the store itself),
-- Uptown from the US Census geocoder (address point, so a slightly larger fence).
update locations
set name = 'Uptown', address1 = '5510 Shirley Street', city = 'Naples', state = 'Florida', postal_code = '34109',
    latitude = 26.214225, longitude = -81.781417, geofence_radius_m = 200, timezone = 'America/New_York'
where address1 = '5510 Shirley Street';

insert into locations (name, phone, address1, city, state, postal_code, country, timezone, business_type, business_category, latitude, longitude, geofence_radius_m)
select 'Downtown', '(239) 778-9709', '326 13th Avenue South', 'Naples', 'Florida', '34102', 'United States', 'America/New_York',
       'Retail', 'Furniture/Home Goods', 26.130839, -81.801311, 150
where not exists (select 1 from locations where address1 ilike '326 13th%');

-- Naples, Florida is on Eastern Time. Off-site clock-ins are allowed (designers visit clients).
update company_settings set timezone = 'America/New_York', enforce_geofence = false where id = 1;
