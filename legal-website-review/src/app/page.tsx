import Link from "next/link";
import Image from "next/image";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const destinations = [
  { href: "/privacy", number: "01", title: "Privacy", copy: "A dedicated home for the official privacy policy when it is ready to publish." },
  { href: "/terms", number: "02", title: "Terms", copy: "The future location for Cubyfit’s terms of service and related information." },
  { href: "/delete-account", number: "03", title: "Account deletion", copy: "A clear account-deletion information page is being prepared for users." },
];

export default function Home() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <p className="eyebrow">Cubyfit official information</p>
              <h1>Move forward, one day at a time.</h1>
              <p className="hero-copy">Cubyfit is a mobile application for fitness, nutrition, habits, and personal growth. This site is the future home for its official support and legal information.</p>
              <div className="button-row">
                <Link className="button button-primary" href="/contact">Support & contact</Link>
                <Link className="button button-secondary" href="/privacy">Legal information</Link>
              </div>
            </div>
            <aside className="hero-card" aria-label="What this site provides">
              <Image className="hero-card-icon" src="/cubyfit-icon.png" alt="" width={68} height={68} />
              <h2>A clear place for the essentials.</h2>
              <p>Useful public information, kept separate from the Cubyfit mobile experience.</p>
              <ul className="hero-card-list"><li>Privacy and terms</li><li>Account deletion guidance</li><li>Support contact details</li></ul>
            </aside>
          </div>
        </section>
        <section className="content-section">
          <div className="container">
            <div className="section-heading"><h2>Information that is easy to find.</h2><p>Each page is structured for clarity on mobile and desktop. Official legal text and contact details will be added here before their relevant public launch.</p></div>
            <div className="link-grid">{destinations.map((item) => <Link className="link-card" href={item.href} key={item.href}><span className="link-card-mark">{item.number}</span><h3>{item.title}</h3><p>{item.copy}</p><span>View page →</span></Link>)}</div>
          </div>
        </section>
        <section className="principles content-section">
          <div className="container principles-grid">
            <div className="principle"><span className="number">01 / SIMPLE</span><h3>Made for reading</h3><p>Comfortable type, direct navigation, and focused page layouts.</p></div>
            <div className="principle"><span className="number">02 / PRIVATE</span><h3>No tracking layer</h3><p>This static site does not add advertising, analytics, accounts, or forms.</p></div>
            <div className="principle"><span className="number">03 / SEPARATE</span><h3>Independent by design</h3><p>Support information lives here without connecting to the Cubyfit mobile application.</p></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
