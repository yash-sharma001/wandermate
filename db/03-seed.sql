-- Sample data (password for every sample user is the same bcrypt hash as before)

INSERT INTO users (email, password_hash, full_name, username, gender, bio, trust_score, verification_level, role) VALUES
  ('sarah@example.com', '$2a$10$NS5nX1kIDyLZclUEMElPcuRyIc3kt/tedvWhWs3FvxAmMeimfFlm.', 'Sarah Mitchell', 'sarahtravels', 'female', 'Adventure seeker | Digital Nomad', 75, 'verified', 'traveler'),
  ('alex@example.com', '$2a$10$NS5nX1kIDyLZclUEMElPcuRyIc3kt/tedvWhWs3FvxAmMeimfFlm.', 'Alex Johnson', 'alexexplorer', 'male', 'Solo traveler | Photography enthusiast', 80, 'verified', 'traveler'),
  ('priya@example.com', '$2a$10$NS5nX1kIDyLZclUEMElPcuRyIc3kt/tedvWhWs3FvxAmMeimfFlm.', 'Priya Sharma', 'priyawanders', 'female', 'Yoga teacher | Mountain lover', 70, 'phone_verified', 'traveler'),
  ('vendor@example.com', '$2a$10$NS5nX1kIDyLZclUEMElPcuRyIc3kt/tedvWhWs3FvxAmMeimfFlm.', 'Red Chili Adventure', 'redchili', 'other', 'Adventure sports provider in Rishikesh since 2010', 90, 'verified', 'vendor');

INSERT INTO activities (host_id, title, description, activity_type, latitude, longitude, location_name, start_time, capacity, gender_filter) VALUES
  (1, 'Morning Yoga by the Ganges', 'Join for peaceful morning yoga session with river view', 'Wellness', 30.0869, 78.2980, 'Parmarth Niketan, Rishikesh', now() + interval '2 hours', 10, 'all'),
  (2, 'Cafe Hopping in Tapovan', 'Exploring the best cafes in Tapovan area', 'Cafe', 30.1265, 78.3230, 'Tapovan, Rishikesh', now() + interval '4 hours', 5, 'all'),
  (3, 'Sunset Hike to Neer Garh', 'Easy hike to beautiful waterfall', 'Hike', 30.1420, 78.3175, 'Neer Garh Waterfall', now() + interval '6 hours', 8, 'all');

INSERT INTO marketplace_listings (created_by, title, description, category, price, latitude, longitude, location_name, vendor_name, duration, rating) VALUES
  (1, 'River Rafting 16km', 'Exciting 16km river rafting from Shivpuri to Rishikesh with Grade III-IV rapids. Includes all safety gear, certified guides, and refreshments.', 'Rafting', 600.00, 30.1200, 78.3000, 'Shivpuri, Rishikesh', 'Red Chili Adventure', '3 hours', 4.80),
  (2, 'Hostel Dorm Bed', 'Comfortable dorm bed with mountain views, common kitchen, rooftop cafe, and a vibrant social scene. Perfect for solo travelers.', 'Stays', 450.00, 30.1265, 78.3230, 'Tapovan, Rishikesh', 'Zostel Rishikesh', 'Per night', 4.50),
  (3, 'Riverside Camping', 'Overnight camping on the banks of the Ganges with bonfire, music, dinner, and breakfast included. Luxury swiss tents.', 'Camping', 1200.00, 30.1200, 78.3000, 'Shivpuri, Rishikesh', 'Camp Wildex', '1 night', 4.70),
  (1, 'Photography Tour', 'Guided photography tour covering the best spots — Lakshman Jhula, Ram Jhula, Beatles Ashram, and sunset at Triveni Ghat.', 'Photography', 800.00, 30.0869, 78.2980, 'Rishikesh', 'Rishikesh Clicks', '4 hours', 4.60),
  (2, 'Morning Yoga Class', 'Traditional yoga session by the Ganges with experienced instructors. Includes pranayama, asanas, and meditation.', 'Yoga', 300.00, 30.0869, 78.2980, 'Parmarth Niketan, Rishikesh', 'Parmarth Niketan', '90 mins', 4.90),
  (3, 'Cafe Workspace Pass', 'Full day workspace access with high-speed WiFi, unlimited coffee/tea, and 10% off on food. River-view seating.', 'Cafe', 200.00, 30.1265, 78.3230, 'Tapovan, Rishikesh', 'Little Buddha Cafe', 'Full day', 4.40);

