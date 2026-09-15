const { getBookingsCollection } = require("./bookingsCollection");

/**
 * Bookings that were saved to MongoDB but never reached Supabase.
 *
 * /api/submit flags these with `_mirrorFailed` after its retries are
 * exhausted (see lib/mirrorToSupabase.js). Because the admin panel reads
 * Supabase, such a booking is otherwise completely invisible there — which is
 * how three real bookings sat unnoticed for up to two weeks in Sept 2026.
 *
 * This reads MongoDB directly rather than going through dataSource, which
 * resolves to Supabase and by definition cannot see the missing rows.
 *
 * Returns the shape the frontend already expects from the other booking
 * endpoints, plus the mirror-failure detail.
 */
async function findUnmirroredBookings() {
  const col = await getBookingsCollection();
  const docs = await col
    .find(
      { _mirrorFailed: true },
      {
        projection: {
          responseId: 1,
          FULL_NAME: 1,
          FACEBOOK_ACCOUNT_NAME: 1,
          CONTACT_NUMBER: 1,
          PREFERRED_CAMERA: 1,
          PICK_UP_DATE: 1,
          PICK_UP_TIME: 1,
          RETURN_DATE: 1,
          RETURN_TIME: 1,
          PREFERRED_MODE: 1,
          RENTAL_FEE: 1,
          status: 1,
          _source: 1,
          _mirrorError: 1,
          _mirrorFailedAt: 1,
        },
      },
    )
    .sort({ _mirrorFailedAt: -1 })
    .limit(50)
    .toArray();

  return docs.map((d) => ({
    responseId: d.responseId,
    FULL_NAME: d.FULL_NAME ?? null,
    FACEBOOK_ACCOUNT_NAME: d.FACEBOOK_ACCOUNT_NAME ?? null,
    CONTACT_NUMBER: d.CONTACT_NUMBER ?? null,
    PREFERRED_CAMERA: d.PREFERRED_CAMERA ?? null,
    PICK_UP_DATE: d.PICK_UP_DATE ?? null,
    PICK_UP_TIME: d.PICK_UP_TIME ?? null,
    RETURN_DATE: d.RETURN_DATE ?? null,
    RETURN_TIME: d.RETURN_TIME ?? null,
    PREFERRED_MODE: d.PREFERRED_MODE ?? null,
    RENTAL_FEE: d.RENTAL_FEE ?? null,
    status: d.status ?? null,
    _source: d._source ?? null,
    _mirrorError: d._mirrorError ?? null,
    _mirrorFailedAt: d._mirrorFailedAt ?? null,
  }));
}

module.exports = { findUnmirroredBookings };
