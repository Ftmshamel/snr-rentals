import { useEffect, useState } from "react";
import Header from "../components/Header.jsx";
import { apiGetJson, apiPatchJson } from "../utils/api.js";
import { TIER_COLORS, perkSummary } from "../utils/loyalty.jsx";

// Owner only. Member tiers (Bronze → Platinum) and the renters who signed in
// on the public site. A tier is earned by completed rentals; its perks are
// applied by the server when a signed-in renter books (backend/lib/loyalty.js)
// and frozen on that booking, so editing a tier here only affects new bookings.

function TierEditor({ tier, index, onChange }) {
  const set = (key, value) => onChange({ ...tier, [key]: value });
  return (
    <div className="ui-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 text-white" style={{ background: TIER_COLORS[tier.key] }}>
        <input
          value={tier.name}
          onChange={(e) => set("name", e.target.value)}
          aria-label="Tier name"
          className="w-36 bg-transparent font-display text-lg font-extrabold uppercase tracking-wide text-white outline-none placeholder:text-white/60"
        />
        <span className="font-mono text-[10px] font-bold uppercase">{perkSummary(tier)}</span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-4">
        <label className="block">
          <span className="ui-label">Completed rentals needed</span>
          <input
            type="number"
            min={0}
            disabled={index === 0}
            value={tier.minRentals}
            onChange={(e) => set("minRentals", e.target.value)}
            className="ui-input ui-input--sm disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="ui-label">Discount on camera (%)</span>
          <input type="number" min={0} max={50} value={tier.discountPercent} onChange={(e) => set("discountPercent", e.target.value)} className="ui-input ui-input--sm" />
        </label>
        <label className="block">
          <span className="ui-label">Free add-ons per rental</span>
          <input type="number" min={0} max={5} value={tier.freeAddons} onChange={(e) => set("freeAddons", e.target.value)} className="ui-input ui-input--sm" />
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input type="checkbox" checked={tier.priority} onChange={(e) => set("priority", e.target.checked)} className="accent-[color:var(--color-ink)]" />
          <span className="text-sm font-semibold">Priority (reviewed first)</span>
        </label>
        <label className="block sm:col-span-4">
          <span className="ui-label">Other perks shown to renters — one per line</span>
          <textarea
            rows={2}
            value={(tier.perks || []).join("\n")}
            onChange={(e) => set("perks", e.target.value.split("\n"))}
            className="ui-input ui-input--sm"
            placeholder="e.g. Free cleaning kit"
          />
        </label>
      </div>
    </div>
  );
}

export default function Rewards() {
  const [tiers, setTiers] = useState(null);
  const [saved, setSaved] = useState(null);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGetJson("/api/catalog")
      .then((d) => {
        setTiers(d.tiers || []);
        setSaved(JSON.stringify(d.tiers || []));
      })
      .catch((e) => setError(e.message));
    apiGetJson("/api/catalog?action=members")
      .then((d) => setMembers(d.members || []))
      .catch((e) => setError(e.message));
  }, []);

  const dirty = tiers && JSON.stringify(tiers) !== saved;

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        tiers: tiers.map((t) => ({
          ...t,
          minRentals: Number(t.minRentals),
          discountPercent: Number(t.discountPercent),
          freeAddons: Number(t.freeAddons),
          perks: (t.perks || []).map((p) => p.trim()).filter(Boolean),
        })),
      };
      const d = await apiPatchJson("/api/catalog?action=tiers", body);
      setTiers(d.tiers);
      setSaved(JSON.stringify(d.tiers));
      setNotice("Saved. New bookings use these perks; past bookings keep theirs.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const counts = Object.fromEntries((tiers || []).map((t) => [t.key, members.filter((m) => m.tier === t.key).length]));

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <div className="ui-kicker">Members</div>
          <h1 className="ui-title font-display text-3xl">Rewards</h1>
          <p className="mt-1 text-sm text-[color:var(--color-dark-gray)]">
            Renters who sign in with Google on the website earn a tier from their completed rentals. Perks apply
            automatically when they book.
          </p>
        </div>

        {error && <p className="font-mono text-xs font-bold text-rose-600">{error}</p>}
        {notice && <p className="font-mono text-xs font-bold text-green-700">{notice}</p>}

        {tiers && (
          <section className="space-y-3">
            {tiers.map((t, i) => (
              <TierEditor key={t.key} tier={t} index={i} onChange={(next) => setTiers(tiers.map((x, j) => (j === i ? next : x)))} />
            ))}
            <button type="button" disabled={!dirty || busy} onClick={save} className="ui-btn ui-btn--solid w-full disabled:opacity-50">
              {busy ? "Saving…" : "Save tiers"}
            </button>
          </section>
        )}

        <section className="ui-panel min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold">
              Members <span className="font-mono text-sm text-[color:var(--color-dark-gray)]">({members.length})</span>
            </h2>
            <div className="flex flex-wrap gap-1">
              {(tiers || []).map((t) => (
                <span key={t.key} className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white" style={{ background: TIER_COLORS[t.key] }}>
                  {t.name} {counts[t.key] || 0}
                </span>
              ))}
            </div>
          </div>
          {members.length === 0 ? (
            <p className="font-mono text-xs text-[color:var(--color-dark-gray)]">No renter has signed in yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.uid} className="flex items-center justify-between gap-3 rounded-[14px] border-2 border-[rgba(58,58,58,0.18)] bg-white/60 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {m.picture ? (
                      <img src={m.picture} alt="" className="h-8 w-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--color-ink)] font-bold text-white">
                        {(m.name || m.email || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{m.name || m.email}</div>
                      <div className="truncate font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                        {m.email} · {m.completed} completed · ₱{Number(m.spent || 0).toLocaleString()}
                        {m.nextTierName ? ` · ${m.toNext} to ${m.nextTierName}` : ""}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white" style={{ background: TIER_COLORS[m.tier] }}>
                    {m.tierName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