INSERT INTO travel_providers (user_id, company_name, description, contact_email, latitude, longitude, location_name, is_verified, rating) VALUES
  (4, 'Red Chili Adventure Tours', 'Premium adventure travel packages in Uttarakhand since 2010. Rafting, trekking, camping and more.', 'tours@redchili.com', 30.0869, 78.2980, 'Rishikesh, Uttarakhand', 1, 4.80);

INSERT INTO travel_packages (provider_id, title, description, destination, destination_latitude, destination_longitude, duration_days, price, max_travelers, includes, itinerary, available_from, available_to, departure_dates, category, rating, total_bookings) VALUES
  (1, 'Rishikesh Adventure Weekend', 'Action-packed 3-day adventure package including rafting, bungee jumping, and camping by the Ganges.', 'Rishikesh, Uttarakhand', 30.0869, 78.2980, 3, 4999.00, 15,
   '["White water rafting 16km", "Bungee jumping", "Riverside camping", "All meals", "Transport from Delhi"]',
   '[{"day":1,"title":"Arrival & Rafting","desc":"Check-in, safety briefing, 16km river rafting from Shivpuri"},{"day":2,"title":"Adventure Day","desc":"Bungee jumping at Mohan Chatti, cliff jumping, body surfing"},{"day":3,"title":"Explore & Depart","desc":"Morning yoga, Beatles Ashram visit, departure"}]',
   '2026-04-01', '2026-12-31', '["2026-04-20","2026-05-04","2026-05-18","2026-06-01","2026-06-15","2026-07-06","2026-08-03","2026-09-07","2026-10-05","2026-11-02","2026-12-07"]', 'Adventure', 4.90, 47),
  (1, 'Valley of Flowers Trek', 'Guided 5-day trek through the stunning Valley of Flowers National Park, a UNESCO World Heritage Site.', 'Valley of Flowers, Uttarakhand', 30.7280, 79.6053, 5, 8499.00, 12,
   '["Professional trek guide", "Camping equipment", "All meals on trek", "Permits & entry fees", "Transport from Rishikesh"]',
   '[{"day":1,"title":"Rishikesh to Govindghat","desc":"Drive to Govindghat, overnight stay"},{"day":2,"title":"Trek to Ghangaria","desc":"Trek 10km to base camp Ghangaria"},{"day":3,"title":"Valley of Flowers","desc":"Full day exploring the valley flora"},{"day":4,"title":"Hemkund Sahib","desc":"Optional trek to Hemkund Sahib lake"},{"day":5,"title":"Return trek","desc":"Trek back and drive to Rishikesh"}]',
   '2026-06-01', '2026-10-31', '["2026-06-15","2026-07-01","2026-07-15","2026-08-01","2026-08-15","2026-09-01","2026-09-15","2026-10-01"]', 'Trekking', 4.85, 32),
  (1, 'Spiritual Rishikesh Retreat', 'Rejuvenating 4-day wellness retreat with yoga, meditation, and Ayurvedic treatments by the Ganges.', 'Rishikesh, Uttarakhand', 30.0869, 78.2980, 4, 6999.00, 10,
   '["Daily yoga sessions", "Meditation classes", "Ayurvedic massage", "Sattvic meals", "Ganga Aarti experience", "Accommodation"]',
   '[{"day":1,"title":"Arrival & Orientation","desc":"Check-in, welcome ceremony, evening Ganga Aarti"},{"day":2,"title":"Yoga & Meditation","desc":"Morning yoga, pranayama workshop, afternoon meditation"},{"day":3,"title":"Healing Day","desc":"Ayurvedic consultation, massage therapy, sound healing"},{"day":4,"title":"Integration & Departure","desc":"Sunrise meditation, closing ceremony, departure"}]',
   '2026-04-01', '2026-12-31', '["2026-04-25","2026-05-10","2026-05-25","2026-06-10","2026-07-10","2026-08-10","2026-09-10","2026-10-10","2026-11-10","2026-12-10"]', 'Wellness', 4.95, 28);

-- Demo login: sarah@example.com / demo1234 is fully verified so hosting activities and rides works out of the box
UPDATE users SET aadhaar_status = 'verified', email_verified = 1, phone_verified = 1, phone_number = '+919800000001',
  is_verified = 1, verification_level = 'verified' WHERE email = 'sarah@example.com';
