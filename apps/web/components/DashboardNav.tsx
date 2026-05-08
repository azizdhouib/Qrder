"use client";

import Link from "next/link";

export type DashboardNavItem = { href: string; label: string };

export function DashboardNav({ items, pathname }: { items: DashboardNavItem[]; pathname: string }) {
  return (
    <nav className="dashboard-nav" aria-label="Navigation principale">
      {items.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard" || pathname === "/dashboard/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`dashboard-nav-item${active ? " dashboard-nav-item-active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
