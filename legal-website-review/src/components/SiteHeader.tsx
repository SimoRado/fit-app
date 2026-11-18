import Link from "next/link";
import Image from "next/image";

const links = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/delete-account", label: "Delete account" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-row">
        <Link className="brand" href="/" aria-label="Cubyfit home">
          <Image src="/cubyfit-icon.png" alt="" width={35} height={35} />
          <span>Cubyfit</span>
        </Link>
        <nav className="nav-links" aria-label="Main navigation">
          {links.map((link) => <Link className="nav-link" href={link.href} key={link.href}>{link.label}</Link>)}
          <Link className="nav-link nav-link-emphasis" href="/contact">Support</Link>
        </nav>
        <details className="mobile-nav">
          <summary>Menu</summary>
          <nav className="mobile-nav-list" aria-label="Mobile navigation">
            {links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
            <Link href="/contact">Support</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
