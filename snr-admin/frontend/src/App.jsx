import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import MonthlySchedule from "./pages/MonthlySchedule.jsx";
import CameraList from "./pages/CameraList.jsx";
import CameraCalendar from "./pages/CameraCalendar.jsx";
import AddOnList from "./pages/AddOnList.jsx";
import AddOnCalendar from "./pages/AddOnCalendar.jsx";
import QuotationGenerator from "./pages/QuotationGenerator.jsx";
import Approvals from "./pages/Approvals.jsx";
import RentalsTable from "./pages/RentalsTable.jsx";
import Analytics from "./pages/Analytics.jsx";
import Expenses from "./pages/Expenses.jsx";
import Catalog from "./pages/Catalog.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Rewards from "./pages/Rewards.jsx";

export default function App() {
  const [authed, setAuthed] = useState(() =>
    Boolean(localStorage.getItem("auth_token")),
  );

  if (!authed) {
    return (
      <>
        <div className="grain" aria-hidden="true" />
        <Login onLogin={() => setAuthed(true)} />
      </>
    );
  }

  const isOwner = localStorage.getItem("auth_role") === "owner";

  return (
    <div className="min-h-screen">
      {/* Animated film grain over everything — the poster theme's texture. */}
      <div className="grain" aria-hidden="true" />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<MonthlySchedule />} />
        <Route path="/camera" element={<Navigate to="/cameras" replace />} />
        <Route path="/camera/:cameraName" element={<CameraCalendar />} />
        <Route path="/cameras" element={<CameraList />} />
        <Route path="/cameras/:cameraName" element={<CameraCalendar />} />
        {/* AddOnList/AddOnCalendar existed but had no route, so the add-on
            pages were unreachable and AddOnRow's links 404'd. */}
        <Route path="/addon" element={<Navigate to="/addons" replace />} />
        <Route path="/addons" element={<AddOnList />} />
        <Route path="/addons/:addonName" element={<AddOnCalendar />} />
        <Route path="/quotation" element={<QuotationGenerator />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/rentals" element={<RentalsTable />} />
        <Route path="/analytics" element={isOwner ? <Analytics /> : <Navigate to="/" replace />} />
        <Route path="/expenses" element={isOwner ? <Expenses /> : <Navigate to="/" replace />} />
        <Route path="/catalog" element={isOwner ? <Catalog /> : <Navigate to="/" replace />} />
        <Route path="/rewards" element={isOwner ? <Rewards /> : <Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
