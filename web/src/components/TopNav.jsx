// web/src/components/TopNav.jsx
import { useState, useRef, useEffect } from 'react';
import { Home, Briefcase } from 'lucide-react';
import ProfileMenu from './ProfileMenu';

const NAV_SECTIONS = [
  { id: 'home',    label: 'Home',        Icon: Home },
  { id: 'tracker', label: 'Job Tracker', Icon: Briefcase },
];

export default function TopNav({ activeSection, onSectionChange }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Close profile menu on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function handleOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setProfileOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [profileOpen]);

  return (
    <header className="bg-chrome-bg border-b border-chrome-border flex-shrink-0">
      <div className="px-4 sm:px-8 h-12 flex items-center justify-between gap-6">

        {/* Left: Wordmark */}
        <span
          className="font-display text-[18px] font-bold text-chrome-text leading-none tracking-tight flex-shrink-0"
          aria-label="Reach"
        >
          Reach
        </span>

        {/* Center: Section tabs */}
        <nav aria-label="Main sections" className="flex items-stretch h-full gap-1">
          {NAV_SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => onSectionChange(id)}
              aria-current={activeSection === id ? 'page' : undefined}
              className={`
                flex items-center gap-1.5 px-3 text-[13px] font-display font-semibold border-b-2 transition-all duration-150
                ${activeSection === id
                  ? 'border-accent text-chrome-text'
                  : 'border-transparent text-chrome-muted hover:text-chrome-text'}
              `}
            >
              <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        {/* Right: Profile avatar button */}
        <div className="relative flex-shrink-0" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(v => !v)}
            aria-label="Open account menu"
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center font-display font-bold text-[13px] hover:bg-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
          >
            Y
          </button>
          {profileOpen && (
            <ProfileMenu
              onClose={() => setProfileOpen(false)}
              onSettings={() => { onSectionChange('settings'); setProfileOpen(false); }}
            />
          )}
        </div>
      </div>
    </header>
  );
}
