// Load environment — skip dotenv on Railway (env vars are injected by the platform)
const fs = require('fs');
const path = require('path');
if (!process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_SERVICE_NAME) {
  const envFile = fs.existsSync(path.join(__dirname, '../.env')) ? '../.env' : '../.env.test';
  require('dotenv').config({ path: path.join(__dirname, envFile) });
}

const app = require('./app');
const { sequelize } = require('./config/database');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await sequelize.authenticate();
    logger.info(`Database connected (${process.env.DB_DIALECT || 'postgres'})`);
    // SQLite: use force:false (create only). PostgreSQL: alter:true for migrations.
    const syncOpts = process.env.DB_DIALECT === 'sqlite' ? { force: false } : { alter: true };
    await sequelize.sync(syncOpts);
    logger.info('Models synchronized');

    const { seedSuperAdmins } = require('./utils/seedSuperAdmins');
    await seedSuperAdmins();

    app.listen(PORT, () => {
      logger.info(`🚀 Server running → http://localhost:${PORT}`);
      logger.info(`   Mode : ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   DB   : ${process.env.DB_DIALECT === 'sqlite' ? 'SQLite (local)' : 'PostgreSQL'}`);
      logger.info(`   OTP  : ${process.env.USE_MEMORY_OTP === 'true' ? 'In-Memory (console)' : 'Redis'}`);
      logger.info(`   Store: ${process.env.STORAGE_LOCAL === 'true' ? 'Local disk' : 'AWS S3'}`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message || error}`);
    if (error.stack) logger.error(error.stack);
    process.exit(1);
  }
}

startServer();
