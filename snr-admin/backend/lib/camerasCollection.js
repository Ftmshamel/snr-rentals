const { getDb } = require("./mongo");

async function getCamerasCollection() {
  const db = await getDb();
  return db.collection("cameras");
}

module.exports = { getCamerasCollection };
