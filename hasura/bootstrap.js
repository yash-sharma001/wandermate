// Builds the full Hasura metadata (tracked tables/views/functions, relationships, permissions,
// actions, event triggers) and applies it with replace_metadata. Idempotent: safe to re-run.
const HASURA = process.env.HASURA_URL || 'http://hasura:8080';
const SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET;
const API_URL = process.env.API_URL || 'http://api:5000';
const AI_URL = process.env.AI_URL || 'http://ai:8000';

const X = 'X-Hasura-User-Id';
const ME = { _eq: X };
const T = (name) => ({ schema: 'public', name });

// --- reusable permission fragments ---
const verifiedHost = {
  host: { aadhaar_status: { _eq: 'verified' }, _or: [{ phone_verified: { _eq: 1 } }, { email_verified: { _eq: 1 } }] },
};
const chatMember = {
  _or: [
    { activity: { host_id: ME } },
    { activity: { rsvps: { user_id: ME, status: { _eq: 'confirmed' } } } },
    { wave: { host_id: ME } },
    { wave: { requests: { requester_id: ME, status: { _eq: 'approved' } } } },
    { trip_group: { members: { user_id: ME } } },
  ],
};

// --- builders ---
const sel = (filter = {}, columns = '*') => ({ role: 'user', permission: { columns, filter } });
const objRel = (name, column) => ({ name, using: { foreign_key_constraint_on: column } });
const arrRel = (name, table, column) => ({ name, using: { foreign_key_constraint_on: { table: T(table), column } } });

// Keeps the AI service's embeddings (pgvector, used for itinerary retrieval) in step with these tables
const embedTrigger = (name, updateColumns) => ({
  name,
  definition: { enable_manual: false, insert: { columns: '*' }, update: { columns: updateColumns }, delete: { columns: '*' } },
  retry_conf: { num_retries: 5, interval_sec: 10, timeout_sec: 60 },
  webhook: `${AI_URL}/events/embed`,
});

const tables = [];
const table = (name, cfg = {}) => tables.push({ table: T(name), ...cfg });

// Users: public columns for everyone; the owner may edit a whitelist of profile fields
table('users', {
  select_permissions: [sel({}, [
    'id', 'full_name', 'username', 'gender', 'profile_photo', 'bio', 'home_location', 'languages', 'interests',
    'trust_score', 'verification_level', 'is_verified', 'aadhaar_status', 'phone_verified', 'email_verified', 'created_at',
  ])],
  update_permissions: [{ role: 'user', permission: {
    columns: ['full_name', 'email', 'phone_number', 'upi_id', 'bio', 'profile_photo', 'home_location', 'languages', 'interests'],
    filter: { id: ME } } }],
});
table('user_profiles', { select_permissions: [sel()] });
table('my_profile', { select_permissions: [sel({ id: ME })] });

// Activities
table('activities', {
  object_relationships: [objRel('host', 'host_id')],
  array_relationships: [arrRel('rsvps', 'activity_rsvps', 'activity_id')],
  // explicit columns: the generated `geog` column is for the geo index only, not the API
  select_permissions: [sel({ is_active: { _eq: 1 } }, ['id', 'host_id', 'title', 'description', 'activity_type', 'latitude', 'longitude',
    'location_name', 'start_time', 'end_time', 'capacity', 'current_attendees', 'gender_filter', 'min_age', 'max_age', 'is_active', 'created_at', 'updated_at'])],
  insert_permissions: [{ role: 'user', permission: {
    check: { _and: [{ host_id: ME }, verifiedHost] }, set: { host_id: X },
    columns: ['title', 'description', 'activity_type', 'latitude', 'longitude', 'location_name', 'start_time', 'end_time', 'capacity', 'gender_filter', 'min_age', 'max_age'] } }],
  delete_permissions: [{ role: 'user', permission: { filter: { host_id: ME } } }],
  event_triggers: [embedTrigger('activity_embed', ['title', 'description', 'activity_type', 'location_name'])],
});
table('activity_rsvps', {
  object_relationships: [objRel('activity', 'activity_id'), objRel('user', 'user_id')],
  select_permissions: [sel({ user_id: ME })],
});
table('activity_details', { select_permissions: [sel()] });
table('activity_attendees', { select_permissions: [sel()] });
table('activity_host_contacts', { select_permissions: [sel({ viewer_id: ME })] });

