-- Trip groups + expense splitting. Views carry a viewer_id (one row per group member) so Hasura can
-- filter "only members of the group" with a plain viewer_id = X-Hasura-User-Id rule.

-- =============================================
-- VIEWS
-- =============================================

CREATE VIEW group_members_detail AS
SELECT m.group_id, m.user_id, m.role, m.joined_at, u.full_name, u.username, u.profile_photo, u.upi_id,
       v.user_id AS viewer_id
FROM trip_group_members m
JOIN users u ON u.id = m.user_id
JOIN trip_group_members v ON v.group_id = m.group_id;

CREATE VIEW group_expenses AS
SELECT e.*, u.full_name AS payer_name, v.user_id AS viewer_id
FROM expenses e
JOIN users u ON u.id = e.paid_by
JOIN trip_group_members v ON v.group_id = e.group_id;

CREATE VIEW group_expense_splits AS
SELECT s.expense_id, e.group_id, s.user_id, u.full_name, s.amount, v.user_id AS viewer_id
FROM expense_splits s
JOIN expenses e ON e.id = s.expense_id
JOIN users u ON u.id = s.user_id
JOIN trip_group_members v ON v.group_id = e.group_id;

CREATE VIEW group_settlements AS
SELECT s.*, f.full_name AS from_name, t.full_name AS to_name, v.user_id AS viewer_id
FROM settlements s
JOIN users f ON f.id = s.from_user
JOIN users t ON t.id = s.to_user
JOIN trip_group_members v ON v.group_id = s.group_id;

-- balance = paid - share + sent - received  (positive: the group owes this person)
CREATE VIEW group_balances AS
SELECT m.group_id, m.user_id, u.full_name, v.user_id AS viewer_id,
  coalesce((SELECT sum(amount) FROM expenses WHERE group_id = m.group_id AND paid_by = m.user_id), 0) AS paid,
  coalesce((SELECT sum(s.amount) FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
            WHERE e.group_id = m.group_id AND s.user_id = m.user_id), 0) AS share,
  coalesce((SELECT sum(amount) FROM settlements WHERE group_id = m.group_id AND from_user = m.user_id), 0) AS sent,
  coalesce((SELECT sum(amount) FROM settlements WHERE group_id = m.group_id AND to_user = m.user_id), 0) AS received
FROM trip_group_members m
JOIN users u ON u.id = m.user_id
JOIN trip_group_members v ON v.group_id = m.group_id;

-- invite_code is only filled in for the group's creator
CREATE VIEW trip_groups_detail AS
SELECT g.id, g.name, g.description, g.currency, g.created_by, g.created_at, v.user_id AS viewer_id,
  CASE WHEN g.created_by = v.user_id THEN g.invite_code END AS invite_code,
  (SELECT count(*) FROM trip_group_members WHERE group_id = g.id)::int AS member_count,
  coalesce((SELECT sum(amount) FROM expenses WHERE group_id = g.id), 0) AS total_spent,
  coalesce(b.paid - b.share + b.sent - b.received, 0) AS my_balance
FROM trip_groups g
JOIN trip_group_members v ON v.group_id = g.id
LEFT JOIN group_balances b ON b.group_id = g.id AND b.user_id = v.user_id AND b.viewer_id = v.user_id;

-- =============================================
-- FUNCTIONS (mutations)
-- =============================================

CREATE FUNCTION is_group_member(p_group int, p_user int) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM trip_group_members WHERE group_id = p_group AND user_id = p_user)
$$;

-- p_members: comma separated usernames to add alongside the creator
CREATE FUNCTION create_trip_group(p_name text, p_description text DEFAULT NULL, p_members text DEFAULT NULL, hasura_session json DEFAULT NULL)
RETURNS SETOF trip_groups LANGUAGE plpgsql AS $$
DECLARE v_uid int := uid(hasura_session); g trip_groups%ROWTYPE;
BEGIN
  INSERT INTO trip_groups (name, description, created_by) VALUES (trim(p_name), nullif(trim(p_description), ''), v_uid) RETURNING * INTO g;
  INSERT INTO trip_group_members (group_id, user_id, role) VALUES (g.id, v_uid, 'admin');
  IF nullif(trim(p_members), '') IS NOT NULL THEN
    INSERT INTO trip_group_members (group_id, user_id)
    SELECT g.id, u.id FROM users u
    WHERE lower(u.username) IN (SELECT lower(regexp_replace(trim(x), '^@', '')) FROM unnest(string_to_array(p_members, ',')) x)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN QUERY SELECT * FROM trip_groups WHERE id = g.id;
END $$;

