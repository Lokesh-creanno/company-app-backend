const { Sequelize } = require('sequelize');
const dns = require('dns');
const logger = require('../utils/logger');
const path = require('path');

// Force IPv4 DNS resolution globally — Railway doesn't support IPv6 outbound
// This prevents ENETUNREACH when Supabase hostname resolves to an IPv6 address
dns.setDefaultResultOrder('ipv4first');

let sequelize;

if (process.env.DB_DIALECT === 'sqlite') {
  // SQLite mode — no PostgreSQL needed (for local dev/testing)
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || path.join(__dirname, '../../test_database.sqlite'),
    logging: false,
  });
} else {
  // Production PostgreSQL (Supabase)
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false,
      pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
      dialectOptions: {
        ssl: (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true')
          ? { require: true, rejectUnauthorized: false }
          : false,
      },
    }
  );
}

module.exports = { sequelize, Sequelize };
