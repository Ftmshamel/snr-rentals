import Header from "./components/Header.jsx";
import Hero from "./components/Hero.jsx";
import Marquee from "./components/Marquee.jsx";
import Cameras from "./components/Cameras.jsx";
import HowToRent from "./components/HowToRent.jsx";
import Terms from "./components/Terms.jsx";
import FAQ from "./components/FAQ.jsx";
import Contact from "./components/Contact.jsx";
import Footer from "./components/Footer.jsx";
import BackToTop from "./components/BackToTop.jsx";
import PublicBooking from "./pages/PublicBooking.jsx";
import TrackBooking from "./pages/TrackBooking.jsx";
import Account, { RewardsPage } from "./pages/Account.jsx";
import Rewards from "./components/Rewards.jsx";
import MemberHome from "./pages/MemberHome.jsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.jsx";
import MemberShell from "./components/MemberShell.jsx";
import { looksSignedIn, useMember } from "./hooks/useMember.js";
import SignInModal from "./components/SignInModal.jsx";
import "./booking.css";
import "./members.css";

export default function App() {
  // The sign-in window is shared by every page.
  return (
    <>
      <Page />
      <SignInModal />
    </>
  );
}

function Page() {
  const path = window.location.pathname;
  if (path.startsWith("/track")) return <AppPage withShell><TrackBooking /></AppPage>;
  if (path.startsWith("/account")) return <AppPage><Account /></AppPage>;
  if (path.startsWith("/rewards")) return <AppPage><RewardsPage /></AppPage>;
  if (path.startsWith("/book")) return <AppPage withShell><PublicBooking /></AppPage>;
  if (path.startsWith("/privacy")) return <AppPage withShell><PrivacyPolicy /></AppPage>;
  return <Home />;
}

// Booking-style pages. `withShell`: signed-in renters get the member
// navigation around them (the page's own "Back to site" bar hides itself).
function AppPage({ withShell = false, children }) {
  const member = useMember();
  const shell = withShell && looksSignedIn(member);
  return (
    <div className="booking-app">
      <div className="grain" aria-hidden="true" />
      {shell ? <MemberShell member={member}>{children}</MemberShell> : children}
      <Footer compact />
    </div>
  );
}

// "/": signed-in renters get their own home; everyone else the landing page.
function Home() {
  const member = useMember();
  // Signed in (or restoring a session): the member home, which shows a
  // skeleton until the account has loaded — never the landing page first.
  if (looksSignedIn(member)) {
    return (
      <div className="booking-app">
        <div className="grain" aria-hidden="true" />
        <MemberHome member={member} />
        <Footer compact />
      </div>
    );
  }
  return <Landing />;
}

function Landing() {
  return (
    <>
      <div className="grain" aria-hidden="true" />
      <Header />
      <main>
        <Hero />
        <Marquee />
        <Cameras />
        <Marquee reverse />
        <HowToRent />
        <Rewards />
        <Terms />
        <FAQ />
        <Contact />
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
