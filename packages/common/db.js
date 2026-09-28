const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Run a parameterised query ($1, $2, ...) and return the rows
const query = async (sql, params = []) => (await pool.query(sql, params)).rows;

module.exports = { pool, query };
