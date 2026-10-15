import { useEffect, useState } from "react";
import Header from "../components/Header.jsx";
import { apiDeleteJson, apiGetJson, apiPatchJson } from "../utils/api.js";
import Icon from "../components/Icon.jsx";

// Owner only. Requests renters file on the public Privacy page under the
// Data Privacy Act (RA 10173): a copy of their data, a correction, or
// erasure. "Erase personal data" removes the IDs, signature, name, contact,
// address and delivery pins from each booking of the request but keeps the
// rental itself (dates, camera, serial, fees) for the business's records.

const TYPE_LABEL = { access: "Copy of my data", correction: "Correct my data", deletion: "Delete my data" };
const STATUS_LABEL = { open: "Open", done: "Done", declined: "Declined" };

function when(iso) {
  return iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function RequestCard({ request, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(request.resolution || "");
  const [erased, setErased] = useState({});
  const [error, setError] = useState(null);

  async function erase(ref) {
    if (!window.confirm(`Erase the renter's personal data from ${ref}?\n\nIDs, signature, name, contact, address and delivery pins are deleted for good. Dates, camera, serial and fees stay for your records.`)) return;
    setBusy(ref);
    setError(null);
    try {
      await apiDeleteJson(`/api/bookings/${encodeURIComponent(ref)}?mode=erase`);
      setErased((e) => ({ ...e, [ref]: true }));
    } catch (err) {
      setError(`${ref}: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status) {
    setBusy(status);
    setError(null);
    try {
      const { request: updated } = await apiPatchJson(`/api/bookings/by?type=privacy&id=${encodeURIComponent(request.id)}`, {
        status,
        resolution: note,
      });
      onChanged(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const open = request.status === "open";
  return (
    <div className={`ui-card p-4 ${open ? "" : "opacity-75"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="ui-chip">{TYPE_LABEL[request.type] || request.type}</span>
        <span className={`font-mono text-[10px] font-bold uppercase ${open ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-mid-gray)]"}`}>
          {STATUS_LABEL[request.status] || request.status}
        </span>
        <span className="ml-auto font-mono text-[11px] text-[color:var(--color-dark-gray)]">{when(request.createdAt)}</span>
      </div>
      <p className="mt-2 text-sm">
        Booking <span className="font-mono">{request.ref}</span>
        {request.refs?.length > 1 && ` (${request.refs.length} cameras)`} · contact number matched
      </p>
      {request.details && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white/70 p-3 text-sm">{request.details}</p>}

      {request.type === "deletion" && open && (
        <div className="mt-3 space-y-2">
          {(request.refs || [request.ref]).map((ref) => (
            <div key={ref} className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">{ref}</span>
              {erased[ref] ? (
                <span className="text-xs font-bold"><Icon name="check" size={13} strokeWidth={3} /> Personal data erased</span>
              ) : (
                <button type="button" className="ui-btn ui-btn--sm" disabled={Boolean(busy)} onClick={() => erase(ref)}>
                  {busy === ref ? "Erasing…" : "Erase personal data"}
                </button>
              )}
            </div>
          ))}
          <p className="text-xs text-[color:var(--color-dark-gray)]">
            Only finished, cancelled or declined bookings can be erased.
          </p>
        </div>
      )}
      {request.type === "access" && open && (
        <p className="mt-3 text-xs text-[color:var(--color-dark-gray)]">
          Open the booking from Rentals, save its contract and details, and send them to the renter's contact number.
        </p>
      )}
      {request.type === "correction" && open && (
        <p className="mt-3 text-xs text-[color:var(--color-dark-gray)]">
          Open the booking from Rentals, choose Edit, and make the correction.
        </p>
      )}

      {open ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block min-w-[220px] flex-1">
            <span className="ui-label">Note to keep (what was done)</span>
            <input className="ui-input ui-input--sm" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" className="ui-btn ui-btn--sm" disabled={Boolean(busy)} onClick={() => setStatus("declined")}>
            Decline
          </button>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--solid" disabled={Boolean(busy)} onClick={() => setStatus("done")}>
            Mark done
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[color:var(--color-dark-gray)]">
          {STATUS_LABEL[request.status]} {when(request.resolvedAt)}
          {request.resolution ? ` — ${request.resolution}` : ""}
        </p>
      )}
      {error && <p className="mt-2 font-mono text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export default function Privacy() {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGetJson("/api/bookings/by?type=privacy")
      .then((d) => setRequests(d.requests || []))
      .catch((e) => setError(e.message));
  }, []);

  const replace = (r) => setRequests((list) => list.map((x) => (x.id === r.id ? { ...x, ...r } : x)));
  const openCount = (requests || []).filter((r) => r.status === "open").length;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <div className="ui-kicker">Data Privacy Act (RA 10173)</div>
            <h1 className="ui-title font-display text-3xl">Privacy requests</h1>
          </div>
          {requests && <span className="font-mono text-xs">{openCount} open</span>}
        </div>
        <p className="mb-4 text-sm text-[color:var(--color-dark-gray)]">
          Renters send these from the Privacy Policy page on the booking site, proving the booking is theirs with its
          reference code and contact number. Act on each one and mark it done.
        </p>
        {error && <p className="font-mono text-xs text-rose-600">{error}</p>}
        {!requests && !error && <p className="ui-card px-4 py-3 text-xs font-bold uppercase">Loading…</p>}
        {requests?.length === 0 && <p className="ui-card px-4 py-3 text-xs font-bold uppercase">No requests yet.</p>}
        <div className="space-y-3">
          {(requests || []).map((r) => (
            <RequestCard key={r.id} request={r} onChanged={replace} />
          ))}
        </div>
      </main>
    </div>
  );
}
