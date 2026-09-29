-- Business logic: helpers, triggers, views (flat read models) and functions (Hasura mutations/queries).
-- Functions that take `hasura_session` receive the caller's identity from Hasura (x-hasura-user-id).

CREATE FUNCTION uid(s json) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(s ->> 'x-hasura-user-id', '')::int
$$;

-- Great-circle distance in metres, computed by PostGIS (spherical earth, same model as the old hand-written formula)
CREATE FUNCTION haversine(lat1 float8, lng1 float8, lat2 float8, lng2 float8) RETURNS float8
LANGUAGE sql IMMUTABLE AS $$
  SELECT ST_DistanceSphere(ST_MakePoint(lng1, lat1), ST_MakePoint(lng2, lat2))
$$;

-- =============================================
-- TRIGGERS
-- =============================================

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_activities_touch BEFORE UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_pins_touch BEFORE UPDATE ON private_pins FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_listings_touch BEFORE UPDATE ON marketplace_listings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_bookings_touch BEFORE UPDATE ON marketplace_bookings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_providers_touch BEFORE UPDATE ON travel_providers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_packages_touch BEFORE UPDATE ON travel_packages FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_pkgbookings_touch BEFORE UPDATE ON travel_package_bookings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Changing phone/email invalidates its verification
CREATE FUNCTION users_reset_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.phone_number IS DISTINCT FROM OLD.phone_number THEN NEW.phone_verified = 0; END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN NEW.email_verified = 0; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_users_reset_verification BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION users_reset_verification();

CREATE FUNCTION rsvp_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE activities SET current_attendees = current_attendees + 1 WHERE id = NEW.activity_id;
  ELSE
    UPDATE activities SET current_attendees = greatest(current_attendees - 1, 0) WHERE id = OLD.activity_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_rsvp_count AFTER INSERT OR DELETE ON activity_rsvps FOR EACH ROW EXECUTE FUNCTION rsvp_count();

CREATE FUNCTION package_booking_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE travel_packages SET total_bookings = total_bookings + 1 WHERE id = NEW.package_id;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_package_booking_count AFTER INSERT ON travel_package_bookings FOR EACH ROW EXECUTE FUNCTION package_booking_count();

-- Trust score = 50 + 10 * average rating received (capped at 100)
CREATE FUNCTION review_trust_score() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users
  SET trust_score = least(100, 50 + (SELECT avg(rating) FROM user_reviews WHERE user_id = NEW.user_id) * 10)
  WHERE id = NEW.user_id;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_review_trust AFTER INSERT ON user_reviews FOR EACH ROW EXECUTE FUNCTION review_trust_score();

CREATE FUNCTION report_trust_penalty() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET trust_score = greatest(0, trust_score - 5) WHERE id = NEW.reported_user_id;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_report_penalty AFTER INSERT ON user_reports FOR EACH ROW EXECUTE FUNCTION report_trust_penalty();

-- Auto-promote a place to a verified recommendation once 3+ distinct users pinned it within 50m
CREATE FUNCTION promote_recommendation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_users int; v_rec int;
BEGIN
  IF NEW.location_name IS NULL THEN RETURN NULL; END IF;
  SELECT count(DISTINCT user_id) INTO v_users FROM private_pins
  WHERE haversine(NEW.latitude, NEW.longitude, latitude, longitude) <= 50
    AND position(lower(NEW.location_name) IN lower(coalesce(location_name, ''))) > 0;
  IF v_users >= 3 THEN
    SELECT id INTO v_rec FROM recommendations
    WHERE haversine(NEW.latitude, NEW.longitude, latitude, longitude) <= 50 LIMIT 1;
    IF v_rec IS NOT NULL THEN
      UPDATE recommendations SET pin_count = v_users, is_verified = 1, last_pinned_at = now() WHERE id = v_rec;
    ELSE
      INSERT INTO recommendations (latitude, longitude, location_name, category, pin_count, is_verified, last_pinned_at)
      VALUES (NEW.latitude, NEW.longitude, NEW.location_name, 'General', v_users, 1, now());
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_pin_recommendation AFTER INSERT ON private_pins FOR EACH ROW EXECUTE FUNCTION promote_recommendation();

-- =============================================
-- VIEWS (flat read models; row access is enforced by Hasura permissions)
-- =============================================

