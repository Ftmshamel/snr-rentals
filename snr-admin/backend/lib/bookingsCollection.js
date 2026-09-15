const { getDb } = require("./mongo");

async function getBookingsCollection() {
  const db = await getDb();
  const name = process.env.MONGODB_COLLECTION || "form_submissions";
  return db.collection(name);
}

module.exports = { getBookingsCollection };
