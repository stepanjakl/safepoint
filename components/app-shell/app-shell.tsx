import Link from 'next/link';
import type { ReactNode } from 'react';

// Placeholder furniture. These do nothing, so they stay out of the tab order
// and out of the accessibility tree rather than presenting themselves as
// controls that a keyboard or screen reader user can act on.
const placeholderGroups = [
  {
    label: 'Workspace',
    items: ['Inbox', 'Activity', 'Connections', 'Policies'],
  },
  {
    label: 'Recent',
    items: ['Weekly pricing', 'Supplier terms', 'Label queue'],
  },
];

const routes = [
  { href: '/', label: 'Promotion release' },
  { href: '/examples/support', label: 'Support handoff' },
  { href: '/examples/states', label: 'State gallery' },
];

export function AppShell({
  current,
  children,
}: {
  current: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <div className="app-sidebar">
        <div className="app-sidebar-brand">
          <span className="review-brand">
            <span className="review-brand-mark" aria-hidden="true">
              s.
            </span>{' '}
            Safepoint
          </span>
        </div>
        <nav className="app-nav" aria-label="Replays">
          <p className="app-nav-label">Replays</p>
          <ul>
            {routes.map((route) => (
              <li key={route.href}>
                <Link
                  href={route.href}
                  className="app-nav-item"
                  aria-current={route.href === current ? 'page' : undefined}
                >
                  {route.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {placeholderGroups.map((group) => (
          <div className="app-nav" key={group.label} aria-hidden="true">
            <p className="app-nav-label">{group.label}</p>
            <ul>
              {group.items.map((item) => (
                <li key={item}>
                  <span className="app-nav-item app-nav-placeholder">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="app-sidebar-foot">Replay workspace · Fictional data</p>
      </div>
      <div className="app-pane">{children}</div>
    </div>
  );
}