CREATE VIEW user_profiles AS
SELECT u.id, u.full_name, u.username, u.gender, u.profile_photo, u.bio, u.home_location,
       u.languages, u.interests, u.phone_verified, u.email_verified, u.trust_score,
       u.verification_level, u.is_verified, u.aadhaar_status, u.created_at,
       (SELECT count(*) FROM activities WHERE host_id = u.id AND is_active = 1)::int AS hosted_count,
       (SELECT count(*) FROM user_reviews WHERE user_id = u.id)::int AS reviews_count,
       (SELECT count(DISTINCT p) FROM (
          SELECT r.user_id AS p FROM activity_rsvps r JOIN activities a ON a.id = r.activity_id WHERE a.host_id = u.id
          UNION
          SELECT a.host_id FROM activities a JOIN activity_rsvps r ON r.activity_id = a.id WHERE r.user_id = u.id
       ) x)::int AS connections_count
FROM users u;

CREATE VIEW my_profile AS
SELECT p.*, u.email, u.date_of_birth, u.phone_number, u.upi_id, u.aadhaar_number_masked,
       (SELECT count(*) FROM activity_rsvps WHERE user_id = u.id AND status = 'confirmed')::int AS joined_count
FROM user_profiles p JOIN users u ON u.id = p.id;

CREATE VIEW activity_details AS
SELECT a.id, a.title, a.description, a.activity_type, a.longitude, a.latitude, a.location_name,
       a.start_time, a.end_time, a.capacity, a.current_attendees, a.gender_filter, a.min_age, a.max_age,
       a.created_at, a.host_id, u.full_name AS host_name, u.username AS host_username,
       u.profile_photo AS host_photo, u.bio AS host_bio, u.trust_score AS host_trust_score,
       u.aadhaar_status AS host_verification
FROM activities a JOIN users u ON u.id = a.host_id
WHERE a.is_active = 1;

-- Host contact details are only visible to the host and confirmed attendees (filtered on viewer_id)
CREATE VIEW activity_host_contacts AS
SELECT a.id AS activity_id, a.host_id AS viewer_id, u.phone_number AS host_phone, u.email AS host_email
FROM activities a JOIN users u ON u.id = a.host_id
UNION ALL
SELECT r.activity_id, r.user_id, u.phone_number, u.email
FROM activity_rsvps r JOIN activities a ON a.id = r.activity_id JOIN users u ON u.id = a.host_id
WHERE r.status = 'confirmed';

CREATE VIEW activity_attendees AS
SELECT r.activity_id, u.id, u.full_name, u.username, u.profile_photo, u.trust_score, u.verification_level
FROM activity_rsvps r JOIN users u ON u.id = r.user_id
WHERE r.status = 'confirmed';

CREATE VIEW marketplace_bookings_detail AS
SELECT b.*, ml.title AS listing_title, ml.category, ml.vendor_name, ml.location_name, ml.duration,
       ml.price AS unit_price, ml.created_by AS listing_owner_id,
       u.full_name AS booker_name, u.email AS booker_email
FROM marketplace_bookings b
JOIN marketplace_listings ml ON ml.id = b.listing_id
JOIN users u ON u.id = b.user_id;

CREATE VIEW travel_packages_detail AS
SELECT tp.*, p.user_id AS provider_user_id, p.company_name AS provider_name,
       p.is_verified AS provider_verified, p.rating AS provider_rating,
       p.contact_phone AS provider_phone, p.contact_email AS provider_email,
       p.website AS provider_website, p.location_name AS provider_location
FROM travel_packages tp JOIN travel_providers p ON p.id = tp.provider_id;

CREATE VIEW travel_package_bookings_detail AS
SELECT b.*, tp.title AS package_title, tp.destination, tp.duration_days, tp.price AS unit_price,
       p.company_name AS provider_name, p.user_id AS provider_user_id,
       u.full_name AS booker_name, u.email AS booker_email
FROM travel_package_bookings b
JOIN travel_packages tp ON tp.id = b.package_id
JOIN travel_providers p ON p.id = tp.provider_id
JOIN users u ON u.id = b.user_id;

CREATE VIEW wave_feed AS
SELECT w.*, u.full_name AS host_name, u.trust_score, u.profile_photo, u.bio, u.verification_level,
       (SELECT count(*) FROM wave_requests wr WHERE wr.wave_id = w.id AND wr.status = 'pending')::int AS pending_requests
FROM waves w JOIN users u ON u.id = w.host_id;