CREATE FUNCTION add_group_member(p_group_id int, p_username text, hasura_session json DEFAULT NULL)
RETURNS SETOF trip_group_members LANGUAGE plpgsql AS $$
DECLARE v_target int;
BEGIN
  IF NOT is_group_member(p_group_id, uid(hasura_session)) THEN
    RAISE EXCEPTION 'Only group members can add people' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id INTO v_target FROM users WHERE lower(username) = lower(regexp_replace(trim(p_username), '^@', ''));
  IF v_target IS NULL THEN RAISE EXCEPTION 'No traveler with that username' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO trip_group_members (group_id, user_id) VALUES (p_group_id, v_target) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT * FROM trip_group_members WHERE group_id = p_group_id AND user_id = v_target;
END $$;

-- p_splits: [{"user_id": 3}, ...] for equal splits (omit for everyone) or [{"user_id": 3, "amount": 250}, ...] for exact splits
CREATE FUNCTION add_expense(p_group_id int, p_amount numeric, p_description text, p_category text DEFAULT 'Other', p_method text DEFAULT 'cash',
                            p_paid_by int DEFAULT NULL, p_expense_date date DEFAULT NULL, p_split_type text DEFAULT 'equal',
                            p_splits jsonb DEFAULT NULL, hasura_session json DEFAULT NULL)
RETURNS SETOF expenses LANGUAGE plpgsql AS $$
DECLARE
  v_uid int := uid(hasura_session);
  v_payer int := coalesce(p_paid_by, uid(hasura_session));
  v_id int; v_ids int[]; v_n int; v_base numeric; v_rem numeric; i int; e jsonb; v_sum numeric := 0;
BEGIN
  IF NOT is_group_member(p_group_id, v_uid) THEN RAISE EXCEPTION 'Only group members can add expenses' USING ERRCODE = 'check_violation'; END IF;
  IF NOT is_group_member(p_group_id, v_payer) THEN RAISE EXCEPTION 'The payer must be in the group' USING ERRCODE = 'check_violation'; END IF;
  IF coalesce(trim(p_description), '') = '' THEN RAISE EXCEPTION 'Add a short description' USING ERRCODE = 'check_violation'; END IF;

  INSERT INTO expenses (group_id, paid_by, amount, description, category, method, split_type, expense_date, created_by)
  VALUES (p_group_id, v_payer, p_amount, trim(p_description), coalesce(p_category, 'Other'), coalesce(p_method, 'cash'),
          coalesce(p_split_type, 'equal'), coalesce(p_expense_date, CURRENT_DATE), v_uid)
  RETURNING id INTO v_id;

  IF coalesce(p_split_type, 'equal') = 'exact' THEN
    FOR e IN SELECT * FROM jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) LOOP
      IF NOT is_group_member(p_group_id, (e ->> 'user_id')::int) THEN RAISE EXCEPTION 'Everyone in the split must be in the group' USING ERRCODE = 'check_violation'; END IF;
      INSERT INTO expense_splits (expense_id, user_id, amount) VALUES (v_id, (e ->> 'user_id')::int, (e ->> 'amount')::numeric);
      v_sum := v_sum + (e ->> 'amount')::numeric;
    END LOOP;
    IF abs(v_sum - p_amount) > 0.01 THEN
      RAISE EXCEPTION 'The split adds up to %, but the expense is %', v_sum, p_amount USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT array_agg(DISTINCT (x ->> 'user_id')::int) INTO v_ids FROM jsonb_array_elements(coalesce(p_splits, '[]'::jsonb)) x;
    IF v_ids IS NULL THEN SELECT array_agg(user_id) INTO v_ids FROM trip_group_members WHERE group_id = p_group_id; END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_ids) u WHERE NOT is_group_member(p_group_id, u)) THEN
      RAISE EXCEPTION 'Everyone in the split must be in the group' USING ERRCODE = 'check_violation';
    END IF;
    v_n := array_length(v_ids, 1);
    v_base := trunc(p_amount / v_n, 2);
    v_rem := p_amount - v_base * v_n; -- paise left over go to the first person so the split always adds up
    FOR i IN 1..v_n LOOP
      INSERT INTO expense_splits (expense_id, user_id, amount) VALUES (v_id, v_ids[i], v_base + CASE WHEN i = 1 THEN v_rem ELSE 0 END);
    END LOOP;
  END IF;
  RETURN QUERY SELECT * FROM expenses WHERE id = v_id;
END $$;

CREATE FUNCTION delete_expense(p_expense_id int, hasura_session json DEFAULT NULL)
RETURNS SETOF expenses LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY WITH d AS (
    DELETE FROM expenses WHERE id = p_expense_id AND (created_by = uid(hasura_session) OR paid_by = uid(hasura_session)) RETURNING *
  ) SELECT * FROM d;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the person who added or paid this can delete it' USING ERRCODE = 'check_violation'; END IF;
