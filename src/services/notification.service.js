const { Notification, User } = require('../models');
const logger = require('../utils/logger');

async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (process.env.FIREBASE_DISABLED === 'true' || !fcmToken) return;
  try {
    const admin = require('firebase-admin');
    await admin.messaging().send({ token: fcmToken, notification: { title, body }, data });
  } catch (err) {
    logger.warn('Push notification skipped:', err.message);
  }
}

async function createNotification(userId, title, body, type, referenceId = null, referenceType = null) {
  const notification = await Notification.create({ userId, title, body, type, referenceId, referenceType });
  logger.info(`🔔 Notification → [${type}] ${title} (user: ${userId})`);

  if (process.env.FIREBASE_DISABLED !== 'true') {
    const user = await User.findByPk(userId, { attributes: ['fcmToken'] });
    if (user?.fcmToken) await sendPushNotification(user.fcmToken, title, body, { type, referenceId: referenceId || '' });
  }
  return notification;
}

async function notifyMany(userIds, title, body, type) {
  return Promise.all(userIds.map(id => createNotification(id, title, body, type)));
}

module.exports = { createNotification, notifyMany, sendPushNotification };
