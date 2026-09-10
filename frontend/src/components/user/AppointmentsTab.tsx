import { useState, useEffect } from "react";

interface Appointment {
  id: string;
  counsellor_id: string;
  counsellor_name: string;
  counsellor_title: string;
  service: string;
  date: string;
  time: string;
  datetime_iso: string;
  mode: string;
  location: string;
  duration: string;
  status: string;
  is_upcoming: boolean;
  notes: string;
}

interface Props {
  user: { id: string; name: string; email: string; role: string };
  onNavigate: (tab: string) => void;
}

export default function AppointmentsTab({ user, onNavigate }: Props) {
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [past, setPast] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState("2026-09-22");
  const [newTime, setNewTime] = useState("04:00 PM IST");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  useEffect(() => {
    loadAppointments();
  }, [user.id]);

  async function loadAppointments() {
    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${baseUrl}/api/user/${user.id}/appointments`);
      if (res.ok) {
        const data = await res.json();
        setUpcoming(data.upcoming || []);
        setPast(data.past || []);
      }
    } catch (err) {
      console.error("Failed to load appointments:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRescheduleSubmit() {
    if (!rescheduleAppt) return;
    try {
      setRescheduleLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(
        `${baseUrl}/api/user/${user.id}/appointments/${rescheduleAppt.id}/reschedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            new_date: newDate,
            new_time: newTime,
          }),
        }
      );

      if (res.ok) {
        setFeedbackMsg(`Appointment rescheduled to ${newDate} at ${newTime}.`);
        setRescheduleAppt(null);
        await loadAppointments();
        setTimeout(() => setFeedbackMsg(null), 5000);
      } else {
        alert("Unable to reschedule appointment. Please try another slot.");
      }
    } catch (err) {
      console.error("Reschedule failed:", err);
      alert("Error contacting appointment service.");
    } finally {
      setRescheduleLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" style={{ background: "#f7f8fb" }}>
      <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                Care Schedule
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
              My Appointments
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              View and manage your upcoming psychological support and check-in consultations.
            </p>
          </div>

          <button
            onClick={() => onNavigate("My Support")}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-all flex items-center gap-2 self-start md:self-center"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
            </svg>
            Contact Counsellor Team
          </button>
        </div>

        {/* Feedback alert */}
        {feedbackMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{feedbackMsg}</span>
            </div>
            <button onClick={() => setFeedbackMsg(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">✕</button>
          </div>
        )}

        {/* UPCOMING APPOINTMENTS SECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
              Upcoming Schedule ({upcoming.length})
            </h2>
            <span className="text-xs text-slate-500">Regular wellness reviews</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-sm animate-pulse bg-white rounded-2xl border border-slate-200">
              Loading appointment schedule...
            </div>
          ) : upcoming.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcoming.map((appt) => (
                <div
                  key={appt.id}
                  className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between space-y-4 hover:border-indigo-200 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide block">
                          {appt.service}
                        </span>
                        <h3 className="font-bold text-slate-900 text-base mt-0.5" style={{ fontFamily: "Manrope, sans-serif" }}>
                          {appt.counsellor_name}
                        </h3>
                        <p className="text-xs text-slate-500">{appt.counsellor_title}</p>
                      </div>

                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 flex-shrink-0">
                        {appt.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Date</span>
                        <strong className="text-slate-800">{appt.date}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Time</span>
                        <strong className="text-slate-800">{appt.time}</strong>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-slate-200/60 mt-1">
                        <span className="text-slate-400 block text-[11px]">Mode</span>
                        <span className="text-slate-700 font-medium">{appt.mode}</span>
                      </div>
                    </div>

                    {appt.notes && (
                      <p className="text-xs text-slate-500 italic line-clamp-2">
                        "{appt.notes}"
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => setSelectedAppt(appt)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-all text-center"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => {
                        setRescheduleAppt(appt);
                        setNewDate(appt.date);
                      }}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-all text-center"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-sm bg-white rounded-2xl border border-slate-200">
              No upcoming appointments found.
            </div>
          )}
        </div>

        {/* PAST APPOINTMENTS SECTION */}
        <div className="space-y-4 pt-4">
          <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
            Past Consultations ({past.length})
          </h2>

          {past.length > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-xs">
              {past.map((appt) => (
                <div key={appt.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">{appt.counsellor_name}</h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Completed
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{appt.service} • {appt.duration}</p>
                    <p className="text-xs text-slate-600 mt-1">{appt.notes}</p>
                  </div>

                  <div className="text-left sm:text-right flex-shrink-0">
                    <span className="text-xs font-bold text-slate-700 block">{appt.date}</span>
                    <span className="text-[11px] text-slate-500">{appt.time}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
              No past appointment history available.
            </div>
          )}
        </div>
      </div>

      {/* APPOINTMENT DETAILS MODAL */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">
                  Appointment Overview
                </span>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {selectedAppt.counsellor_name}
                </h3>
                <p className="text-xs text-slate-500">{selectedAppt.counsellor_title}</p>
              </div>

              <button
                onClick={() => setSelectedAppt(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-all"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <span className="text-slate-400 block text-[11px]">Consultation Focus</span>
                <p className="font-semibold text-slate-800">{selectedAppt.service}</p>
                <p className="text-slate-600">{selectedAppt.notes}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Date</span>
                  <strong className="text-slate-800">{selectedAppt.date}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Time</span>
                  <strong className="text-slate-800">{selectedAppt.time}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Duration</span>
                  <strong className="text-slate-800">{selectedAppt.duration}</strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[11px]">Status</span>
                  <strong className="text-indigo-700">{selectedAppt.status}</strong>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[11px]">Channel / Location</span>
                <p className="font-medium text-slate-800">{selectedAppt.mode}</p>
                <p className="text-slate-500 text-[11px]">{selectedAppt.location}</p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedAppt(null)}
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {rescheduleAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>
                  Reschedule Appointment
                </h3>
                <p className="text-xs text-slate-500">With {rescheduleAppt.counsellor_name}</p>
              </div>

              <button
                onClick={() => setRescheduleAppt(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-all"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Select New Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 outline-none text-slate-800 focus:border-indigo-500 bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Select Time Slot</label>
                <select
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 outline-none text-slate-800 focus:border-indigo-500 bg-slate-50"
                >
                  <option value="10:00 AM IST">10:00 AM IST (Morning)</option>
                  <option value="11:30 AM IST">11:30 AM IST (Late Morning)</option>
                  <option value="02:30 PM IST">02:30 PM IST (Afternoon)</option>
                  <option value="04:00 PM IST">04:00 PM IST (Evening)</option>
                  <option value="05:30 PM IST">05:30 PM IST (Late Evening)</option>
                </select>
              </div>

              <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-indigo-900 text-[11px] leading-relaxed">
                Your counsellor will be automatically notified of your updated schedule preference.
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={() => setRescheduleAppt(null)}
                disabled={rescheduleLoading}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleRescheduleSubmit}
                disabled={rescheduleLoading}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
              >
                {rescheduleLoading ? "Updating..." : "Confirm Reschedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
