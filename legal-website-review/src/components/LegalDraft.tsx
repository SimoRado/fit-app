import type { ReactNode } from "react";
import Link from "next/link";
import { LegalPageLayout } from "@/components/LegalPageLayout";

export type DraftSection = { id: string; title: string; body: ReactNode };

export function LegalDraft({ title, description, sections, note }: {
  title: string;
  description: string;
  sections: DraftSection[];
  note: ReactNode;
}) {
  return <LegalPageLayout title={title} description={description}>
    <div className="container legal-grid">
      <nav className="toc" aria-label="On this page">
        <p className="toc-label">On this page</p>
        {sections.map(({ id, title: label }) => <a href={`#${id}`} key={id}>{label}</a>)}
      </nav>
      <article className="legal-document legal-draft">
        <div className="legal-meta"><span>Draft: November 18, 2026</span><span>Pending final verification</span></div>
        <div className="placeholder-notice"><h2>Publication draft</h2><p>{note}</p></div>
        {sections.map(({ id, title: heading, body }) => <section id={id} className="reserved-section" key={id}><h2>{heading}</h2>{body}</section>)}
        <nav className="legal-cross-links" aria-label="Related pages">
          <Link href="/">Home</Link><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Use</Link><Link href="/delete-account">Account deletion</Link>
        </nav>
      </article>
    </div>
  </LegalPageLayout>;
}
