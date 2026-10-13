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
import Account from "./pages/Account.jsx";
import Rewards from "./components/Rewards.jsx";
import "./booking.css";
import "./members.css";

export default function App() {
  if (window.location.pathname.startsWith("/track")) {
    return (
      <div className="booking-app">
        <div className="grain" aria-hidden="true" />
        <TrackBooking />
      </div>
    );
  }

  if (window.location.pathname.startsWith("/account")) {
    return (
      <div className="booking-app">
        <div className="grain" aria-hidden="true" />
        <Account />
      </div>
    );
  }

  if (window.location.pathname.startsWith("/book")) {
    return (
      <div className="booking-app">
        <div className="grain" aria-hidden="true" />
        <PublicBooking />
      </div>
    );
  }

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
