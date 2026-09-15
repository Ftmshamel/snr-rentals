const BOOKING_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "completed",
];

function normalizeBookingStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return BOOKING_STATUSES.includes(status) ? status : null;
}

function isCancelledStatus(value) {
  return normalizeBookingStatus(value) === "cancelled";
}

function resolveBookingStatus(existingStatus, requestedStatus, fallback = "pending") {
  if (isCancelledStatus(existingStatus)) return "cancelled";
  return (
    normalizeBookingStatus(requestedStatus) ||
    normalizeBookingStatus(existingStatus) ||
    fallback
  );
}

function sanitizeBookingUpdateFields(existingStatus, fields) {
  const result = { ...fields };
  const requestedStatus = normalizeBookingStatus(result.status ?? result.STATUS);

  delete result.STATUS;

  if (isCancelledStatus(existingStatus)) {
    if (requestedStatus) result.status = "cancelled";
    return result;
  }

  if (requestedStatus) result.status = requestedStatus;
  else if ("status" in result) delete result.status;

  return result;
}

module.exports = {
  BOOKING_STATUSES,
  isCancelledStatus,
  normalizeBookingStatus,
  resolveBookingStatus,
  sanitizeBookingUpdateFields,
};
