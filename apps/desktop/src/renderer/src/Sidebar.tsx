import React, { useEffect, useState } from 'react';
import type { NavId } from './App';

interface SidebarProps {
  items: ReadonlyArray<{ id: NavId; label: string }>;
  active: NavId;
  onSelect: (id: NavId) => void;
}

const NavIcon: React.FC<{ id: NavId; active: boolean }> = ({ id, active }) => {
  const className = `sus-icon ${active ? 'is-active' : 'is-neutral'}`;
  const gradientId = `sus-gradient-${id}`;

  const baseProps = {
    className,
    viewBox: '0 0 24 24',
    role: 'img' as const,
    'aria-hidden': true,
    style: { ['--sus-gradient-id' as string]: `url(#${gradientId})` } as React.CSSProperties,
    stroke: active ? `url(#${gradientId})` : undefined,
  };

  switch (id) {
    case 'home':
      return (
        <svg {...baseProps}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop className="sus-stop-1" offset="0%" />
              <stop className="sus-stop-2" offset="35%" />
              <stop className="sus-stop-3" offset="70%" />
              <stop className="sus-stop-4" offset="100%" />
            </linearGradient>
          </defs>
          <path className="icon-stroke" d="M4 11.5 12 5l8 6.5" strokeWidth="1.8" />
          <path className="icon-stroke" d="M6.5 10.5V20h11V10.5" strokeWidth="1.8" />
          <path className="icon-stroke" d="M10 20v-5h4v5" strokeWidth="1.8" />
        </svg>
      );
    case 'modes':
      return (
        <svg {...baseProps}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop className="sus-stop-1" offset="0%" />
              <stop className="sus-stop-2" offset="35%" />
              <stop className="sus-stop-3" offset="70%" />
              <stop className="sus-stop-4" offset="100%" />
            </linearGradient>
          </defs>
          <path className="icon-stroke" d="M5 7h14" strokeWidth="1.8" />
          <circle className="icon-stroke" cx="9" cy="7" r="2.2" strokeWidth="1.8" />
          <path className="icon-stroke" d="M5 12h14" strokeWidth="1.8" />
          <circle className="icon-stroke" cx="15" cy="12" r="2.2" strokeWidth="1.8" />
          <path className="icon-stroke" d="M5 17h14" strokeWidth="1.8" />
          <circle className="icon-stroke" cx="11" cy="17" r="2.2" strokeWidth="1.8" />
        </svg>
      );
    case 'vocabulary':
      return (
        <svg {...baseProps}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop className="sus-stop-1" offset="0%" />
              <stop className="sus-stop-2" offset="35%" />
              <stop className="sus-stop-3" offset="70%" />
              <stop className="sus-stop-4" offset="100%" />
            </linearGradient>
          </defs>
          <path className="icon-stroke" d="M6 5h9a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H6" strokeWidth="1.8" />
          <path className="icon-stroke" d="M6 5v12" strokeWidth="1.8" />
          <path className="icon-stroke" d="M9.5 10h5" strokeWidth="1.8" />
        </svg>
      );
    case 'shortcuts':
      return (
        <svg {...baseProps}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop className="sus-stop-1" offset="0%" />
              <stop className="sus-stop-2" offset="35%" />
              <stop className="sus-stop-3" offset="70%" />
              <stop className="sus-stop-4" offset="100%" />
            </linearGradient>
          </defs>
          <path className="icon-stroke" d="M7 7h7a3 3 0 0 1 0 6h-3" strokeWidth="1.8" />
          <path className="icon-stroke" d="M17 17h-7a3 3 0 0 1 0-6h3" strokeWidth="1.8" />
          <path className="icon-stroke" d="M9 12h6" strokeWidth="1.8" />
        </svg>
      );
    case 'configuration':
      return (
        <svg {...baseProps}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop className="sus-stop-1" offset="0%" />
              <stop className="sus-stop-2" offset="35%" />
              <stop className="sus-stop-3" offset="70%" />
              <stop className="sus-stop-4" offset="100%" />
            </linearGradient>
          </defs>
          <circle className="icon-stroke" cx="12" cy="12" r="3.2" strokeWidth="1.8" />
          <path className="icon-stroke" d="M12 4.5v2.5" strokeWidth="1.8" />
          <path className="icon-stroke" d="M12 17v2.5" strokeWidth="1.8" />
          <path className="icon-stroke" d="M4.5 12h2.5" strokeWidth="1.8" />
          <path className="icon-stroke" d="M17 12h2.5" strokeWidth="1.8" />
          <path className="icon-stroke" d="M6.8 6.8l1.8 1.8" strokeWidth="1.8" />
          <path className="icon-stroke" d="M15.4 15.4l1.8 1.8" strokeWidth="1.8" />
          <path className="icon-stroke" d="M6.8 17.2l1.8-1.8" strokeWidth="1.8" />
          <path className="icon-stroke" d="M15.4 8.6l1.8-1.8" strokeWidth="1.8" />
        </svg>
      );
    case 'sound':
      return (
        <svg {...baseProps}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop className="sus-stop-1" offset="0%" />
              <stop className="sus-stop-2" offset="35%" />
              <stop className="sus-stop-3" offset="70%" />
              <stop className="sus-stop-4" offset="100%" />
            </linearGradient>
          </defs>
          <path className="icon-stroke" d="M5 10h4l4-3v10l-4-3H5z" strokeWidth="1.8" />
          <path className="icon-stroke" d="M16 9.5c1.6 1.6 1.6 4.4 0 6" strokeWidth="1.8" />
          <path className="icon-stroke" d="M18.5 7c3.1 3.1 3.1 7.9 0 11" strokeWidth="1.8" />
        </svg>
      );
    case 'models':
      return (
        <svg {...baseProps}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop className="sus-stop-1" offset="0%" />
              <stop className="sus-stop-2" offset="35%" />
              <stop className="sus-stop-3" offset="70%" />
              <stop className="sus-stop-4" offset="100%" />
            </linearGradient>
          </defs>
          <circle className="icon-stroke" cx="6" cy="12" r="2.3" strokeWidth="1.8" />
          <circle className="icon-stroke" cx="18" cy="7" r="2.3" strokeWidth="1.8" />
          <circle className="icon-stroke" cx="18" cy="17" r="2.3" strokeWidth="1.8" />
          <path className="icon-stroke" d="M7.8 10.8 15.6 8.2" strokeWidth="1.8" />
          <path className="icon-stroke" d="M7.8 13.2 15.6 15.8" strokeWidth="1.8" />
        </svg>
      );
    case 'history':
      return (
        <svg {...baseProps}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop className="sus-stop-1" offset="0%" />
              <stop className="sus-stop-2" offset="35%" />
              <stop className="sus-stop-3" offset="70%" />
              <stop className="sus-stop-4" offset="100%" />
            </linearGradient>
          </defs>
          <circle className="icon-stroke" cx="12" cy="12" r="7" strokeWidth="1.8" />
          <path className="icon-stroke" d="M12 8v4l3 2" strokeWidth="1.8" />
        </svg>
      );
    case 'diagnostics':
      return (
        <svg {...baseProps}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop className="sus-stop-1" offset="0%" />
              <stop className="sus-stop-2" offset="35%" />
              <stop className="sus-stop-3" offset="70%" />
              <stop className="sus-stop-4" offset="100%" />
            </linearGradient>
          </defs>
          <rect className="icon-stroke" x="5" y="5" width="14" height="14" rx="3" strokeWidth="1.8" />
          <path className="icon-stroke" d="M7.5 12h3l2-4 2.5 8 1.8-4H18.5" strokeWidth="1.8" />
        </svg>
      );
    default:
      return (
        <svg {...baseProps}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop className="sus-stop-1" offset="0%" />
              <stop className="sus-stop-2" offset="35%" />
              <stop className="sus-stop-3" offset="70%" />
              <stop className="sus-stop-4" offset="100%" />
            </linearGradient>
          </defs>
          <circle className="icon-stroke" cx="12" cy="12" r="6" strokeWidth="1.8" />
        </svg>
      );
  }
};

export const Sidebar: React.FC<SidebarProps> = ({ items, active, onSelect }) => {
  const [versionLabel, setVersionLabel] = useState('Susurrare');

  useEffect(() => {
    window.susurrare.app
      .info()
      .then((info) => {
        setVersionLabel(info.version ? `Susurrare v${info.version}` : info.name ?? 'Susurrare');
      })
      .catch(() => undefined);
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="app-icon" aria-hidden />
        <div>
          <div className="brand">Susurrare</div>
          <div className="subtitle">It&apos;s Latin for Whisper</div>
        </div>
      </div>
      <nav className="nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="nav-icon" aria-hidden>
              <NavIcon id={item.id} active={active === item.id} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="upgrade-pill">{versionLabel}</div>
      </div>
    </aside>
  );
};