// Private journal pins
table('private_pins', {
  select_permissions: [sel({ user_id: ME })],
  insert_permissions: [{ role: 'user', permission: {
    check: { user_id: ME }, set: { user_id: X },
    columns: ['latitude', 'longitude', 'location_name', 'title', 'note', 'photos', 'voice_note_url', 'mood_emoji', 'visit_date'] } }],
  update_permissions: [{ role: 'user', permission: {
    columns: ['location_name', 'title', 'note', 'photos', 'voice_note_url', 'mood_emoji'], filter: { user_id: ME } } }],
  delete_permissions: [{ role: 'user', permission: { filter: { user_id: ME } } }],
});
table('recommendations', { select_permissions: [sel({ is_verified: { _eq: 1 } })] });

// Marketplace
const listingCols = ['title', 'description', 'category', 'price', 'latitude', 'longitude', 'location_name', 'vendor_name', 'duration', 'contact_phone', 'contact_email', 'image_url'];
table('marketplace_vendors', { select_permissions: [sel()] });
table('marketplace_listings', {
  object_relationships: [objRel('vendor', 'vendor_id')],
  select_permissions: [sel({ _or: [{ is_active: { _eq: 1 } }, { created_by: ME }] })],
  insert_permissions: [{ role: 'user', permission: { check: { created_by: ME }, set: { created_by: X }, columns: listingCols } }],
  update_permissions: [{ role: 'user', permission: { columns: [...listingCols, 'is_active'], filter: { created_by: ME } } }],
  delete_permissions: [{ role: 'user', permission: { filter: { created_by: ME } } }],
});
table('marketplace_bookings', {
  object_relationships: [objRel('listing', 'listing_id')],
  select_permissions: [sel({ _or: [{ user_id: ME }, { listing: { created_by: ME } }] })],
});
table('marketplace_bookings_detail', { select_permissions: [sel({ _or: [{ user_id: ME }, { listing_owner_id: ME }] })] });

// Travel packages
const pkgCols = ['title', 'description', 'destination', 'destination_latitude', 'destination_longitude', 'duration_days', 'price', 'max_travelers', 'includes', 'itinerary', 'available_from', 'available_to', 'departure_dates', 'category', 'image_url'];
const ownPackage = { provider: { user_id: ME } };
table('travel_providers', {
  select_permissions: [sel()],
  update_permissions: [{ role: 'user', permission: {
    columns: ['company_name', 'description', 'contact_phone', 'contact_email', 'website', 'latitude', 'longitude', 'location_name'],
    filter: { user_id: ME } } }],
});
table('travel_packages', {
  object_relationships: [objRel('provider', 'provider_id')],
  select_permissions: [sel({ _or: [{ is_active: { _eq: 1 } }, ownPackage] })],
  insert_permissions: [{ role: 'user', permission: { check: ownPackage, columns: ['provider_id', ...pkgCols] } }],
  update_permissions: [{ role: 'user', permission: { columns: [...pkgCols, 'is_active'], filter: ownPackage } }],
  delete_permissions: [{ role: 'user', permission: { filter: ownPackage } }],
  event_triggers: [embedTrigger('package_embed', ['title', 'description', 'destination', 'category', 'duration_days'])],
});
table('travel_packages_detail', {
  select_permissions: [sel({ _or: [{ is_active: { _eq: 1 } }, { provider_user_id: ME }] })],
});
table('travel_package_bookings', {
  object_relationships: [objRel('package', 'package_id')],
  select_permissions: [sel({ _or: [{ user_id: ME }, { package: ownPackage }] })],
});
table('travel_package_bookings_detail', { select_permissions: [sel({ _or: [{ user_id: ME }, { provider_user_id: ME }] })] });

