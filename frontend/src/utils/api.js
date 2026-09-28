import axios from 'axios';
import { createClient } from 'graphql-ws';

// Everything goes through the gateway (same origin) unless REACT_APP_API_URL points elsewhere.
const API_URL = process.env.REACT_APP_API_URL ?? '';

// REST is only used for auth and file uploads; all data goes through Hasura GraphQL.
const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const logoutLocally = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) logoutLocally();
    return Promise.reject(error);
  }
);

// ---------- GraphQL plumbing ----------

// Errors look like axios errors ({ response: { data: { error } } }) so components keep working unchanged.
const fail = (message, status = 400) => {
  const err = new Error(message);
  err.response = { status, data: { error: message } };
  return err;
};

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const PERMISSION_DENIED = 'check constraint of an insert/update permission has failed';

// `denied` = friendly message for when Hasura's insert/update permission check rejects the row
export const gql = async (query, variables = {}, { denied } = {}) => {
  const res = await fetch(`${API_URL}/v1/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) {
    logoutLocally();
    throw fail('Session expired', 401);
  }
  const body = await res.json();
  if (body.errors?.length) {
    const e = body.errors[0];
    let message = e.extensions?.internal?.error?.message || e.message; // Postgres RAISE EXCEPTION text
    if (message.includes(PERMISSION_DENIED)) message = denied || 'Not allowed';
    message = message.replace(/^Check constraint violation. /, ''); // Hasura's prefix on our RAISE EXCEPTION texts
    throw fail(message);
  }
  return body.data;
};

const meId = () => JSON.parse(localStorage.getItem('user') || '{}').id;

const pick = (obj = {}, keys) => Object.fromEntries(
  keys.filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '').map((k) => [k, obj[k]])
);

const asJson = (v) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch (e) { return v; } })() : v);

// Upload files (multipart) to the actions service; returns { fieldName: [urls] }
const upload = async (files) => {
  if (!files.length) return {};
  const fd = new FormData();
  files.forEach(({ field, file }) => fd.append(field, file));
  const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data.files.reduce((acc, f) => ({ ...acc, [f.field]: [...(acc[f.field] || []), f.url] }), {});
};

// FormData (or plain object) -> { fields, files }
const splitForm = (data) => {
  const fields = {};
  const files = [];
  if (data instanceof FormData) {
    data.forEach((value, key) => (value instanceof File ? files.push({ field: key, file: value }) : (fields[key] = value)));
  } else {
    Object.assign(fields, data);
  }
  return { fields, files };
};

const toRad = (d) => (d * Math.PI) / 180;
const distanceMeters = (lat1, lng1, lat2, lng2) => {
  const c = Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2) - toRad(lng1))
    + Math.sin(toRad(lat1)) * Math.sin(toRad(lat2));
  return 6371000 * Math.acos(Math.min(1, Math.max(-1, c)));
};

const ok = (data) => ({ data });

// ---------- Auth (REST) ----------
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  // token captured now: callers clear localStorage right after calling this
  logout: () => api.post('/auth/logout', null, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
};

// ---------- Activities ----------
const ACTIVITY = `id title description activity_type longitude latitude location_name start_time end_time capacity
  current_attendees gender_filter created_at host_id host_name host_username host_photo host_trust_score host_verification`;

export const activitiesAPI = {
  getNearby: async (lat, lng, radius = 10000, genderFilter) => {
    const d = await gql(
      `query($lat: float8!, $lng: float8!, $radius: Int, $gender: String) {
        nearby_activities(args: {p_lat: $lat, p_lng: $lng, p_radius: $radius, p_gender: $gender}) { ${ACTIVITY} }
        activity_rsvps { activity_id }
      }`,
      { lat, lng, radius, gender: genderFilter && genderFilter !== 'all' ? genderFilter : null }
    );
    const mine = new Set(d.activity_rsvps.map((r) => r.activity_id));
    const activities = d.nearby_activities.map((a) => ({
      ...a,
      is_rsvped: mine.has(a.id) ? 1 : 0,
      distance_meters: distanceMeters(lat, lng, a.latitude, a.longitude),
    }));
    return ok({ activities, count: activities.length });
  },

  getById: async (id) => {
    const d = await gql(
      `query($id: Int!) {
        activity_details(where: {id: {_eq: $id}}) { ${ACTIVITY} host_bio min_age max_age }
        activity_host_contacts(where: {activity_id: {_eq: $id}}, limit: 1) { host_phone host_email }
        activity_rsvps(where: {activity_id: {_eq: $id}}) { id }
        activity_attendees(where: {activity_id: {_eq: $id}}) { id full_name username profile_photo trust_score verification_level }
      }`,
      { id: Number(id) }
    );
    if (!d.activity_details.length) throw fail('Activity not found', 404);
    const activity = { ...d.activity_details[0], ...(d.activity_host_contacts[0] || {}), is_rsvped: d.activity_rsvps.length };
    return ok({ activity, attendees: d.activity_attendees });
  },

  create: async (data) => {
    const object = pick(data, ['title', 'description', 'activity_type', 'latitude', 'longitude', 'location_name',
      'start_time', 'end_time', 'capacity', 'gender_filter', 'min_age', 'max_age']);
    const d = await gql(
      `mutation($object: activities_insert_input!) { insert_activities_one(object: $object) { id title activity_type location_name start_time capacity latitude longitude created_at } }`,
      { object },
      { denied: 'Verification required: verify your identity (Aadhaar) and phone or email before hosting.' }
    );
    return ok({ message: 'Activity created successfully', activity: d.insert_activities_one });
  },

  rsvp: async (id) => {
    await gql(`mutation($id: Int!) { rsvp_activity(args: {p_activity_id: $id}) { id } }`, { id: Number(id) });
    return ok({ message: 'Successfully RSVPed to activity' });
  },

  cancelRSVP: async (id) => {
    await gql(`mutation($id: Int!) { cancel_rsvp(args: {p_activity_id: $id}) { id } }`, { id: Number(id) });
    return ok({ message: 'RSVP cancelled successfully' });
  },

  delete: async (id) => {
    const d = await gql(`mutation($id: Int!) { delete_activities(where: {id: {_eq: $id}}) { affected_rows } }`, { id: Number(id) });
    if (!d.delete_activities.affected_rows) throw fail('Activity not found or unauthorized', 404);
    return ok({ message: 'Activity deleted successfully' });
  },
};

// ---------- Users ----------
const MY_PROFILE = `id email full_name username gender date_of_birth profile_photo bio home_location languages interests
  trust_score verification_level is_verified aadhaar_status aadhaar_number_masked phone_number upi_id phone_verified email_verified
  created_at hosted_count joined_count reviews_count connections_count`;

export const usersAPI = {
  getProfile: async () => {
    const d = await gql(`query { my_profile { ${MY_PROFILE} } }`);
    if (!d.my_profile.length) throw fail('User not found', 404);
    return ok({ user: d.my_profile[0] });
  },

  getUserById: async (identifier) => {
    const isId = /^\d+$/.test(String(identifier));
    const d = await gql(
      `query($where: user_profiles_bool_exp!) {
        user_profiles(where: $where, limit: 1) { id full_name username gender profile_photo bio home_location languages interests
          phone_verified email_verified trust_score verification_level is_verified aadhaar_status created_at
          hosted_count reviews_count connections_count }
      }`,
      { where: isId ? { id: { _eq: Number(identifier) } } : { username: { _eq: identifier } } }
    );
    if (!d.user_profiles.length) throw fail('User not found', 404);
    const user = d.user_profiles[0];
    const up = await gql(
      `query($host: Int!, $now: timestamptz!) {
        activities(where: {host_id: {_eq: $host}, start_time: {_gt: $now}}, order_by: {start_time: asc}, limit: 5) {
          id title activity_type location_name start_time capacity current_attendees }
      }`,
      { host: user.id, now: new Date().toISOString() }
    );
    return ok({ user, upcoming_activities: up.activities });
  },

  updateProfile: async (data) => {
    const { fields, files } = splitForm(data);
    const photo = (await upload(files.filter((f) => f.field === 'profile_photo')))['profile_photo']?.[0];
    const _set = pick({ ...fields, profile_photo: photo || (typeof fields.profile_photo === 'string' ? fields.profile_photo : undefined),
      languages: asJson(fields.languages), interests: asJson(fields.interests) },
      ['full_name', 'email', 'phone_number', 'upi_id', 'bio', 'profile_photo', 'home_location', 'languages', 'interests']);
    if (!Object.keys(_set).length) throw fail('No valid fields to update');
    await gql(`mutation($set: users_set_input!) { update_users(where: {}, _set: $set) { affected_rows } }`, { set: _set });
    const d = await gql(`query { my_profile { ${MY_PROFILE} } }`);
    return ok({ message: 'Profile updated successfully', user: d.my_profile[0] });
  },

  getMyActivities: async () => {
    const d = await gql(
      `query($me: Int!) {
        hosted: activities(where: {host_id: {_eq: $me}}, order_by: {start_time: desc}) {
          id title activity_type location_name start_time capacity current_attendees created_at longitude latitude }
        rsvps: activity_rsvps(order_by: {activity: {start_time: desc}}) {
          created_at
          activity { id title activity_type location_name start_time capacity current_attendees longitude latitude
            host { full_name username } }
        }
      }`,
      { me: meId() }
    );
    const attending = d.rsvps.map(({ created_at, activity: { host, ...a } }) => ({
      ...a, host_name: host.full_name, host_username: host.username, rsvp_date: created_at,
    }));
    return ok({ hosted: d.hosted, attending });
  },
};

// ---------- Private pins ----------
const PIN = 'id longitude latitude location_name title note photos voice_note_url mood_emoji visit_date created_at';

export const pinsAPI = {
  getAll: async (lat, lng, radius) => {
    const d = await gql(
      `query($lat: float8, $lng: float8, $radius: Int) { my_pins(args: {p_lat: $lat, p_lng: $lng, p_radius: $radius}) { ${PIN} } }`,
      { lat: lat ?? null, lng: lng ?? null, radius: radius ?? null }
    );
    return ok({ pins: d.my_pins, count: d.my_pins.length });
  },

  getById: async (id) => {
    const d = await gql(`query($id: Int!) { private_pins_by_pk(id: $id) { ${PIN} updated_at } }`, { id: Number(id) });
    if (!d.private_pins_by_pk) throw fail('Pin not found', 404);
    return ok({ pin: d.private_pins_by_pk });
  },

  create: async (data) => {
    const { fields, files } = splitForm(data);
    const uploaded = await upload(files.filter((f) => f.field === 'images'));
    const object = pick(
      { ...fields, latitude: parseFloat(fields.latitude), longitude: parseFloat(fields.longitude),
        photos: uploaded.images || asJson(fields.photos) },
      ['latitude', 'longitude', 'location_name', 'title', 'note', 'photos', 'voice_note_url', 'mood_emoji', 'visit_date']
    );
    const d = await gql(
      `mutation($object: private_pins_insert_input!) { insert_private_pins_one(object: $object) { ${PIN} } }`,
      { object }
    );
    return ok({ message: 'Private pin created successfully', pin: d.insert_private_pins_one });
  },

  update: async (id, data) => {
    const _set = pick({ ...data, photos: asJson(data.photos) }, ['location_name', 'title', 'note', 'photos', 'voice_note_url', 'mood_emoji']);
    if (!Object.keys(_set).length) throw fail('No valid fields to update');
    const d = await gql(
      `mutation($id: Int!, $set: private_pins_set_input!) { update_private_pins_by_pk(pk_columns: {id: $id}, _set: $set) { ${PIN} updated_at } }`,
      { id: Number(id), set: _set }
    );
    if (!d.update_private_pins_by_pk) throw fail('Pin not found', 404);
    return ok({ message: 'Pin updated successfully', pin: d.update_private_pins_by_pk });
  },

  delete: async (id) => {
    const d = await gql(`mutation($id: Int!) { delete_private_pins_by_pk(id: $id) { id } }`, { id: Number(id) });
    if (!d.delete_private_pins_by_pk) throw fail('Pin not found', 404);
    return ok({ message: 'Pin deleted successfully' });
  },
};

// ---------- Recommendations ----------
const REC = 'id longitude latitude location_name category pin_count aggregate_rating is_verified last_pinned_at created_at';

export const recommendationsAPI = {
  getNearby: async (lat, lng, radius = 5000, category) => {
    const d = await gql(
      `query($lat: float8!, $lng: float8!, $radius: Int, $category: String) {
        nearby_recommendations(args: {p_lat: $lat, p_lng: $lng, p_radius: $radius, p_category: $category}) { ${REC} } }`,
      { lat, lng, radius, category: category || null }
    );
    return ok({ recommendations: d.nearby_recommendations, count: d.nearby_recommendations.length });
  },

  getById: async (id) => {
    const d = await gql(`query($id: Int!) { recommendations_by_pk(id: $id) { ${REC} } }`, { id: Number(id) });
    if (!d.recommendations_by_pk) throw fail('Recommendation not found', 404);
    return ok({ recommendation: d.recommendations_by_pk });
  },
};

// ---------- Marketplace ----------
const LISTING = `id vendor_id created_by title description category price latitude longitude location_name vendor_name
  duration image_url contact_phone contact_email rating is_active created_at`;
const LISTING_INPUT = ['title', 'description', 'category', 'price', 'latitude', 'longitude', 'location_name', 'vendor_name',
  'duration', 'contact_phone', 'contact_email', 'image_url'];

export const marketplaceAPI = {
  getListings: async (params = {}) => {
    const located = params.lat != null && params.lng != null;
    const d = await gql(
      `query($category: String, $lat: float8, $lng: float8, $radius: Int) {
        search_listings(args: {p_category: $category, p_lat: $lat, p_lng: $lng, p_radius: $radius}) { ${LISTING} } }`,
      { category: params.category || null, lat: located ? params.lat : null, lng: located ? params.lng : null,
        radius: located ? params.radius ?? 50000 : null }
    );
    return ok({ listings: d.search_listings, count: d.search_listings.length });
  },

  getById: async (id) => {
    const d = await gql(
      `query($id: Int!) { marketplace_listings_by_pk(id: $id) { ${LISTING} vendor { vendor_name is_verified } } }`,
      { id: Number(id) }
    );
    const l = d.marketplace_listings_by_pk;
    if (!l) throw fail('Listing not found', 404);
    const { vendor, ...listing } = l;
    return ok({ listing: { ...listing, verified_vendor_name: vendor?.vendor_name, vendor_verified: vendor?.is_verified } });
  },

  create: async (data) => {
    const d = await gql(
      `mutation($object: marketplace_listings_insert_input!) { insert_marketplace_listings_one(object: $object) { ${LISTING} } }`,
      { object: pick(data, LISTING_INPUT) }
    );
    return ok({ message: 'Listing created successfully', listing: d.insert_marketplace_listings_one });
  },

  update: async (id, data) => {
    const d = await gql(
      `mutation($id: Int!, $set: marketplace_listings_set_input!) { update_marketplace_listings_by_pk(pk_columns: {id: $id}, _set: $set) { ${LISTING} } }`,
      { id: Number(id), set: pick(data, LISTING_INPUT) }
    );
    if (!d.update_marketplace_listings_by_pk) throw fail('Listing not found or unauthorized', 404);
    return ok({ message: 'Listing updated', listing: d.update_marketplace_listings_by_pk });
  },

  delete: async (id) => {
    const d = await gql(`mutation($id: Int!) { delete_marketplace_listings_by_pk(id: $id) { id } }`, { id: Number(id) });
    if (!d.delete_marketplace_listings_by_pk) throw fail('Listing not found or unauthorized', 404);
    return ok({ message: 'Listing deleted successfully' });
  },

  getVendor: async (id) => {
    const d = await gql(
      `query($id: Int!) {
        marketplace_vendors_by_pk(id: $id) { id user_id vendor_name description logo_url contact_phone contact_email website is_verified rating }
        marketplace_listings(where: {vendor_id: {_eq: $id}, is_active: {_eq: 1}}, order_by: {created_at: desc}) { ${LISTING} } }`,
      { id: Number(id) }
    );
    if (!d.marketplace_vendors_by_pk) throw fail('Vendor not found', 404);
    return ok({ vendor: d.marketplace_vendors_by_pk, listings: d.marketplace_listings });
  },

  getMyListings: async () => {
    const d = await gql(
      `query($me: Int!) { marketplace_listings(where: {created_by: {_eq: $me}}, order_by: {created_at: desc}) { ${LISTING} } }`,
      { me: meId() }
    );
    return ok({ listings: d.marketplace_listings, count: d.marketplace_listings.length });
  },
};

// ---------- Marketplace bookings ----------
const BOOKING = `id listing_id user_id quantity total_price status booking_date notes created_at updated_at
  listing_title category vendor_name location_name duration unit_price`;

export const bookingAPI = {
  create: async ({ listing_id, quantity = 1, booking_date, notes }) => {
    const d = await gql(
      `mutation($id: Int!, $qty: Int, $date: date, $notes: String) {
        create_booking(args: {p_listing_id: $id, p_quantity: $qty, p_booking_date: $date, p_notes: $notes}) { id listing_id quantity total_price status booking_date notes created_at } }`,
      { id: Number(listing_id), qty: Number(quantity), date: booking_date || null, notes: notes || null }
    );
    return ok({ message: 'Booking created successfully', booking: d.create_booking[0] });
  },

  getMyBookings: async () => {
    const d = await gql(
      `query($me: Int!) { marketplace_bookings_detail(where: {user_id: {_eq: $me}}, order_by: {created_at: desc}) { ${BOOKING} } }`,
      { me: meId() }
    );
    return ok({ bookings: d.marketplace_bookings_detail, count: d.marketplace_bookings_detail.length });
  },

  getVendorBookings: async () => {
    const d = await gql(
      `query($me: Int!) { marketplace_bookings_detail(where: {listing_owner_id: {_eq: $me}}, order_by: {created_at: desc}) { ${BOOKING} booker_name booker_email } }`,
      { me: meId() }
    );
    return ok({ bookings: d.marketplace_bookings_detail, count: d.marketplace_bookings_detail.length });
  },

  updateStatus: async (id, status) => {
    const d = await gql(
      `mutation($id: Int!, $status: String!) { update_booking_status(args: {p_booking_id: $id, p_status: $status}) { id status } }`,
      { id: Number(id), status }
    );
    return ok({ message: `Booking ${status}`, booking: d.update_booking_status[0] });
  },

  cancel: async (id) => {
    await gql(`mutation($id: Int!) { cancel_booking(args: {p_booking_id: $id}) { id } }`, { id: Number(id) });
    return ok({ message: 'Booking cancelled' });
  },
};

// ---------- Travel packages ----------
const PACKAGE = `id provider_id title description destination destination_latitude destination_longitude duration_days price
  max_travelers includes itinerary image_url available_from available_to departure_dates category is_active rating
  total_bookings created_at provider_name provider_verified provider_rating provider_location provider_phone
  provider_email provider_website`;
const PACKAGE_INPUT = ['title', 'description', 'destination', 'destination_latitude', 'destination_longitude', 'duration_days',
  'price', 'max_travelers', 'includes', 'itinerary', 'available_from', 'available_to', 'departure_dates', 'category', 'image_url'];
const PACKAGE_BOOKING = `id package_id user_id travelers travel_date total_price status notes created_at package_title
  destination duration_days unit_price provider_name`;
const PROVIDER = 'id user_id company_name description logo_url contact_phone contact_email website latitude longitude location_name is_verified rating';

const packageInput = (data) => pick(
  { ...data, price: data.price !== undefined && data.price !== '' ? parseFloat(data.price) : undefined,
    includes: asJson(data.includes), itinerary: asJson(data.itinerary), departure_dates: asJson(data.departure_dates) },
  PACKAGE_INPUT
);

export const packagesAPI = {
  getAll: async (params = {}) => {
    const located = params.lat != null && params.lng != null;
    const d = await gql(
      `query($category: String, $date: date, $lat: float8, $lng: float8, $radius: Int) {
        search_packages(args: {p_category: $category, p_travel_date: $date, p_lat: $lat, p_lng: $lng, p_radius: $radius}) { ${PACKAGE} } }`,
      { category: params.category || null, date: params.travel_date || null, lat: located ? params.lat : null,
        lng: located ? params.lng : null, radius: located ? params.radius ?? 50000 : null }
    );
    return ok({ packages: d.search_packages, count: d.search_packages.length });
  },

  getById: async (id) => {
    const d = await gql(`query($id: Int!) { travel_packages_detail(where: {id: {_eq: $id}}) { ${PACKAGE} } }`, { id: Number(id) });
    if (!d.travel_packages_detail.length) throw fail('Package not found', 404);
    return ok({ package: d.travel_packages_detail[0] });
  },

  create: async (data) => {
    const provider = await gql(`mutation { get_or_create_provider { id } }`);
    const today = new Date();
    const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    const object = {
      duration_days: 1,
      available_from: today.toISOString().slice(0, 10),
      available_to: nextYear.toISOString().slice(0, 10),
      ...packageInput(data),
      provider_id: provider.get_or_create_provider[0].id,
    };
    const d = await gql(
      `mutation($object: travel_packages_insert_input!) { insert_travel_packages_one(object: $object) { id title destination price category } }`,
      { object },
      { denied: 'Provider profile not found' }
    );
    return ok({ message: 'Package created', package: d.insert_travel_packages_one });
  },

  update: async (id, data) => {
    const d = await gql(
      `mutation($id: Int!, $set: travel_packages_set_input!) { update_travel_packages_by_pk(pk_columns: {id: $id}, _set: $set) { id title destination price category } }`,
      { id: Number(id), set: packageInput(data) }
    );
    if (!d.update_travel_packages_by_pk) throw fail('Package not found or unauthorized', 404);
    return ok({ message: 'Package updated', package: d.update_travel_packages_by_pk });
  },

  delete: async (id) => {
    const d = await gql(`mutation($id: Int!) { delete_travel_packages_by_pk(id: $id) { id } }`, { id: Number(id) });
    if (!d.delete_travel_packages_by_pk) throw fail('Package not found or unauthorized', 404);
    return ok({ message: 'Package deleted' });
  },

  book: async (id, { travelers = 1, travel_date, notes }) => {
    const d = await gql(
      `mutation($id: Int!, $date: date!, $travelers: Int, $notes: String) {
        book_travel_package(args: {p_package_id: $id, p_travel_date: $date, p_travelers: $travelers, p_notes: $notes}) { id package_id travelers travel_date total_price status } }`,
      { id: Number(id), date: travel_date, travelers: Number(travelers), notes: notes || null }
    );
    return ok({ message: 'Booking created', booking: d.book_travel_package[0] });
  },

  getMyBookings: async () => {
    const d = await gql(
      `query($me: Int!) { travel_package_bookings_detail(where: {user_id: {_eq: $me}}, order_by: {created_at: desc}) { ${PACKAGE_BOOKING} } }`,
      { me: meId() }
    );
    return ok({ bookings: d.travel_package_bookings_detail, count: d.travel_package_bookings_detail.length });
  },

  getProviderBookings: async () => {
    const d = await gql(
      `query($me: Int!) { travel_package_bookings_detail(where: {provider_user_id: {_eq: $me}}, order_by: {travel_date: asc}) { ${PACKAGE_BOOKING} booker_name booker_email } }`,
      { me: meId() }
    );
    return ok({ bookings: d.travel_package_bookings_detail, count: d.travel_package_bookings_detail.length });
  },

  updateBookingStatus: async (id, status) => {
    const d = await gql(
      `mutation($id: Int!, $status: String!) { update_package_booking_status(args: {p_booking_id: $id, p_status: $status}) { id status } }`,
      { id: Number(id), status }
    );
    return ok({ message: `Booking ${status}`, booking: d.update_package_booking_status[0] });
  },

  getProviderProfile: async () => {
    const d = await gql(`mutation { get_or_create_provider { ${PROVIDER} } }`);
    return ok({ provider: d.get_or_create_provider[0] });
  },

  updateProviderProfile: async (data) => {
    const _set = pick(data, ['company_name', 'description', 'contact_phone', 'contact_email', 'website', 'latitude', 'longitude', 'location_name']);
    const d = await gql(
      `mutation($set: travel_providers_set_input!) { update_travel_providers(where: {}, _set: $set) { returning { ${PROVIDER} } } }`,
      { set: _set }
    );
    return ok({ provider: d.update_travel_providers.returning[0] });
  },

  getProviderPackages: async () => {
    const d = await gql(
      `query($me: Int!) { travel_packages_detail(where: {provider_user_id: {_eq: $me}}, order_by: {created_at: desc}) { ${PACKAGE} } }`,
      { me: meId() }
    );
    return ok({ packages: d.travel_packages_detail, count: d.travel_packages_detail.length });
  },
};

// ---------- Safety ----------
const CONTACT = 'id name relationship phone_number created_at';
const listContacts = async () => (await gql(`query { user_emergency_contacts(order_by: {created_at: desc}) { ${CONTACT} } }`)).user_emergency_contacts;

export const safetyAPI = {
  getAadhaarStatus: async () => {
    const d = await gql(`query { my_profile { aadhaar_status aadhaar_number_masked email_verified phone_verified } }`);
    const p = d.my_profile[0];
    return ok({ status: p.aadhaar_status, masked_number: p.aadhaar_number_masked, email_verified: p.email_verified, phone_verified: p.phone_verified });
  },

  verifyAadhaar: async (formData) => {
    const { fields, files } = splitForm(formData);
    const urls = await upload(files);
    if (!urls.aadhaar_image) throw fail('Aadhaar image is required');
    await gql(
      `mutation($num: String!, $name: String!, $aadhaar: String, $photo: String) {
        submit_aadhaar(args: {p_aadhaar_number: $num, p_aadhaar_name: $name, p_aadhaar_url: $aadhaar, p_photo_url: $photo}) { id } }`,
      { num: fields.aadhaar_number, name: fields.aadhaar_name || '', aadhaar: urls.aadhaar_image[0], photo: urls.profile_photo?.[0] || null }
    );
    return ok({ message: 'Verification submitted successfully! Our team will verify it in 24h.' });
  },

  getContacts: async () => ok({ contacts: await listContacts() }),

  addContact: async ({ name, relationship, phone }) => {
    await gql(
      `mutation($object: user_emergency_contacts_insert_input!) { insert_user_emergency_contacts_one(object: $object) { id } }`,
      { object: { name, relationship, phone_number: phone } }
    );
    return ok({ message: 'Contact added successfully', contacts: await listContacts() });
  },

  deleteContact: async (id) => {
    await gql(`mutation($id: Int!) { delete_user_emergency_contacts_by_pk(id: $id) { id } }`, { id: Number(id) });
    return ok({ message: 'Contact deleted successfully', contacts: await listContacts() });
  },

  getSOSHistory: async () => {
    const d = await gql(`query { user_sos_alerts(order_by: {created_at: desc}) { id latitude longitude message status created_at } }`);
    return ok({ history: d.user_sos_alerts });
  },

  triggerSOS: async ({ latitude, longitude, message }) => {
    const d = await gql(
      `mutation($lat: Float!, $lng: Float!, $message: String) { triggerSos(latitude: $lat, longitude: $lng, message: $message) { message } }`,
      { lat: Number(latitude), lng: Number(longitude), message: message || null }
    );
    return ok({ success: true, message: d.triggerSos.message });
  },

  sendOTP: async ({ phone }) => {
    const d = await gql(`mutation($phone: String!) { sendPhoneOtp(phone: $phone) { message } }`, { phone });
    return ok({ success: true, message: d.sendPhoneOtp.message });
  },

  verifyOTP: async ({ phone, code }) => {
    const d = await gql(`mutation($phone: String!, $code: String!) { verifyPhoneOtp(phone: $phone, code: $code) { message } }`, { phone, code });
    return ok({ success: true, message: d.verifyPhoneOtp.message });
  },

  sendEmailOTP: async () => {
    const d = await gql(`mutation { sendEmailOtp { message } }`);
    return ok({ message: d.sendEmailOtp.message });
  },

  verifyEmailOTP: async ({ code }) => {
    await gql(`mutation($code: String!) { verify_email_otp(args: {p_code: $code}) { id } }`, { code });
    return ok({ message: 'Email verified successfully!' });
  },

  addReview: async ({ user_id, rating, comment, entity_type, entity_id, entity_title }) => {
    await gql(
      `mutation($object: user_reviews_insert_input!) { insert_user_reviews_one(object: $object) { id } }`,
      { object: pick({ user_id, rating, comment, entity_type, entity_id, entity_title }, ['user_id', 'rating', 'comment', 'entity_type', 'entity_id', 'entity_title']) },
      { denied: 'Cannot review yourself' }
    );
    return ok({ message: 'Review added successfully' });
  },

  reportFraud: async ({ reported_user_id, reason, entity_type, entity_id, description }) => {
    await gql(
      `mutation($object: user_reports_insert_input!) { insert_user_reports_one(object: $object) { id } }`,
      { object: pick({ reported_user_id, reason, entity_type, entity_id, description }, ['reported_user_id', 'reason', 'entity_type', 'entity_id', 'description']) },
      { denied: 'Cannot report yourself' }
    );
    return ok({ message: 'Report submitted successfully' });
  },
};

// ---------- Waves ----------
const WAVE = `id host_id origin_latitude origin_longitude origin_name destination_latitude destination_longitude destination_name
  departure_time capacity current_travelers price_per_seat vibe_tags car_model car_number description status created_at
  host_name trust_score profile_photo`;
const WAVE_REQUEST = `id wave_id requester_id seats_requested total_price service_fee status message cancellation_reason created_at`;
const WAVE_INPUT = ['origin_name', 'origin_latitude', 'origin_longitude', 'destination_name', 'destination_latitude',
  'destination_longitude', 'departure_time', 'capacity', 'price_per_seat', 'description', 'vibe_tags', 'car_model', 'car_number'];

export const wavesAPI = {
  getAll: async ({ origin, destination, date } = {}) => {
    const where = { status: { _eq: 'active' } };
    if (origin) where.origin_name = { _ilike: `%${origin}%` };
    if (destination) where.destination_name = { _ilike: `%${destination}%` };
    if (date) {
      const start = new Date(`${date}T00:00:00`);
      where.departure_time = { _gte: start.toISOString(), _lt: new Date(start.getTime() + 86400000).toISOString() };
    }
    const d = await gql(
      `query($where: wave_feed_bool_exp!) { wave_feed(where: $where, order_by: {departure_time: asc}) { ${WAVE} } }`,
      { where }
    );
    return ok(d.wave_feed);
  },

  getById: async (id) => {
    const d = await gql(
      `query($id: Int!) {
        wave_feed(where: {id: {_eq: $id}}) { ${WAVE} bio verification_level }
        wave_host_contacts(where: {wave_id: {_eq: $id}}, limit: 1) { phone_number email }
        wave_passengers(where: {wave_id: {_eq: $id}}) { id full_name profile_photo seats_requested } }`,
      { id: Number(id) }
    );
    if (!d.wave_feed.length) throw fail('Wave not found', 404);
    return ok({ ...d.wave_feed[0], host_contact: d.wave_host_contacts[0], passengers: d.wave_passengers });
  },

  create: async (data) => {
    const d = await gql(
      `mutation($object: waves_insert_input!) { insert_waves_one(object: $object) { id host_id origin_name destination_name departure_time capacity price_per_seat car_model car_number status } }`,
      { object: pick({ ...data, vibe_tags: asJson(data.vibe_tags) }, WAVE_INPUT) },
      { denied: 'Verification required: verify your identity (Aadhaar) and phone or email to host a ride.' }
    );
    return ok(d.insert_waves_one);
  },

  join: async (id, { seats_requested }) => {
    const d = await gql(
      `mutation($id: Int!, $seats: Int!) { join_wave(args: {p_wave_id: $id, p_seats_requested: $seats}) { id wave_id status total_price } }`,
      { id: Number(id), seats: Number(seats_requested) }
    );
    return ok({ ...d.join_wave[0], message: 'Request sent to host' });
  },

  getMyWaves: async () => {
    const d = await gql(
      `query($me: Int!) {
        hosted: wave_feed(where: {host_id: {_eq: $me}}, order_by: {departure_time: desc}) { ${WAVE} pending_requests }
        requested: wave_requests_detail(where: {requester_id: {_eq: $me}}, order_by: {created_at: desc}) {
          ${WAVE_REQUEST} origin_name destination_name departure_time host_id host_name } }`,
      { me: meId() }
    );
    return ok({ hosted: d.hosted, requested: d.requested });
  },

  getRequests: async (id) => {
    const d = await gql(
      `query($id: Int!, $me: Int!) {
        wave_requests_detail(where: {wave_id: {_eq: $id}, host_id: {_eq: $me}}) { ${WAVE_REQUEST} full_name trust_score profile_photo } }`,
      { id: Number(id), me: meId() }
    );
    return ok(d.wave_requests_detail);
  },

  processRequest: async (reqId, status) => {
    await gql(
      `mutation($id: Int!, $status: String!) { process_wave_request(args: {p_request_id: $id, p_status: $status}) { id } }`,
      { id: Number(reqId), status }
    );
    return ok({ success: true, status });
  },

  deleteWave: async (id) => {
    const d = await gql(`mutation($id: Int!) { delete_waves_by_pk(id: $id) { id } }`, { id: Number(id) });
    if (!d.delete_waves_by_pk) throw fail('Unauthorized: Only host can delete', 403);
    return ok({ success: true, message: 'Wave deleted successfully' });
  },

  cancelMember: async (reqId, reason) => {
    await gql(
      `mutation($id: Int!, $reason: String!) { cancel_wave_member(args: {p_request_id: $id, p_reason: $reason}) { id } }`,
      { id: Number(reqId), reason }
    );
    return ok({ success: true, message: 'Member cancelled' });
  },
};

// ---------- Trip groups + expense splitting ----------
const GROUP = 'id name description currency created_by created_at member_count total_spent my_balance invite_code';
const EXPENSE = 'id group_id paid_by payer_name amount description category method split_type expense_date created_by created_at';

export const groupsAPI = {
  list: async () => {
    const d = await gql(`query {
      trip_groups_detail(order_by: {created_at: desc}) { ${GROUP} }
      group_members_detail { group_id user_id full_name profile_photo }
    }`);
    return ok({ groups: d.trip_groups_detail.map((g) => ({ ...g, members: d.group_members_detail.filter((m) => m.group_id === g.id) })) });
  },

  create: async ({ name, description, members }) => {
    const d = await gql(
      `mutation($name: String!, $description: String, $members: String) {
        create_trip_group(args: {p_name: $name, p_description: $description, p_members: $members}) { id } }`,
      { name, description: description || null, members: members || null }
    );
    return ok({ id: d.create_trip_group[0].id });
  },

  // Everything the group screen needs in one round trip
  get: async (id) => {
    const where = { group_id: { _eq: Number(id) } };
    const d = await gql(
      `query($id: Int!, $where: group_expenses_bool_exp!, $mwhere: group_members_detail_bool_exp!, $swhere: group_expense_splits_bool_exp!, $bwhere: group_balances_bool_exp!, $stwhere: group_settlements_bool_exp!) {
        trip_groups_detail(where: {id: {_eq: $id}}, limit: 1) { ${GROUP} }
        group_members_detail(where: $mwhere, order_by: {joined_at: asc}) { user_id role full_name username profile_photo upi_id }
        group_expenses(where: $where, order_by: [{expense_date: desc}, {id: desc}]) { ${EXPENSE} }
        group_expense_splits(where: $swhere) { expense_id user_id full_name amount }
        group_balances(where: $bwhere) { user_id full_name paid share sent received }
        group_settlements(where: $stwhere, order_by: {created_at: desc}) { id from_user from_name to_user to_name amount method note created_at }
      }`,
      { id: Number(id), where, mwhere: where, swhere: where, bwhere: where, stwhere: where }
    );
    if (!d.trip_groups_detail.length) throw fail('Group not found', 404);
    const splits = d.group_expense_splits;
    return ok({
      group: d.trip_groups_detail[0],
      members: d.group_members_detail,
      expenses: d.group_expenses.map((e) => ({ ...e, splits: splits.filter((s) => s.expense_id === e.id) })),
      balances: d.group_balances.map((b) => ({ ...b, balance: b.paid - b.share + b.sent - b.received })),
      settlements: d.group_settlements,
    });
  },

  // Invite links: /join/<code>. Only the creator receives invite_code from get().
  invitePreview: async (code) => {
    const d = await gql(
      `mutation($code: String!) { groupInvitePreview(code: $code) { group_id name description creator_name member_count already_member } }`,
      { code }
    );
    return ok(d.groupInvitePreview);
  },

  joinByCode: async (code) => {
    await gql(`mutation($code: String!) { join_group_by_code(args: {p_code: $code}) { group_id } }`, { code });
    return ok({});
  },

  regenerateInvite: async (groupId) => {
    await gql(`mutation($id: Int!) { regenerate_group_invite(args: {p_group_id: $id}) { id } }`, { id: Number(groupId) });
    return ok({});
  },

  addMember: async (groupId, username) => {
    await gql(
      `mutation($id: Int!, $u: String!) { add_group_member(args: {p_group_id: $id, p_username: $u}) { user_id } }`,
      { id: Number(groupId), u: username }
    );
    return ok({});
  },

  // split_type 'equal': splits = [{user_id}] (omit for everyone); 'exact': splits = [{user_id, amount}]
  addExpense: async ({ group_id, amount, description, category, method, paid_by, expense_date, split_type, splits }) => {
    const d = await gql(
      `mutation($g: Int!, $amount: numeric!, $desc: String!, $cat: String, $method: String, $payer: Int, $date: date, $type: String, $splits: jsonb) {
        add_expense(args: {p_group_id: $g, p_amount: $amount, p_description: $desc, p_category: $cat, p_method: $method, p_paid_by: $payer, p_expense_date: $date, p_split_type: $type, p_splits: $splits}) { id } }`,
      { g: Number(group_id), amount, desc: description, cat: category, method, payer: paid_by ?? null, date: expense_date || null, type: split_type, splits: splits || null }
    );
    return ok({ id: d.add_expense[0].id });
  },

  deleteExpense: async (id) => {
    await gql(`mutation($id: Int!) { delete_expense(args: {p_expense_id: $id}) { id } }`, { id: Number(id) });
    return ok({});
  },

  // A payment between two members (either side can record it)
  settle: async ({ group_id, to_user, from_user, amount, method, note }) => {
    await gql(
      `mutation($g: Int!, $to: Int!, $from: Int, $amount: numeric!, $method: String, $note: String) {
        record_settlement(args: {p_group_id: $g, p_to_user: $to, p_from_user: $from, p_amount: $amount, p_method: $method, p_note: $note}) { id } }`,
      { g: Number(group_id), to: to_user, from: from_user ?? null, amount, method: method || 'cash', note: note || null }
    );
    return ok({});
  },
};

// ---------- Group chat (GraphQL subscription = live) ----------
let wsClient;
const subscriptions = () => {
  if (!wsClient) {
    const base = API_URL || `${window.location.protocol}//${window.location.host}`;
    wsClient = createClient({
      url: `${base.replace(/^http/, 'ws')}/v1/graphql`,
      connectionParams: () => ({ headers: authHeaders() }),
    });
  }
  return wsClient;
};

