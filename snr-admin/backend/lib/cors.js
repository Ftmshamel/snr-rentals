function setCorsJson(req, res) {
  const origin = (req && req.headers && req.headers.origin) || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // allow credentials when origin is provided
  if (origin && origin !== "*") {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

module.exports = { setCorsJson };
