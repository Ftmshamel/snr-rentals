import { useEffect, useRef, useState } from "react";
import { apiGetJson, apiPostJson, apiDeleteJson } from "../utils/api.js";

export default function DateNoteEditor({ selectedDate }) {
  const [note, setNote]       = useState("");
  const [draft, setDraft]     = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [status, setStatus]   = useState("idle"); // "idle" | "saving" | "saved"

  const noteRef = useRef(null);

  // Load note when date changes
  useEffect(() => {
    if (!selectedDate) return;
    setNote("");
    setDraft("");
    setIsEditing(false);
    setIsExpanded(false);
    setStatus("idle");

    apiGetJson(`/api/date-notes?date=${encodeURIComponent(selectedDate)}`)
      .then((data) => {
        const n = data.note || "";
        setNote(n);
      })
      .catch(() => {});
  }, [selectedDate]);

  // Detect if the collapsed view overflows 6 lines
  useEffect(() => {
    if (!noteRef.current || isExpanded) return;
    setIsOverflowing(noteRef.current.scrollHeight > noteRef.current.clientHeight);
  }, [note, isExpanded]);

  async function save() {
    if (!selectedDate) return;
    const text = draft.trim();
    setStatus("saving");
    try {
      if (!text) {
        await apiDeleteJson(`/api/date-notes?date=${encodeURIComponent(selectedDate)}`);
      } else {
        await apiPostJson("/api/date-notes", { date: selectedDate, note: text });
      }
      setNote(text);
      setStatus("saved");
      setIsEditing(false);
      setIsExpanded(false);
    } catch {
      setStatus("idle");
    }
  }

  function startEditing() {
    setDraft(note);
    setIsEditing(true);
    setStatus("idle");
  }

  function cancelEditing() {
    setIsEditing(false);
    setDraft("");
    setStatus("idle");
  }

  if (!selectedDate) return null;

  return (
    <div className="mb-3 ui-card px-4 py-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="ui-kicker text-[0.6rem]">
          Date Note
        </span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-[color:var(--color-dark-gray)]">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
          </span>
          {!isEditing && (
            <button
              type="button"
              onClick={startEditing}
              className="font-mono text-[10px] text-[color:var(--color-dark-gray)] underline hover:text-[color:var(--color-ink)]"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note for this date…"
            rows={4}
            className="ui-input w-full resize-none font-mono text-xs text-[color:var(--color-black)] placeholder-[color:var(--color-dark-gray)] focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={status === "saving"}
              className="ui-btn ui-btn--sm ui-btn--solid text-white hover:bg-[color:var(--color-ink)] disabled:opacity-50"
            >
              {status === "saving" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              className="ui-btn ui-btn--sm text-[color:var(--color-dark-gray)] hover:bg-[rgba(255,255,255,0.6)]"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div>
          <p
            ref={noteRef}
            className={`whitespace-pre-wrap font-mono text-xs text-[color:var(--color-ink)] ${!isExpanded ? "line-clamp-6" : ""}`}
          >
            {note || (
              <span className="text-[color:var(--color-dark-gray)]">No note for this date.</span>
            )}
          </p>
          {isOverflowing && !isExpanded && (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="mt-1 font-mono text-[10px] text-[color:var(--color-dark-gray)] underline hover:text-[color:var(--color-ink)]"
            >
              Show more
            </button>
          )}
          {isExpanded && (
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="mt-1 font-mono text-[10px] text-[color:var(--color-dark-gray)] underline hover:text-[color:var(--color-ink)]"
            >
              Show less
            </button>
          )}
        </div>
      )}
    </div>
  );
}