CREATE VIEW wave_requests_detail AS
SELECT wr.*, w.origin_name, w.destination_name, w.departure_time, w.host_id,
       hu.full_name AS host_name, ru.full_name, ru.trust_score, ru.profile_photo
FROM wave_requests wr
JOIN waves w ON w.id = wr.wave_id
JOIN users hu ON hu.id = w.host_id
JOIN users ru ON ru.id = wr.requester_id;

CREATE VIEW wave_passengers AS
SELECT wr.wave_id, u.id, u.full_name, u.profile_photo, wr.seats_requested
FROM wave_requests wr JOIN users u ON u.id = wr.requester_id
WHERE wr.status = 'approved';

CREATE VIEW wave_host_contacts AS
SELECT w.id AS wave_id, w.host_id AS viewer_id, u.phone_number, u.email
FROM waves w JOIN users u ON u.id = w.host_id
UNION ALL
SELECT wr.wave_id, wr.requester_id, u.phone_number, u.email
FROM wave_requests wr JOIN waves w ON w.id = wr.wave_id JOIN users u ON u.id = w.host_id
WHERE wr.status = 'approved';

-- =============================================
-- QUERY FUNCTIONS (STABLE -> GraphQL queries)
-- =============================================

-- (replaced by an index-backed version in 05-geo-index.sql)
CREATE FUNCTION nearby_activities(p_lat float8, p_lng float8, p_radius int DEFAULT 10000, p_gender text DEFAULT NULL)
RETURNS SETOF activity_details LANGUAGE sql STABLE AS $$
  SELECT * FROM activity_details a
  WHERE a.start_time > now() AND a.start_time < now() + interval '24 hours'
    AND haversine(p_lat, p_lng, a.latitude, a.longitude) <= p_radius
    AND (p_gender IS NULL OR p_gender = 'all' OR a.gender_filter IN (p_gender, 'all'))
  ORDER BY a.start_time LIMIT 100
$$;

CREATE FUNCTION my_pins(p_lat float8 DEFAULT NULL, p_lng float8 DEFAULT NULL, p_radius int DEFAULT NULL, hasura_session json DEFAULT NULL)
RETURNS SETOF private_pins LANGUAGE sql STABLE AS $$
  SELECT * FROM private_pins
  WHERE user_id = uid(hasura_session)
    AND (p_lat IS NULL OR p_lng IS NULL OR p_radius IS NULL OR haversine(p_lat, p_lng, latitude, longitude) <= p_radius)
  ORDER BY visit_date DESC
$$;

CREATE FUNCTION nearby_recommendations(p_lat float8, p_lng float8, p_radius int DEFAULT 5000, p_category text DEFAULT NULL)
RETURNS SETOF recommendations LANGUAGE sql STABLE AS $$
  SELECT * FROM recommendations
  WHERE is_verified = 1 AND haversine(p_lat, p_lng, latitude, longitude) <= p_radius
    AND (p_category IS NULL OR category = p_category)
  ORDER BY pin_count DESC, last_pinned_at DESC NULLS LAST LIMIT 50
$$;

CREATE FUNCTION search_listings(p_category text DEFAULT NULL, p_lat float8 DEFAULT NULL, p_lng float8 DEFAULT NULL, p_radius int DEFAULT NULL)
RETURNS SETOF marketplace_listings LANGUAGE sql STABLE AS $$
  SELECT * FROM marketplace_listings
  WHERE is_active = 1 AND (p_category IS NULL OR category = p_category)
    AND (p_lat IS NULL OR p_lng IS NULL OR p_radius IS NULL OR haversine(p_lat, p_lng, latitude, longitude) <= p_radius)
  ORDER BY rating DESC NULLS LAST, created_at DESC
$$;

CREATE FUNCTION search_packages(p_category text DEFAULT NULL, p_travel_date date DEFAULT NULL, p_lat float8 DEFAULT NULL, p_lng float8 DEFAULT NULL, p_radius int DEFAULT NULL)
RETURNS SETOF travel_packages_detail LANGUAGE sql STABLE AS $$
  SELECT * FROM travel_packages_detail tp
  WHERE tp.is_active = 1 AND (p_category IS NULL OR tp.category = p_category)
    AND (p_travel_date IS NULL OR p_travel_date BETWEEN tp.available_from AND tp.available_to)
    AND (p_lat IS NULL OR p_lng IS NULL OR p_radius IS NULL
         OR haversine(p_lat, p_lng, tp.destination_latitude, tp.destination_longitude) <= p_radius)
  ORDER BY tp.rating DESC NULLS LAST, tp.total_bookings DESC
