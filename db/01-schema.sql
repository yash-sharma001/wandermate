-- WanderMates schema (PostgreSQL). Flags stay SMALLINT 0/1 so API payloads match the old app.

-- pgvector: embeddings for the AI layer (recommendations); no separate vector DB needed yet
CREATE EXTENSION IF NOT EXISTS vector;
-- PostGIS: geo distance (see haversine() in 02-logic.sql)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  gender TEXT,
  date_of_birth DATE,
  profile_photo TEXT,
  bio TEXT,
  home_location TEXT,
  languages JSONB,
  interests JSONB,
  trust_score INT DEFAULT 50,
  verification_level TEXT DEFAULT 'unverified',
  is_verified SMALLINT DEFAULT 0,
  aadhaar_number_masked TEXT,
  aadhaar_status TEXT DEFAULT 'unverified' CHECK (aadhaar_status IN ('unverified','pending','verified','rejected')),
  aadhaar_photo_url TEXT,
  phone_number TEXT,
  upi_id TEXT,
  phone_verified SMALLINT DEFAULT 0,
  email_verified SMALLINT DEFAULT 0,
  role TEXT DEFAULT 'traveler',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_email_verifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE activities (
  id SERIAL PRIMARY KEY,
  host_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 255),
  description TEXT,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('Cafe','Hike','Night Out','Wellness','Foodie','Creative','Photo','Getaway','Sports','Spiritual','Meetup','Other')),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location_name TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  capacity INT DEFAULT 10 CHECK (capacity BETWEEN 2 AND 50),
  current_attendees INT DEFAULT 0,
  gender_filter TEXT DEFAULT 'all' CHECK (gender_filter IN ('all','male','female')),
  min_age INT,
  max_age INT,
  is_active SMALLINT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_activities_active ON activities (is_active, start_time);

CREATE TABLE activity_rsvps (
  id SERIAL PRIMARY KEY,
  activity_id INT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (activity_id, user_id)
);

CREATE TABLE private_pins (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location_name TEXT,
  title TEXT,
  note TEXT,
  photos JSONB,
  voice_note_url TEXT,
  mood_emoji TEXT,
  visit_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE recommendations (
  id SERIAL PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location_name TEXT NOT NULL,
  category TEXT NOT NULL,
  pin_count INT DEFAULT 0,
  positive_sentiment_count INT DEFAULT 0,
  is_verified SMALLINT DEFAULT 0,
  aggregate_rating NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_pinned_at TIMESTAMPTZ
);

CREATE TABLE marketplace_vendors (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  website TEXT,
  is_verified SMALLINT DEFAULT 0,
  rating NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE marketplace_listings (
  id SERIAL PRIMARY KEY,
  vendor_id INT REFERENCES marketplace_vendors(id) ON DELETE SET NULL,
  created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_name TEXT,
  vendor_name TEXT,
  duration TEXT,
  image_url TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  rating NUMERIC(3,2),
  is_active SMALLINT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_listings_category ON marketplace_listings (category, is_active);

CREATE TABLE marketplace_bookings (
  id SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity INT DEFAULT 1 CHECK (quantity >= 1),
  total_price NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  booking_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_bookings_user ON marketplace_bookings (user_id, status);

CREATE TABLE travel_providers (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  website TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_name TEXT,
  is_verified SMALLINT DEFAULT 0,
  rating NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE travel_packages (
  id SERIAL PRIMARY KEY,
  provider_id INT NOT NULL REFERENCES travel_providers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  destination TEXT NOT NULL,
  destination_latitude DOUBLE PRECISION,
  destination_longitude DOUBLE PRECISION,
  duration_days INT NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  max_travelers INT DEFAULT 20,
  includes JSONB,
  itinerary JSONB,
  image_url TEXT,
  available_from DATE NOT NULL,
  available_to DATE NOT NULL,
  departure_dates JSONB,
  category TEXT DEFAULT 'Adventure',
  is_active SMALLINT DEFAULT 1,
  rating NUMERIC(3,2),
  total_bookings INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE travel_package_bookings (
  id SERIAL PRIMARY KEY,
  package_id INT NOT NULL REFERENCES travel_packages(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  travelers INT DEFAULT 1 CHECK (travelers >= 1),
  travel_date DATE NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE waves (
  id SERIAL PRIMARY KEY,
  host_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin_latitude DOUBLE PRECISION NOT NULL,
  origin_longitude DOUBLE PRECISION NOT NULL,
  origin_name TEXT NOT NULL,
  destination_latitude DOUBLE PRECISION NOT NULL,
  destination_longitude DOUBLE PRECISION NOT NULL,
  destination_name TEXT NOT NULL,
  departure_time TIMESTAMPTZ NOT NULL,
  capacity INT DEFAULT 4 CHECK (capacity >= 1),
  current_travelers INT DEFAULT 1,
  price_per_seat NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price_per_seat >= 0),
  vibe_tags JSONB,
  car_model TEXT,
  car_number TEXT,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE wave_requests (
  id SERIAL PRIMARY KEY,
  wave_id INT NOT NULL REFERENCES waves(id) ON DELETE CASCADE,
  requester_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seats_requested INT DEFAULT 1 CHECK (seats_requested >= 1),
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  message TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (wave_id, requester_id)
);

CREATE TABLE user_reports (
  id SERIAL PRIMARY KEY,
  reporter_id INT REFERENCES users(id) ON DELETE SET NULL,
  reported_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT DEFAULT 'user' CHECK (entity_type IN ('user','activity','wave','listing')),
  entity_id INT,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_emergency_contacts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_sos_alerts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_reviews (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT DEFAULT 'user' CHECK (entity_type IN ('user','activity','wave','listing')),
  entity_id INT,
  entity_title TEXT,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trip groups: shared chat + expense splitting (Splitwise-style)
CREATE TABLE trip_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  -- secret token in the invite link; only the creator can read it (see trip_groups_detail)
  invite_code TEXT NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE trip_group_members (
  group_id INT NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  paid_by INT NOT NULL REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','upi','card','app','other')),
  split_type TEXT NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal','exact')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_expenses_group ON expenses (group_id, expense_date);

CREATE TABLE expense_splits (
  expense_id INT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (expense_id, user_id)
);

-- A payment between two members that settles up debts (cash handed over, UPI transfer, ...)
CREATE TABLE settlements (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  from_user INT NOT NULL REFERENCES users(id),
  to_user INT NOT NULL REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','upi','card','app','other')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (from_user <> to_user)
);

-- One chat per activity, wave or trip group; membership is derived from RSVPs / approved requests
CREATE TABLE group_chats (
  id SERIAL PRIMARY KEY,
  activity_id INT UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
  wave_id INT UNIQUE REFERENCES waves(id) ON DELETE CASCADE,
  trip_group_id INT UNIQUE REFERENCES trip_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK ((activity_id IS NOT NULL)::int + (wave_id IS NOT NULL)::int + (trip_group_id IS NOT NULL)::int = 1)
);

CREATE TABLE group_messages (
  id SERIAL PRIMARY KEY,
  group_chat_id INT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  sender_id INT NOT NULL REFERENCES users(id),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','expense','settlement')),
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_group_messages_chat ON group_messages (group_chat_id, created_at);
