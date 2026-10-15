import { useEffect, useState, useMemo } from "react";
import Header from "../components/Header.jsx";
import { apiGetJson, apiPostJson, apiDeleteJson, apiPatchJson } from "../utils/api.js";
import Icon from "../components/Icon.jsx";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const PAGE_SIZE = 20;

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => todayIso());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);

  const [monthFilter, setMonthFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    apiGetJson("/api/expenses")
      .then((data) => setExpenses(data.expenses || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  function silentLoad() {
    apiGetJson("/api/expenses")
      .then((data) => setExpenses(data.expenses || []))
      .catch(() => {});
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!desc.trim() || !amount || !date) return;
    setAdding(true);
    setAddError(null);
    try {
      const result = await apiPostJson("/api/expenses", {
        description: desc.trim(),
        amount: Number(amount),
        date,
      });
      setExpenses((prev) => [result.expense, ...prev]);
      setDesc("");
      setAmount("");
      setDate(todayIso());
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    try {
      await apiDeleteJson(`/api/expenses?id=${id}`);
    } catch {
      silentLoad();
    }
  }

  function startEdit(expense) {
    setEditingId(expense.id);
    setEditForm({
      description: expense.description,
      amount: String(expense.amount),
      date: expense.date,
    });
  }

  async function handleEditSave(id) {
    try {
      const result = await apiPatchJson(`/api/expenses?id=${id}`, {
        description: editForm.description,
        amount: Number(editForm.amount),
        date: editForm.date,
      });
      setExpenses((prev) => prev.map((e) => (e.id === id ? result.expense : e)));
      setEditingId(null);
    } catch (e) {
      alert(e.message);
    }
  }

  const monthOptions = useMemo(() => {
    const set = new Set();
    expenses.forEach((e) => { if (e.date) set.add(e.date.slice(0, 7)); });
    return [...set].sort().reverse();
  }, [expenses]);

  const filtered = useMemo(() => {
    if (!monthFilter) return expenses;
    return expenses.filter((e) => (e.date || "").startsWith(monthFilter));
  }, [expenses, monthFilter]);

  // The total reflects the whole filtered set, not just the visible page.
  const total = useMemo(
    () => filtered.reduce((s, e) => s + Number(e.amount), 0),
    [filtered],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  // Changing the filter can leave you past the end of the new result set.
  useEffect(() => {
    setPage(1);
  }, [monthFilter]);

  // Deleting the last row on the final page would otherwise strand you on an
  // empty page.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6">

        {/* Add form */}
        <form onSubmit={handleAdd} className="mb-6 ui-panel p-5">
          <div className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
            Add Expense
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Description (e.g. Camera bag, SD card)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              required
              className="ui-input"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block ui-kicker text-[0.6rem]">
                  Amount (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="ui-input"
                />
              </div>
              <div>
                <label className="mb-1 block ui-kicker text-[0.6rem]">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="ui-input w-full font-mono text-sm text-[color:var(--color-black)] focus:outline-none"
                />
              </div>
            </div>
            {addError && <p className="font-mono text-xs text-rose-500">{addError}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={adding}
                className="ui-btn ui-btn--solid hover:bg-[rgba(255,255,255,0.6)] disabled:opacity-50"
              >
                {adding ? "Adding…" : "+ Add"}
              </button>
            </div>
          </div>
        </form>

        {/* Header row */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
              <div className="ui-kicker">Ledger</div>
              <h1 className="ui-title font-display text-3xl">Expenses</h1>
            </div>
          <div className="flex items-center gap-2">
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="ui-input ui-input--sm"
            >
              <option value="">All months</option>
              {monthOptions.map((m) => {
                const [y, mo] = m.split("-");
                return (
                  <option key={m} value={m}>
                    {MONTHS[parseInt(mo, 10) - 1]} {y}
                  </option>
                );
              })}
            </select>
            {monthFilter && (
              <button
                type="button"
                onClick={() => setMonthFilter("")}
                className="ui-btn ui-btn--sm"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading && (
          <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
            Loading…
          </p>
        )}
        {error && <p className="font-mono text-xs text-rose-400">{error}</p>}

        {!loading && !error && (
          <>
            {/* Total */}
            {filtered.length > 0 && (
              <div className="mb-3 flex items-center justify-between ui-card px-4 py-3.5">
                <div>
                  <span className="ui-kicker">
                    Total{monthFilter ? " this month" : ""}
                  </span>
                  <div className="mt-0.5 font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                    {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <span className="font-mono text-base font-bold text-[color:var(--color-black)]">
                  ₱{total.toLocaleString()}
                </span>
              </div>
            )}

            {/* List */}
            {filtered.length === 0 ? (
              <p className="ui-card px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[color:var(--color-dark-gray)]">
                No expenses{monthFilter ? " for this month" : ""}.
              </p>
            ) : (
              <div className="space-y-2">
                {paginated.map((exp) =>
                  editingId === exp.id ? (
                    <div key={exp.id} className="ui-card p-4">
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                          className="ui-input ui-input--sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            value={editForm.amount}
                            onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                            className="ui-input ui-input--sm"
                          />
                          <input
                            type="date"
                            value={editForm.date}
                            onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                            className="ui-input ui-input--sm"
                          />
                        </div>
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="font-mono text-xs text-[color:var(--color-dark-gray)] hover:text-[color:var(--color-ink)]"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditSave(exp.id)}
                            className="ui-btn ui-btn--sm text-[color:var(--color-black)] hover:bg-[rgba(255,255,255,0.6)]"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={exp.id}
                      className="flex items-center justify-between gap-4 ui-card px-4 py-3.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[color:var(--color-black)]">
                          {exp.description}
                        </div>
                        <div className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
                          {formatDate(exp.date)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-sm font-bold text-[color:var(--color-black)]">
                          ₱{Number(exp.amount).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(exp)}
                          className="font-mono text-[10px] text-[color:var(--color-dark-gray)] hover:text-[color:var(--color-ink)]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(exp.id)}
                          className="font-mono text-[10px] text-rose-400 hover:text-rose-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="ui-btn ui-btn--sm"
                >
                  <Icon name="arrow-left" size={14} /> Prev
                </button>
                <span className="font-mono text-xs text-[color:var(--color-dark-gray)]">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="ui-btn ui-btn--sm"
                >
                  Next <Icon name="arrow-right" size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