// Waves (ride sharing)
table('waves', {
  object_relationships: [objRel('host', 'host_id')],
  array_relationships: [arrRel('requests', 'wave_requests', 'wave_id')],
  select_permissions: [sel({ _or: [{ status: { _eq: 'active' } }, { host_id: ME }] })],
  insert_permissions: [{ role: 'user', permission: {
    check: { _and: [{ host_id: ME }, verifiedHost] }, set: { host_id: X },
    columns: ['origin_name', 'origin_latitude', 'origin_longitude', 'destination_name', 'destination_latitude', 'destination_longitude', 'departure_time', 'capacity', 'price_per_seat', 'description', 'vibe_tags', 'car_model', 'car_number'] } }],
  delete_permissions: [{ role: 'user', permission: { filter: { host_id: ME } } }],
});
table('wave_requests', {
  object_relationships: [objRel('wave', 'wave_id'), objRel('requester', 'requester_id')],
  select_permissions: [sel({ _or: [{ requester_id: ME }, { wave: { host_id: ME } }] })],
  // RabbitMQ: notify the host by email whenever someone asks to join
  event_triggers: [{
    name: 'wave_request_created',
    definition: { enable_manual: false, insert: { columns: '*' } },
    retry_conf: { num_retries: 3, interval_sec: 10, timeout_sec: 60 },
    webhook: `${API_URL}/events/wave-request`,
  }],
});
table('wave_feed', { select_permissions: [sel({ _or: [{ status: { _eq: 'active' } }, { host_id: ME }] })] });
table('wave_requests_detail', { select_permissions: [sel({ _or: [{ requester_id: ME }, { host_id: ME }] })] });
table('wave_passengers', { select_permissions: [sel()] });
table('wave_host_contacts', { select_permissions: [sel({ viewer_id: ME })] });

// Group chat (live via GraphQL subscriptions)
table('group_chats', {
  object_relationships: [objRel('activity', 'activity_id'), objRel('wave', 'wave_id'), objRel('trip_group', 'trip_group_id')],
  array_relationships: [arrRel('messages', 'group_messages', 'group_chat_id')],
  select_permissions: [sel(chatMember)],
});
table('group_messages', {
  object_relationships: [objRel('sender', 'sender_id'), objRel('group_chat', 'group_chat_id')],
  select_permissions: [sel({ group_chat: chatMember })],
  insert_permissions: [{ role: 'user', permission: {
    check: { _and: [{ sender_id: ME }, { group_chat: chatMember }] }, set: { sender_id: X }, columns: ['group_chat_id', 'message'] } }],
});


// Trip groups + expense splitting. Group data is visible to members only (views filter on viewer_id).
const inGroup = { group: { members: { user_id: ME } } };
table('trip_groups', {
  array_relationships: [arrRel('members', 'trip_group_members', 'group_id')],
  // invite_code deliberately not selectable here; the creator gets it through trip_groups_detail
  select_permissions: [sel({ _or: [{ created_by: ME }, { members: { user_id: ME } }] }, ['id', 'name', 'description', 'currency', 'created_by', 'created_at'])],
  update_permissions: [{ role: 'user', permission: { columns: ['name', 'description'], filter: { created_by: ME } } }],
  delete_permissions: [{ role: 'user', permission: { filter: { created_by: ME } } }],
});
table('trip_group_members', { object_relationships: [objRel('group', 'group_id')], select_permissions: [sel({ user_id: ME })] });
table('expenses', { object_relationships: [objRel('group', 'group_id')], select_permissions: [sel(inGroup)] });
table('settlements', { object_relationships: [objRel('group', 'group_id')], select_permissions: [sel(inGroup)] });
['trip_groups_detail', 'group_members_detail', 'group_expenses', 'group_expense_splits', 'group_settlements', 'group_balances']
  .forEach((v) => table(v, { select_permissions: [sel({ viewer_id: ME })] }));

// Safety
table('user_emergency_contacts', {
  select_permissions: [sel({ user_id: ME })],
  insert_permissions: [{ role: 'user', permission: { check: { user_id: ME }, set: { user_id: X }, columns: ['name', 'relationship', 'phone_number'] } }],
  delete_permissions: [{ role: 'user', permission: { filter: { user_id: ME } } }],
});
table('user_sos_alerts', { select_permissions: [sel({ user_id: ME })] });
table('user_reviews', {
  select_permissions: [sel({ _or: [{ user_id: ME }, { reviewer_id: ME }] })],
  insert_permissions: [{ role: 'user', permission: {
    check: { _and: [{ reviewer_id: ME }, { user_id: { _neq: X } }] }, set: { reviewer_id: X },
    columns: ['user_id', 'entity_type', 'entity_id', 'entity_title', 'rating', 'comment'] } }],
});
table('user_reports', {
  select_permissions: [sel({ reporter_id: ME })],
  insert_permissions: [{ role: 'user', permission: {
    check: { _and: [{ reporter_id: ME }, { reported_user_id: { _neq: X } }] }, set: { reporter_id: X },
    columns: ['reported_user_id', 'entity_type', 'entity_id', 'reason', 'description'] } }],
});