$$;

-- =============================================
-- MUTATION FUNCTIONS (VOLATILE -> GraphQL mutations)
-- =============================================

CREATE FUNCTION rsvp_activity(p_activity_id int, hasura_session json DEFAULT NULL)
RETURNS SETOF activity_rsvps LANGUAGE plpgsql AS $$
DECLARE v_uid int := uid(hasura_session); a activities%ROWTYPE;
BEGIN
  SELECT * INTO a FROM activities WHERE id = p_activity_id AND is_active = 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'check_violation'; END IF;
  IF a.host_id = v_uid THEN RAISE EXCEPTION 'Cannot RSVP to your own activity' USING ERRCODE = 'check_violation'; END IF;
  IF a.current_attendees >= a.capacity THEN RAISE EXCEPTION 'Activity is full' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM activity_rsvps WHERE activity_id = p_activity_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Already RSVPed to this activity' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY WITH i AS (
    INSERT INTO activity_rsvps (activity_id, user_id, status) VALUES (p_activity_id, v_uid, 'confirmed') RETURNING *
  ) SELECT * FROM i;
END $$;

CREATE FUNCTION cancel_rsvp(p_activity_id int, hasura_session json DEFAULT NULL)
RETURNS SETOF activity_rsvps LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY WITH d AS (
    DELETE FROM activity_rsvps WHERE activity_id = p_activity_id AND user_id = uid(hasura_session) RETURNING *
  ) SELECT * FROM d;
  IF NOT FOUND THEN RAISE EXCEPTION 'RSVP not found' USING ERRCODE = 'check_violation'; END IF;
END $$;

CREATE FUNCTION create_booking(p_listing_id int, p_quantity int DEFAULT 1, p_booking_date date DEFAULT NULL, p_notes text DEFAULT NULL, hasura_session json DEFAULT NULL)
RETURNS SETOF marketplace_bookings LANGUAGE plpgsql AS $$
DECLARE l marketplace_listings%ROWTYPE;
BEGIN
  SELECT * INTO l FROM marketplace_listings WHERE id = p_listing_id AND is_active = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Listing not found' USING ERRCODE = 'check_violation'; END IF;
  RETURN QUERY WITH i AS (
    INSERT INTO marketplace_bookings (listing_id, user_id, quantity, total_price, booking_date, notes)
    VALUES (p_listing_id, uid(hasura_session), p_quantity, l.price * p_quantity, p_booking_date, p_notes) RETURNING *
  ) SELECT * FROM i;
END $$;

CREATE FUNCTION update_booking_status(p_booking_id int, p_status text, hasura_session json DEFAULT NULL)
RETURNS SETOF marketplace_bookings LANGUAGE plpgsql AS $$
BEGIN
  IF p_status NOT IN ('confirmed', 'cancelled') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE = 'check_violation'; END IF;
  RETURN QUERY WITH u AS (
    UPDATE marketplace_bookings b SET status = p_status
    FROM marketplace_listings ml
    WHERE b.id = p_booking_id AND ml.id = b.listing_id AND ml.created_by = uid(hasura_session)
    RETURNING b.*
  ) SELECT * FROM u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found or unauthorized' USING ERRCODE = 'check_violation'; END IF;
END $$;

CREATE FUNCTION cancel_booking(p_booking_id int, hasura_session json DEFAULT NULL)
RETURNS SETOF marketplace_bookings LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY WITH u AS (
    UPDATE marketplace_bookings SET status = 'cancelled'
    WHERE id = p_booking_id AND user_id = uid(hasura_session) RETURNING *
  ) SELECT * FROM u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found or unauthorized' USING ERRCODE = 'check_violation'; END IF;
END $$;

CREATE FUNCTION get_or_create_provider(hasura_session json DEFAULT NULL)
RETURNS SETOF travel_providers LANGUAGE plpgsql AS $$
DECLARE v_uid int := uid(hasura_session);
BEGIN
  INSERT INTO travel_providers (user_id, company_name, contact_email)
  SELECT id, full_name, email FROM users WHERE id = v_uid
  ON CONFLICT (user_id) DO NOTHING;
  RETURN QUERY SELECT * FROM travel_providers WHERE user_id = v_uid;