END $$;

-- A payment between members. The caller must be the payer or the receiver (so "B handed me cash" can be logged by either side).
CREATE FUNCTION record_settlement(p_group_id int, p_to_user int, p_amount numeric, p_method text DEFAULT 'cash', p_note text DEFAULT NULL,
                                  p_from_user int DEFAULT NULL, hasura_session json DEFAULT NULL)
RETURNS SETOF settlements LANGUAGE plpgsql AS $$
DECLARE v_uid int := uid(hasura_session); v_from int := coalesce(p_from_user, uid(hasura_session));
BEGIN
  IF v_uid NOT IN (v_from, p_to_user) THEN RAISE EXCEPTION 'You can only record payments you made or received' USING ERRCODE = 'check_violation'; END IF;
  IF NOT (is_group_member(p_group_id, v_from) AND is_group_member(p_group_id, p_to_user)) THEN
    RAISE EXCEPTION 'Both people must be in the group' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY WITH i AS (
    INSERT INTO settlements (group_id, from_user, to_user, amount, method, note)
    VALUES (p_group_id, v_from, p_to_user, p_amount, coalesce(p_method, 'cash'), nullif(trim(p_note), '')) RETURNING *
  ) SELECT * FROM i;
END $$;

-- Join through an invite link. The code itself is the credential.
CREATE FUNCTION join_group_by_code(p_code text, hasura_session json DEFAULT NULL)
RETURNS SETOF trip_group_members LANGUAGE plpgsql AS $$
DECLARE v_group int; v_uid int := uid(hasura_session);
BEGIN
  SELECT id INTO v_group FROM trip_groups WHERE invite_code = trim(p_code);
  IF v_group IS NULL THEN RAISE EXCEPTION 'This invite link is no longer valid' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO trip_group_members (group_id, user_id) VALUES (v_group, v_uid) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT * FROM trip_group_members WHERE group_id = v_group AND user_id = v_uid;
END $$;

-- Creator-only: issue a fresh code, which kills the old link
CREATE FUNCTION regenerate_group_invite(p_group_id int, hasura_session json DEFAULT NULL)
RETURNS SETOF trip_groups LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY WITH u AS (
    UPDATE trip_groups SET invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
    WHERE id = p_group_id AND created_by = uid(hasura_session) RETURNING *
  ) SELECT * FROM u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the group creator can change the invite link' USING ERRCODE = 'check_violation'; END IF;
END $$;

-- Expenses and payments also appear in the group chat as system cards (kind + meta on group_messages)
CREATE FUNCTION post_group_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_chat int; v_meta jsonb; v_text text; v_from text; v_to text;
BEGIN
  INSERT INTO group_chats (trip_group_id) VALUES (NEW.group_id) ON CONFLICT (trip_group_id) DO NOTHING;
  SELECT id INTO v_chat FROM group_chats WHERE trip_group_id = NEW.group_id;
  IF TG_TABLE_NAME = 'expenses' THEN
    SELECT full_name INTO v_from FROM users WHERE id = NEW.paid_by;
    v_text := NEW.description || ' · ' || NEW.amount;
    v_meta := jsonb_build_object('expense_id', NEW.id, 'description', NEW.description, 'amount', NEW.amount, 'category', NEW.category,
                                 'method', NEW.method, 'paid_by', NEW.paid_by, 'paid_by_name', v_from);
    INSERT INTO group_messages (group_chat_id, sender_id, message, kind, meta) VALUES (v_chat, NEW.created_by, v_text, 'expense', v_meta);
  ELSE
    SELECT full_name INTO v_from FROM users WHERE id = NEW.from_user;
    SELECT full_name INTO v_to FROM users WHERE id = NEW.to_user;
    v_text := v_from || ' paid ' || v_to || ' ' || NEW.amount;
    v_meta := jsonb_build_object('settlement_id', NEW.id, 'amount', NEW.amount, 'method', NEW.method, 'note', NEW.note,
                                 'from_name', v_from, 'to_name', v_to, 'from_user', NEW.from_user, 'to_user', NEW.to_user);
    INSERT INTO group_messages (group_chat_id, sender_id, message, kind, meta) VALUES (v_chat, NEW.from_user, v_text, 'settlement', v_meta);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_expense_chat AFTER INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION post_group_event();
CREATE TRIGGER trg_settlement_chat AFTER INSERT ON settlements FOR EACH ROW EXECUTE FUNCTION post_group_event();
