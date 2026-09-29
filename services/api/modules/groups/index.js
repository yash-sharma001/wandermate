// Hasura actions: trip groups
const db = require('@wandermate/common/db');

module.exports = {
  // What the invite link points at, shown before the user decides to join (the code is the credential)
  async groupInvitePreview({ userId, input }) {
    const [g] = await db.query(
      `SELECT g.id AS group_id, g.name, g.description, u.full_name AS creator_name,
              (SELECT count(*) FROM trip_group_members WHERE group_id = g.id)::int AS member_count,
              EXISTS (SELECT 1 FROM trip_group_members WHERE group_id = g.id AND user_id = $2) AS already_member
       FROM trip_groups g JOIN users u ON u.id = g.created_by WHERE g.invite_code = $1`,
      [String(input.code).trim(), userId]
    );
    if (!g) throw new Error('This invite link is no longer valid');
    return g;
  },
};