END $$;

CREATE FUNCTION book_travel_package(p_package_id int, p_travel_date date, p_travelers int DEFAULT 1, p_notes text DEFAULT NULL, hasura_session json DEFAULT NULL)
RETURNS SETOF travel_package_bookings LANGUAGE plpgsql AS $$
DECLARE pkg travel_packages%ROWTYPE;
BEGIN
  SELECT * INTO pkg FROM travel_packages WHERE id = p_package_id AND is_active = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Package not found' USING ERRCODE = 'check_violation'; END IF;
  RETURN QUERY WITH i AS (
    INSERT INTO travel_package_bookings (package_id, user_id, travelers, travel_date, total_price, notes)
    VALUES (p_package_id, uid(hasura_session), p_travelers, p_travel_date, pkg.price * p_travelers, p_notes) RETURNING *
  ) SELECT * FROM i;
END $$;

CREATE FUNCTION update_package_booking_status(p_booking_id int, p_status text, hasura_session json DEFAULT NULL)
RETURNS SETOF travel_package_bookings LANGUAGE plpgsql AS $$
BEGIN
  IF p_status NOT IN ('confirmed', 'cancelled') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE = 'check_violation'; END IF;
  RETURN QUERY WITH u AS (
    UPDATE travel_package_bookings b SET status = p_status
    FROM travel_packages tp, travel_providers p
    WHERE b.id = p_booking_id AND tp.id = b.package_id AND p.id = tp.provider_id AND p.user_id = uid(hasura_session)
    RETURNING b.*
  ) SELECT * FROM u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found or unauthorized' USING ERRCODE = 'check_violation'; END IF;
END $$;

-- Waves: 10% service fee on top of the seat price
CREATE FUNCTION join_wave(p_wave_id int, p_seats_requested int, hasura_session json DEFAULT NULL)
RETURNS SETOF wave_requests LANGUAGE plpgsql AS $$
DECLARE v_uid int := uid(hasura_session); w waves%ROWTYPE; v_base numeric;
BEGIN
  IF p_seats_requested < 1 THEN RAISE EXCEPTION 'At least 1 seat must be requested' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO w FROM waves WHERE id = p_wave_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active wave not found' USING ERRCODE = 'check_violation'; END IF;
  IF w.host_id = v_uid THEN RAISE EXCEPTION 'Cannot join your own wave' USING ERRCODE = 'check_violation'; END IF;
  IF w.current_travelers + p_seats_requested > w.capacity THEN RAISE EXCEPTION 'Not enough seats available' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM wave_requests WHERE wave_id = p_wave_id AND requester_id = v_uid) THEN
    RAISE EXCEPTION 'You have already requested to join this wave' USING ERRCODE = 'check_violation';
  END IF;
  v_base := w.price_per_seat * p_seats_requested;
  RETURN QUERY WITH i AS (
    INSERT INTO wave_requests (wave_id, requester_id, seats_requested, total_price, service_fee)
    VALUES (p_wave_id, v_uid, p_seats_requested, v_base * 1.10, v_base * 0.10) RETURNING *
  ) SELECT * FROM i;
END $$;

CREATE FUNCTION process_wave_request(p_request_id int, p_status text, hasura_session json DEFAULT NULL)
RETURNS SETOF wave_requests LANGUAGE plpgsql AS $$
DECLARE r wave_requests%ROWTYPE; w waves%ROWTYPE;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO r FROM wave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO w FROM waves WHERE id = r.wave_id FOR UPDATE;
  IF w.host_id <> uid(hasura_session) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'check_violation'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Request is already processed' USING ERRCODE = 'check_violation'; END IF;
  IF p_status = 'approved' THEN
    IF w.current_travelers + r.seats_requested > w.capacity THEN RAISE EXCEPTION 'Not enough capacity remaining' USING ERRCODE = 'check_violation'; END IF;
    UPDATE waves SET current_travelers = current_travelers + r.seats_requested WHERE id = w.id;
  END IF;
  RETURN QUERY WITH u AS (UPDATE wave_requests SET status = p_status WHERE id = p_request_id RETURNING *) SELECT * FROM u;
END $$;

