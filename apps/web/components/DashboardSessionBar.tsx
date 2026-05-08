"use client";

export function DashboardSessionBar({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="dashboard-top-actions">
      <button type="button" className="dashboard-logout-btn" onClick={onLogout}>
        <svg
          className="dashboard-logout-icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Déconnexion
      </button>
    </div>
  );
}
