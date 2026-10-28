'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Navbar.module.css';
import { useSession } from '@/context/SessionContext';

export function Navbar() {
  const pathname = usePathname();
  const session = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  // In study mode (/session/run), hide navbar for quiet participant environment
  if (pathname === '/session/run') {
    return null;
  }

  const navItems = [
    { label: 'Home', href: '/' },
    { label: 'Setup Session', href: '/session' },
    { label: 'Live Demo', href: '/demo' },
    { label: 'Report Viewer', href: '/report' },
    { label: 'Archives', href: '/sessions' },
    { label: 'Device & Hardware', href: '/device' },
    { label: 'Methodology', href: '/method' },
  ];

  const isConnected = session.connectionStatus === 'CONNECTED';
  const isConnecting = session.connectionStatus === 'CONNECTING';

  return (
    <nav className={styles.navbar} aria-label="Main Navigation">
      <div className={styles.brandGroup}>
        <Link href="/" className={styles.brandLink}>
          <span>StressKB</span>
          <span className={styles.brandBadge}>EDGE</span>
        </Link>
      </div>

      <div className={styles.navLinks}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className={styles.rightGroup}>
        <Link
          href="/device"
          className={styles.devicePill}
          title="Click to view hardware connection & console"
        >
          <span
            className={`${styles.dot} ${
              isConnected ? styles.dotConnected : isConnecting ? styles.dotConnecting : styles.dotDisconnected
            }`}
          />
          <span>{isConnected ? 'ESP32 Online' : isConnecting ? 'Connecting...' : 'Hardware Offline'}</span>
        </Link>

        <button
          className={styles.mobileMenuToggle}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          ☰
        </button>
      </div>

      {mobileOpen && (
        <div className={styles.mobileMenu}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${pathname === item.href ? styles.navLinkActive : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
