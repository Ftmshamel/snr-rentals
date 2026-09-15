const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseISODate(iso) {
  if (!iso || typeof iso !== "string" || !ISO_RE.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing `date` (local). */
export function startOfWeekMonday(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDaysLocal(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

export function formatWeekRangeLabel(weekStartMonday) {
  const start = weekStartMonday;
  const end = addDaysLocal(start, 6);
  const y = start.getFullYear();
  const opts = { month: "short", day: "numeric" };
  const a = start.toLocaleDateString("en-US", opts);
  const b = end.toLocaleDateString("en-US", opts);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const dayEnd = end.getDate();
    const mon = start.toLocaleDateString("en-US", { month: "short" });
    return `${mon} ${start.getDate()}–${dayEnd}, ${y}`;
  }
  return `${a} – ${b}, ${y}`;
}

export function formatDayRowLabel(date) {
  const wk = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const day = date.getDate();
  return `${wk} ${day}`;
}

export function todayISOLocal() {
  return formatISODateLocal(new Date());
}

export function compareISODates(a, b) {
  if (!a || !b) return 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive range: every YYYY-MM-DD from pickUp to ret (strings). */
export function expandInclusiveDateRange(pickUpIso, retIso) {
  const a = parseISODate(pickUpIso);
  const b = parseISODate(retIso);
  if (!a || !b) return [];
  let start = a;
  let end = b;
  if (start > end) [start, end] = [end, start];
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(formatISODateLocal(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function isDateInBookingRange(dayIso, pickUpIso, retIso) {
  if (!dayIso || !pickUpIso || !retIso) return false;
  return compareISODates(dayIso, pickUpIso) >= 0 && compareISODates(dayIso, retIso) <= 0;
}

export function compareTimesHHMM(ta, tb) {
  const a = ta || "00:00";
  const b = tb || "00:00";
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareBookingStart(a, b) {
  return (
    compareISODates(a.PICK_UP_DATE, b.PICK_UP_DATE) ||
    compareTimesHHMM(a.PICK_UP_TIME, b.PICK_UP_TIME) ||
    compareISODates(a.RETURN_DATE, b.RETURN_DATE) ||
    compareTimesHHMM(a.RETURN_TIME, b.RETURN_TIME)
  );
}

export function bookingsOverlap(a, b) {
  if (!a.PICK_UP_DATE || !a.RETURN_DATE || !b.PICK_UP_DATE || !b.RETURN_DATE) return false;

  const cmpAPickBRet = compareISODates(a.PICK_UP_DATE, b.RETURN_DATE);
  const cmpBPickARet = compareISODates(b.PICK_UP_DATE, a.RETURN_DATE);

  if (cmpAPickBRet > 0 || cmpBPickARet > 0) return false;

  if (cmpAPickBRet === 0) {
    if (compareTimesHHMM(a.PICK_UP_TIME || "00:00", b.RETURN_TIME || "23:59") >= 0) return false;
  }

  if (cmpBPickARet === 0) {
    if (compareTimesHHMM(b.PICK_UP_TIME || "00:00", a.RETURN_TIME || "23:59") >= 0) return false;
  }

  return true;
}

export function distributeToUnits(bookings, units) {
  const realUnitCount = Math.max(Number(units) || 1, 1);
  const sorted = [...bookings].sort(compareBookingStart);
  const slots = Array.from({ length: realUnitCount }, () => []);
  const overflow = [];

  for (const booking of sorted) {
    const unitIndex = slots.findIndex(
      (slot) => !slot.some((placed) => bookingsOverlap(booking, placed)),
    );
    if (unitIndex !== -1) slots[unitIndex].push(booking);
    else overflow.push(booking);
  }

  return overflow.length ? [...slots, overflow] : slots;
}
