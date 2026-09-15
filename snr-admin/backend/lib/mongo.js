const { MongoClient } = require('mongodb');

/**
 * Reuse one promise across warm invocations (recommended for Vercel + MongoDB).
 */
function getMongoClientPromise() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  if (!global._snrMongoClientPromise) {
    const client = new MongoClient(uri);
    global._snrMongoClientPromise = client.connect();
  }

  return global._snrMongoClientPromise;
}

async function getDb() {
  const client = await getMongoClientPromise();
  const dbName = process.env.MONGODB_DB || 'snr_rentals';
  return client.db(dbName);
}

module.exports = { getDb };