CREATE FUNCTION cancel_wave_member(p_request_id int, p_reason text, hasura_session json DEFAULT NULL)
RETURNS SETOF wave_requests LANGUAGE plpgsql AS $$
DECLARE r wave_requests%ROWTYPE; w waves%ROWTYPE;
BEGIN
  IF coalesce(p_reason, '') = '' THEN RAISE EXCEPTION 'Cancellation reason is required' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO r FROM wave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO w FROM waves WHERE id = r.wave_id FOR UPDATE;
  IF w.host_id <> uid(hasura_session) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'check_violation'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Only approved members can be cancelled' USING ERRCODE = 'check_violation'; END IF;
  UPDATE waves SET current_travelers = greatest(1, current_travelers - r.seats_requested) WHERE id = w.id;
  RETURN QUERY WITH u AS (
    UPDATE wave_requests SET status = 'cancelled', cancellation_reason = p_reason WHERE id = p_request_id RETURNING *
  ) SELECT * FROM u;
END $$;

-- Group chat: only the host and confirmed/approved members may open (or read/write) a trip chat
CREATE FUNCTION get_or_create_group_chat(p_type text, p_reference_id int, hasura_session json DEFAULT NULL)
RETURNS SETOF group_chats LANGUAGE plpgsql AS $$
DECLARE v_uid int := uid(hasura_session); v_member boolean;
BEGIN
  IF p_type = 'activity' THEN
    v_member := EXISTS (SELECT 1 FROM activities WHERE id = p_reference_id AND host_id = v_uid)
      OR EXISTS (SELECT 1 FROM activity_rsvps WHERE activity_id = p_reference_id AND user_id = v_uid AND status = 'confirmed');
    IF v_member THEN
      INSERT INTO group_chats (activity_id) VALUES (p_reference_id) ON CONFLICT (activity_id) DO NOTHING;
    END IF;
  ELSIF p_type = 'wave' THEN
    v_member := EXISTS (SELECT 1 FROM waves WHERE id = p_reference_id AND host_id = v_uid)
      OR EXISTS (SELECT 1 FROM wave_requests WHERE wave_id = p_reference_id AND requester_id = v_uid AND status = 'approved');
    IF v_member THEN
      INSERT INTO group_chats (wave_id) VALUES (p_reference_id) ON CONFLICT (wave_id) DO NOTHING;
    END IF;
  ELSIF p_type = 'group' THEN
    v_member := EXISTS (SELECT 1 FROM trip_group_members WHERE group_id = p_reference_id AND user_id = v_uid);
    IF v_member THEN
      INSERT INTO group_chats (trip_group_id) VALUES (p_reference_id) ON CONFLICT (trip_group_id) DO NOTHING;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown chat type' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT v_member THEN RAISE EXCEPTION 'Messaging is restricted to confirmed members only.' USING ERRCODE = 'check_violation'; END IF;
  RETURN QUERY SELECT * FROM group_chats
    WHERE (p_type = 'activity' AND activity_id = p_reference_id) OR (p_type = 'wave' AND wave_id = p_reference_id)
       OR (p_type = 'group' AND trip_group_id = p_reference_id);
END $$;

-- Verification (email/phone OTP checks live in the actions service, which rate-limits guesses)
CREATE FUNCTION submit_aadhaar(p_aadhaar_number text, p_aadhaar_name text, p_aadhaar_url text, p_photo_url text, hasura_session json DEFAULT NULL)
RETURNS SETOF users LANGUAGE plpgsql AS $$
DECLARE v_uid int := uid(hasura_session); u users%ROWTYPE;
BEGIN
  IF p_aadhaar_number !~ '^[0-9]{12}$' THEN RAISE EXCEPTION 'Aadhaar number must be 12 digits' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO u FROM users WHERE id = v_uid;
  IF lower(trim(p_aadhaar_name)) <> lower(trim(u.full_name)) THEN
    RAISE EXCEPTION 'Name on Aadhaar (%) does not match your profile name. Please ensure your profile name is correct before verifying.', p_aadhaar_name USING ERRCODE = 'check_violation';
  END IF;
  UPDATE users SET aadhaar_number_masked = '**** **** ' || right(p_aadhaar_number, 4),
                   aadhaar_photo_url = p_aadhaar_url,
                   profile_photo = coalesce(p_photo_url, profile_photo),
                   aadhaar_status = 'pending',
                   trust_score = CASE WHEN trust_score < 95 THEN trust_score + 5 ELSE trust_score END
  WHERE id = v_uid;
  RETURN QUERY SELECT * FROM users WHERE id = v_uid;
END $$;
