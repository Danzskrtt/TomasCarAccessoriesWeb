require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
	user: process.env.DB_USER,
	host: process.env.DB_HOST,
	database: process.env.DB_NAME,
	password: process.env.DB_PASSWORD?.trim(),
	port: Number(process.env.DB_PORT),
});

pool.on('error', (error) => {
	console.error('Unexpected PostgreSQL pool error:', error.message);
});

module.exports = pool;