import { useState } from "react";
import { apiPostJson } from "../utils/api.js";
import { BUSINESS, CONTACT } from "../data/content.js";
import { BookingTopBar } from "./PublicBooking.jsx";

// Privacy Policy (RA 10173 — Data Privacy Act of 2012) and the form renters
// use to ask for a copy, a correction or the deletion of their data. A
// request is proven by the booking's reference code + the contact number on
// it (backend lib/public/privacyRequest.js) and handled by the owner on the
// admin's /privacy page.
const UPDATED = "October 14, 2026";

function RequestForm() {
  const [form, setForm] = useState({ ref: "", contact: "", type: "", details: "" });
  const [state, setState] = useState({ loading: false, error: null, done: null });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.type) return setState({ loading: false, error: "Choose what you'd like us to do.", done: null });
    setState({ loading: true, error: null, done: null });
    try {
      const res = await apiPostJson("/api/public?action=privacy-request", form);
      setState({ loading: false, error: null, done: res.message });
      setForm({ ref: "", contact: "", type: "", details: "" });
    } catch (err) {
      setState({ loading: false, error: err.message || "Couldn't send the request.", done: null });
    }
  }

  if (state.done) {
    return (
      <div className="pp-done" role="status">
        <strong>✓ Request received.</strong> {state.done}
      </div>
    );
  }
  return (
    <form className="pp-form" onSubmit={submit}>
      <div className="bk-grid-2">
        <label className="bk-field">
          <span className="bk-label">Booking reference code</span>
          <input className="bk-input" value={form.ref} onChange={set("ref")} placeholder="PUBLIC-…" required autoCapitalize="characters" />
        </label>
        <label className="bk-field">
          <span className="bk-label">Contact number used in that booking</span>
          <input className="bk-input" value={form.contact} onChange={set("contact")} placeholder="09XX XXX XXXX" inputMode="tel" required />
        </label>
      </div>
      <label className="bk-field">
        <span className="bk-label">What would you like us to do?</span>
        <select className="bk-input" value={form.type} onChange={set("type")} required>
          <option value="" disabled>Choose one</option>
          <option value="access">Send me a copy of my personal data</option>
          <option value="correction">Correct my personal data</option>
          <option value="deletion">Delete my personal data (IDs, photos, contact details)</option>
        </select>
      </label>
      <label className="bk-field">
        <span className="bk-label">Details {form.type === "correction" ? "(what needs to be corrected)" : "(optional)"}</span>
        <textarea className="bk-input pp-textarea" value={form.details} onChange={set("details")} rows={3} maxLength={2000} />
      </label>
      {form.type === "deletion" && (
        <p className="pp-note">
          We can delete your data once the rental is finished or cancelled. We keep only what the law requires us to
          keep for our books (rental dates, camera, unit serial number and amounts), without your name, IDs or contact
          details.
        </p>
      )}
      {state.error && <div className="bk-error">✕ {state.error}</div>}
      <button type="submit" className="btn btn--solid" disabled={state.loading}>
        {state.loading ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}

export default function PrivacyPolicy() {
  return (
    <main className="bk-page pp">
      <BookingTopBar />
      <header className="bk-head">
        <p className="bk-kicker">Data Privacy Act of 2012 (RA 10173)</p>
        <h1 className="bk-title">Privacy Policy</h1>
        <p className="bk-sub bk-sub--small">Last updated {UPDATED}</p>
      </header>

      <article className="bk-panel pp-doc">
        <h2>1. Who we are</h2>
        <p>
          {BUSINESS.name} (DTI Business Name Reg. No. {BUSINESS.dtiNumber}) rents out cameras and photography equipment
          in {CONTACT.areas.replace(/ \/ /g, ", ")}. We are the personal information controller for the data you give us
          through this website. Contact us at <a href={CONTACT.phoneHref}>{CONTACT.phone}</a> or on our Facebook page,{" "}
          <a href={CONTACT.facebookUrl} target="_blank" rel="noreferrer">{CONTACT.facebookName}</a>.
        </p>

        <h2>2. What we collect</h2>
        <ul>
          <li><strong>Booking details:</strong> your name, contact number, Facebook name and profile link, address, trip type and destination, and your rental schedule.</li>
          <li><strong>Requirements:</strong> two valid IDs, a proof of billing, a selfie holding your ID, your proof of downpayment and your e-signature on the contract.</li>
          <li><strong>Delivery details</strong> (only if you choose delivery): the recipient's name and number, the address, landmark, notes and the map pin.</li>
          <li><strong>Account details</strong> (only if you sign in): your name, email and profile photo from Google or Facebook, and your bookings with us.</li>
        </ul>

        <h2>3. Why we collect it</h2>
        <ul>
          <li>To verify your identity before we hand over equipment, and to prevent fraud and loss.</li>
          <li>To process your booking, prepare your rental contract, and contact you about it.</li>
          <li>To book the Lalamove rider for deliveries and returns.</li>
          <li>To give signed-in renters their member tier and perks.</li>
          <li>To keep the records the law requires for our business and taxes.</li>
        </ul>
        <p>
          We process your data with your consent, which you give on the booking form, and because we need it to carry
          out the rental agreement you sign with us.
        </p>

        <h2>4. Who we share it with</h2>
        <ul>
          <li><strong>Lalamove</strong>, for deliveries only: the recipient's name, number, address and map pin, so the rider can find you.</li>
          <li><strong>Our service providers</strong>, who store and run the system for us under their own security safeguards: Google Firebase (database and sign-in) and Vercel (website hosting).</li>
        </ul>
        <p>We never sell your data or share it for advertising.</p>

        <h2>5. How we protect it</h2>
        <p>
          The website uses an encrypted (HTTPS) connection. Your IDs and documents are stored apart from the booking list
          and can be opened only by the S&amp;R Rentals owner and staff after they log in. The Track page shows only your
          first name and your booking's status.
        </p>

        <h2>6. How long we keep it</h2>
        <p>
          We keep your booking and requirements while the rental is active and afterwards for as long as we need them
          for our records. After your rental is finished you may ask us to delete your personal data (Section 8). The
          rental's dates, camera and amounts are kept for accounting and tax purposes, without your personal details.
        </p>

        <h2>7. Your browser</h2>
        <p>
          We don't use advertising or tracking cookies. The booking form saves your unfinished booking in your own
          browser so you don't lose your progress; “Start Over” clears it. If you sign in, your browser remembers your
          session until you sign out.
        </p>

        <h2>8. Your rights</h2>
        <p>
          Under the Data Privacy Act you have the right to be informed, to access your data, to object, to have it
          corrected, to have it erased or blocked, to data portability, and to file a complaint with the National
          Privacy Commission (<a href="https://privacy.gov.ph" target="_blank" rel="noreferrer">privacy.gov.ph</a>).
          Send a request with the form below.
        </p>
      </article>

      <section className="bk-panel pp-request" id="request">
        <h2 className="bk-panel__title">Privacy request</h2>
        <p className="bk-sub bk-sub--small">
          To protect you, we match your booking's reference code with the contact number you booked with.
        </p>
        <RequestForm />
      </section>
    </main>
  );
}
