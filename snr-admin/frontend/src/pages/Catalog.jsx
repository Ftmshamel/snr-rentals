import { useMemo, useState } from "react";
import Header from "../components/Header.jsx";
import { useCameras } from "../hooks/useCameras.js";
import { apiDeleteJson, apiPatchJson, apiPostJson } from "../utils/api.js";

// Owner-only editor for the camera catalogue (Firestore `cameras`). Everything
// that prices or counts cameras — the public site, availability, fee
// calculation, quotes, the schedule — reads from here.
//
// A changed day rate or unit count is never overwritten: the server keeps the
// old value in history up to the "takes effect" date, so bookings before it
// keep their price (see backend/lib/catalog.js).

function todayManila() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function tierLabel(t) {
  if (t.maxDays === null || t.maxDays === undefined) return `${t.minDays}+ days`;
  if (t.minDays === t.maxDays) return `${t.minDays} day${t.minDays === 1 ? "" : "s"}`;
  return `${t.minDays}–${t.maxDays} days`;
}

function pricingSummary(pricing = []) {
  return pricing.map((t) => `${tierLabel(t)} ₱${Number(t.pricePerDay).toLocaleString()}`).join(" · ");
}

const EMPTY_CAMERA = {
  name: "",
  tag: "",
  active: true,
  units: 1,
  pricing: [
    { minDays: 1, maxDays: 2, pricePerDay: "" },
    { minDays: 3, maxDays: 4, pricePerDay: "" },
    { minDays: 5, maxDays: null, pricePerDay: "" },
  ],
  addOns: [],
  inclusions: [],
  image: "",
  detailImage: "",
  goodFor: "",
  perfectFor: "",
};

/** Editable form state ← stored camera. Tiers are edited as "up to N days". */
function toForm(camera) {
  const c = camera || EMPTY_CAMERA;
  return {
    name: c.name || "",
    tag: c.tag || "",
    active: c.active !== false,
    sortOrder: c.sortOrder ?? "",
    units: String(c.units ?? ""),
    tiers: (c.pricing || []).map((t) => ({
      upTo: t.maxDays === null || t.maxDays === undefined ? "" : String(t.maxDays),
      price: String(t.pricePerDay ?? ""),
    })),
    addOns: (c.addOns || []).map((a) => ({ name: a.name, price: String(a.pricePerDay) })),
    inclusionsText: (c.inclusions || []).join("\n"),
    image: c.image || "",
    detailImage: c.detailImage || "",
    goodFor: c.goodFor || "",
    perfectFor: c.perfectFor || "",
  };
}

/** Each tier starts the day after the previous one ends; the last is open-ended. */
function formTiersToPricing(tiers) {
  let from = 1;
  return tiers.map((t, i) => {
    const last = i === tiers.length - 1;
    const maxDays = last ? null : t.upTo === "" ? NaN : Number(t.upTo);
    const tier = { minDays: from, maxDays, pricePerDay: t.price === "" ? "" : Number(t.price) };
    if (!last) from = Number.isFinite(maxDays) ? maxDays + 1 : from + 1;
    return tier;
  });
}

/** Form state → API body. Validation happens on the server. */
function toCamera(form) {
  return {
    name: form.name.trim(),
    tag: form.tag.trim(),
    active: form.active,
    ...(form.sortOrder === "" ? {} : { sortOrder: Number(form.sortOrder) }),
    units: form.units === "" ? "" : Number(form.units),
    pricing: formTiersToPricing(form.tiers),
    addOns: form.addOns
      .filter((a) => a.name.trim())
      .map((a) => ({ name: a.name.trim(), pricePerDay: a.price === "" ? "" : Number(a.price) })),
    inclusions: form.inclusionsText.split("\n").map((s) => s.trim()).filter(Boolean),
    image: form.image.trim(),
    detailImage: form.detailImage.trim(),
    goodFor: form.goodFor.trim(),
    perfectFor: form.perfectFor.trim(),
  };
}