// --- SQL functions exposed as queries (STABLE) / mutations (VOLATILE) ---
const withSession = ['my_pins', 'rsvp_activity', 'cancel_rsvp', 'create_booking', 'update_booking_status', 'cancel_booking',
  'get_or_create_provider', 'book_travel_package', 'update_package_booking_status', 'join_wave', 'process_wave_request',
  'cancel_wave_member', 'create_trip_group', 'add_group_member', 'join_group_by_code', 'regenerate_group_invite', 'add_expense', 'delete_expense', 'record_settlement', 'get_or_create_group_chat', 'submit_aadhaar'];
const plain = ['nearby_activities', 'nearby_recommendations', 'search_listings', 'search_packages'];
const functions = [
  ...withSession.map((name) => ({ function: T(name), configuration: { session_argument: 'hasura_session' }, permissions: [{ role: 'user' }] })),
  ...plain.map((name) => ({ function: T(name), permissions: [{ role: 'user' }] })),
];

// --- Actions: things that need the outside world (email, SMS) ---
const actions = [
  { name: 'sendEmailOtp', args: [], out: 'MessageOutput' },
  { name: 'verifyEmailOtp', args: [{ name: 'code', type: 'String!' }], out: 'MessageOutput' },
  { name: 'sendPhoneOtp', args: [{ name: 'phone', type: 'String!' }], out: 'MessageOutput' },
  { name: 'verifyPhoneOtp', args: [{ name: 'phone', type: 'String!' }, { name: 'code', type: 'String!' }], out: 'MessageOutput' },
  { name: 'groupInvitePreview', args: [{ name: 'code', type: 'String!' }], out: 'GroupInvite' },
  { name: 'triggerSos', args: [{ name: 'latitude', type: 'Float!' }, { name: 'longitude', type: 'Float!' }, { name: 'message', type: 'String' }], out: 'MessageOutput' },
].map((a) => ({
  name: a.name,
  definition: { kind: 'synchronous', type: 'mutation', handler: `${API_URL}/actions`, arguments: a.args, output_type: a.out, forward_client_headers: false },
  permissions: [{ role: 'user' }],
}));

const metadata = {
  version: 3,
  sources: [{
    name: 'default',
    kind: 'postgres',
    tables,
    functions,
    configuration: { connection_info: { database_url: { from_env: 'HASURA_GRAPHQL_DATABASE_URL' } } },
  }],
  actions,
  custom_types: {
    objects: [
      { name: 'MessageOutput', fields: [{ name: 'message', type: 'String!' }] },
      {
        name: 'GroupInvite',
        fields: [
          { name: 'group_id', type: 'Int!' }, { name: 'name', type: 'String!' }, { name: 'description', type: 'String' },
          { name: 'creator_name', type: 'String!' }, { name: 'member_count', type: 'Int!' }, { name: 'already_member', type: 'Boolean!' },
        ],
      },
    ],
  },
};

const post = (path, body) => fetch(`${HASURA}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Hasura-Admin-Secret': SECRET },
  body: JSON.stringify(body),
});

(async () => {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${HASURA}/healthz`)).ok) break; } catch (e) {}
    if (i > 60) throw new Error('Hasura never became healthy');
    await new Promise((r) => setTimeout(r, 2000));
  }
  const res = await post('/v1/metadata', { type: 'replace_metadata', version: 2, args: { allow_inconsistent_metadata: false, metadata } });
  const out = await res.json();
  if (!res.ok) {
    console.error('Hasura metadata rejected:', JSON.stringify(out, null, 2));
    process.exit(1);
  }
  console.log(`Hasura metadata applied: ${tables.length} tables/views, ${functions.length} functions, ${actions.length} actions`);
})().catch((e) => { console.error(e); process.exit(1); });
