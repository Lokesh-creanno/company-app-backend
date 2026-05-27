// In-memory OTP store fallback when Redis is not available
const memStore = new Map();

const memClient = {
  isOpen: true,
  async setEx(key, ttlSeconds, value) {
    memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  },
  async get(key) {
    const entry = memStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { memStore.delete(key); return null; }
    return entry.value;
  },
  async del(key) { memStore.delete(key); },
};

async function getRedisClient() {
  if (process.env.USE_MEMORY_OTP === 'true') {
    return memClient;
  }

  const { createClient } = require('redis');
  const client = createClient({
    socket: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 },
    password: process.env.REDIS_PASSWORD || undefined,
  });
  await client.connect();
  return client;
}

module.exports = { getRedisClient };
