// web/src/components/ProfileMenu.jsx
import { useNavigate } from 'react-router-dom';

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function ProfileMenu({ onClose }) {
  const navigate = useNavigate();

  const MENU_ITEMS = [
    { icon: UserIcon,     label: 'Profile',        onClick: () => navigate('/profile') },
    { icon: FlagIcon,     label: 'Report an issue', onClick: () => {} },
    { icon: SettingsIcon, label: 'Settings',        onClick: () => {} },
  ];

  return (
    <div
      role="menu"
      aria-label="Account menu"
      className="absolute right-0 top-10 bg-chrome-surface border border-chrome-border rounded-xl shadow-card-hover z-50 py-1.5 min-w-[180px]"
    >
      {MENU_ITEMS.map(({ icon: Icon, label, onClick }) => (
        <button
          key={label}
          role="menuitem"
          onClick={() => { onClick(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-chrome-text hover:bg-chrome-deep transition-colors text-left"
        >
          <Icon />
          {label}
        </button>
      ))}

      {/* Divider before sign out */}
      <div className="my-1.5 border-t border-chrome-border" role="separator" />

      <button
        role="menuitem"
        onClick={onClose}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors text-left"
      >
        <SignOutIcon />
        Sign out
      </button>
    </div>
  );
}