export const chatAPI = {
  // Opens (creating if needed) the chat for an activity/wave; rejects if the user isn't a confirmed member
  open: async (type, id) => {
    const d = await gql(
      `mutation($type: String!, $id: Int!) { get_or_create_group_chat(args: {p_type: $type, p_reference_id: $id}) { id } }`,
      { type, id: Number(id) }
    );
    return d.get_or_create_group_chat[0].id;
  },

  send: (chatId, text) => gql(
    `mutation($object: group_messages_insert_input!) { insert_group_messages_one(object: $object) { id } }`,
    { object: { group_chat_id: chatId, message: text } }
  ),

  // Calls onMessages with the full (ordered) history now and after every change. Returns unsubscribe.
  subscribe: (chatId, onMessages, onError) => subscriptions().subscribe(
    {
      query: `subscription($id: Int!) {
        group_messages(where: {group_chat_id: {_eq: $id}}, order_by: {created_at: asc}, limit: 200) {
          id sender_id message kind meta created_at sender { full_name profile_photo } } }`,
      variables: { id: chatId },
    },
    {
      next: ({ data }) => onMessages(data.group_messages.map(({ message, sender, ...m }) => ({
        ...m, content: message, sender_name: sender?.full_name, sender_photo: sender?.profile_photo,
      }))),
      error: (e) => onError && onError(e),
      complete: () => {},
    }
  ),
};

export default api;