function samePricing(a = [], b = []) {
  const key = (tiers) =>
    JSON.stringify(tiers.map((t) => [t.minDays, t.maxDays ?? null, Number(t.pricePerDay)]));
  return key(a) === key(b);
}

function Label({ children }) {
  return <label className="ui-label">{children}</label>;
}

function CameraEditor({ camera, onClose, onSaved }) {
  const isNew = !camera;
  const [form, setForm] = useState(() => toForm(camera));
  const [effectiveDate, setEffectiveDate] = useState(todayManila);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const draft = useMemo(() => toCamera(form), [form]);
  const pricingChanged = !isNew && !samePricing(draft.pricing, camera.pricing);
  const unitsChanged = !isNew && Number(draft.units) !== Number(camera.units);
  const needsDate = pricingChanged || unitsChanged;

  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setTier = (i, key, value) =>
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, j) => (j === i ? { ...t, [key]: value } : t)) }));
  const setAddOn = (i, key, value) =>
    setForm((f) => ({ ...f, addOns: f.addOns.map((a, j) => (j === i ? { ...a, [key]: value } : a)) }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await apiPostJson("/api/catalog", { camera: draft });
      } else {
        await apiPatchJson(`/api/catalog?id=${encodeURIComponent(camera.id)}`, {
          camera: draft,
          ...(needsDate ? { effectiveDate } : {}),
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const tierFrom = formTiersToPricing(form.tiers).map((t) => t.minDays);

  return (
    <div className="ui-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} className="ui-modal max-w-2xl">
        <div className="flex items-center justify-between border-b-2 border-[rgba(58,58,58,0.2)] px-5 py-4">
          <div className="text-lg font-bold text-[color:var(--color-black)]">
            {isNew ? "Add Camera" : `Edit ${camera.name}`}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--color-dark-gray)] hover:text-[color:var(--color-ink)]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-5">
            {/* Basics */}
            <section className="space-y-3">
              <div className="ui-kicker">Camera</div>
              <div>
                <Label>Name *</Label>
                <input
                  value={form.name}
                  onChange={set("name")}
                  disabled={!isNew}
                  required
                  placeholder="e.g. DJI Osmo Pocket 3"
                  className="ui-input"
                />
                {!isNew && (
                  <p className="mt-1 font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                    Name is fixed — bookings refer to the camera by name. To rename, hide this one and add a new one.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Label>Tag (shown on the website)</Label>
                  <input value={form.tag} onChange={set("tag")} placeholder="e.g. Creator Combo" className="ui-input" />
                </div>
                <div>
                  <Label>Units owned *</Label>
                  <input type="number" min="0" step="1" value={form.units} onChange={set("units")} required className="ui-input" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
                  <input type="checkbox" checked={form.active} onChange={set("active")} />
                  Show on the website and allow online booking
                </label>
                <div>
                  <Label>Order on website</Label>
                  <input type="number" step="1" value={form.sortOrder} onChange={set("sortOrder")} placeholder="auto" className="ui-input" />
                </div>
              </div>
            </section>

            <hr className="ui-divider" />

            {/* Pricing */}
            <section className="space-y-2">
              <div className="ui-kicker">Day rates</div>
              <p className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                The rate for the whole rental is set by its length. The last tier covers everything longer.
              </p>
              {form.tiers.map((t, i) => {
                const last = i === form.tiers.length - 1;
                return (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                    <div>
                      <Label>From (days)</Label>
                      <input value={tierFrom[i]} disabled className="ui-input ui-input--sm" />
                    </div>
                    <div>
                      <Label>To (days)</Label>
                      {last ? (
                        <input value="and up" disabled className="ui-input ui-input--sm" />
                      ) : (
                        <input
                          type="number"
                          min={tierFrom[i]}
                          step="1"
                          value={t.upTo}
                          onChange={(e) => setTier(i, "upTo", e.target.value)}
                          required
                          className="ui-input ui-input--sm"
                        />
                      )}
                    </div>
                    <div>
                      <Label>₱ / day</Label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={t.price}
                        onChange={(e) => setTier(i, "price", e.target.value)}
                        required
                        className="ui-input ui-input--sm"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={form.tiers.length === 1}
                      onClick={() => setForm((f) => ({ ...f, tiers: f.tiers.filter((_, j) => j !== i) }))}
                      className="ui-btn ui-btn--sm ui-btn--danger"
                      aria-label="Remove tier"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setForm((f) => {
                    // The new tier goes before the open-ended last one.
                    const tiers = [...f.tiers];
                    tiers.splice(Math.max(tiers.length - 1, 0), 0, { upTo: "", price: "" });
                    return { ...f, tiers };
                  })
                }
                className="ui-btn ui-btn--sm"
              >
                + Add tier
              </button>
            </section>

            {needsDate && (
              <div className="ui-surface space-y-2 p-3">
                <div className="ui-kicker">
                  {pricingChanged && unitsChanged ? "New rates and units" : pricingChanged ? "New rates" : "New unit count"} take effect on
                </div>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  required
                  className="ui-input ui-input--sm max-w-[12rem]"
                />
                <p className="ui-note">
                  Bookings with a pick-up date before this keep the old{" "}
                  {pricingChanged ? "rates" : ""}
                  {pricingChanged && unitsChanged ? " and " : ""}
                  {unitsChanged ? "unit count" : ""}. Nothing in the past is rewritten.
                </p>
              </div>
            )}

            <hr className="ui-divider" />

            {/* Add-ons */}
            <section className="space-y-2">
              <div className="ui-kicker">Add-ons</div>
              {form.addOns.length === 0 && (
                <p className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">No add-ons for this camera.</p>
              )}
              {form.addOns.map((a, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_auto] items-end gap-2">
                  <div>
                    {i === 0 && <Label>Name</Label>}
                    <input
                      value={a.name}
                      onChange={(e) => setAddOn(i, "name", e.target.value)}
                      required
                      className="ui-input ui-input--sm"
                    />
                  </div>
                  <div>
                    {i === 0 && <Label>₱ / day</Label>}
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={a.price}
                      onChange={(e) => setAddOn(i, "price", e.target.value)}
                      required
                      className="ui-input ui-input--sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, addOns: f.addOns.filter((_, j) => j !== i) }))}
                    className="ui-btn ui-btn--sm ui-btn--danger"
                    aria-label="Remove add-on"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, addOns: [...f.addOns, { name: "", price: "" }] }))}
                className="ui-btn ui-btn--sm"
              >
                + Add add-on
              </button>
            </section>

            <hr className="ui-divider" />

            {/* Website copy */}
            <section className="space-y-3">
              <div className="ui-kicker">Website details</div>
              <div>
                <Label>Inclusions (one per line)</Label>
                <textarea
                  rows={5}
                  value={form.inclusionsText}
                  onChange={set("inclusionsText")}
                  className="ui-input font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Card image URL</Label>
                  <input value={form.image} onChange={set("image")} placeholder="/osmo360.png" className="ui-input ui-input--sm" />
                </div>
                <div>
                  <Label>Details image URL</Label>
                  <input value={form.detailImage} onChange={set("detailImage")} placeholder="/osmo360-inclusions.png" className="ui-input ui-input--sm" />
                </div>
              </div>
              <div>
                <Label>Good for</Label>
                <input value={form.goodFor} onChange={set("goodFor")} className="ui-input ui-input--sm" />
              </div>
              <div>
                <Label>Perfect for</Label>
                <input value={form.perfectFor} onChange={set("perfectFor")} className="ui-input ui-input--sm" />
              </div>
            </section>

            {!isNew && (camera.priceHistory?.length > 0 || camera.unitHistory?.length > 0) && (
              <>
                <hr className="ui-divider" />
                <section className="space-y-1">
                  <div className="ui-kicker">History</div>
                  {(camera.priceHistory || []).map((h) => (
                    <p key={`p${h.before}`} className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                      Before {formatDate(h.before)}: {pricingSummary(h.pricing)}
                    </p>
                  ))}
                  {(camera.unitHistory || []).map((h) => (
                    <p key={`u${h.before}`} className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                      Before {formatDate(h.before)}: {h.units} unit{h.units === 1 ? "" : "s"}
                    </p>
                  ))}
                </section>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t-2 border-[rgba(58,58,58,0.2)] px-5 py-4">
          <p className="min-w-0 font-mono text-xs text-rose-600">{error}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="ui-btn ui-btn--sm">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="ui-btn ui-btn--sm ui-btn--solid disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function Catalog() {
  const { cameras, loading, error, readOnly, reload } = useCameras();
  const [editing, setEditing] = useState(null); // camera | "new" | null
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  async function run(fn) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setActionError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const seed = () => run(() => apiPostJson("/api/catalog?action=seed", {}));

  const remove = (camera) => {
    const ok = window.confirm(
      `Delete ${camera.name}?\n\nPast bookings keep their stored fee, but this camera's ` +
        `rate history goes with it. To stop renting it out, untick "Show on the website" instead.`,
    );
    if (ok) run(() => apiDeleteJson(`/api/catalog?id=${encodeURIComponent(camera.id)}`));
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="ui-kicker">Cameras &amp; rates</div>
            <h1 className="ui-title font-display text-3xl">Catalog</h1>
          </div>
          {!readOnly && cameras.length > 0 && (
            <button type="button" onClick={() => setEditing("new")} className="ui-btn ui-btn--solid">
              + Add camera
            </button>
          )}
        </div>

        <p className="ui-note mb-4">
          Everything here is live: the website, online booking, availability, quotes and fee
          calculation all read this list. Changing a rate or unit count asks for the date it takes effect,
          so older bookings keep their price.
        </p>

        {readOnly && (
          <p className="ui-card mb-4 px-4 py-3.5 font-mono text-xs text-rose-600">
            The API is not running on Firebase (DATASOURCE), so the catalogue is read-only.
          </p>
        )}
        {actionError && <p className="mb-3 font-mono text-xs text-rose-600">{actionError}</p>}
        {error && <p className="mb-3 font-mono text-xs text-rose-600">{error}</p>}

        {loading && cameras.length === 0 && (
          <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
            Loading…
          </p>
        )}

        {!loading && !error && cameras.length === 0 && (
          <div className="ui-panel space-y-3 p-5">
            <div className="text-sm font-bold">The catalogue is empty.</div>
            <p className="text-sm text-[color:var(--color-dark-gray)]">
              Load the seven cameras S&amp;R rented before the move to Firebase (with their rates, rate history,
              add-ons and inclusions), or start from scratch.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={seed} disabled={busy} className="ui-btn ui-btn--solid disabled:opacity-50">
                {busy ? "Loading…" : "Load default cameras"}
              </button>
              <button type="button" onClick={() => setEditing("new")} className="ui-btn">
                + Add camera
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {cameras.map((c) => (
            <div key={c.id || c.name} className="ui-card flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[color:var(--color-black)]">{c.name}</span>
                  {c.tag && <span className="ui-chip">{c.tag}</span>}
                  {c.active === false && <span className="ui-chip ui-chip--solid">Hidden</span>}
                </div>
                <div className="mt-1 font-mono text-[11px] text-[color:var(--color-dark-gray)]">
                  {c.units} unit{c.units === 1 ? "" : "s"} · {pricingSummary(c.pricing)}
                </div>
                <div className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                  {(c.addOns || []).length} add-on{(c.addOns || []).length === 1 ? "" : "s"}
                  {c.priceHistory?.length ? ` · rates changed ${c.priceHistory.length}×` : ""}
                </div>
              </div>
              {!readOnly && (
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => setEditing(c)} className="ui-btn ui-btn--sm">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    disabled={busy}
                    className="ui-btn ui-btn--sm ui-btn--danger disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {editing && (
        <CameraEditor
          camera={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
