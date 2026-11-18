import type { ReactNode } from "react";

type Section = { id: string; title: string; description: string };
type Props = { updatedLabel?: string; notice: ReactNode; sections: Section[] };

export function LegalDocument({ updatedLabel = "Last updated: to be announced", notice, sections }: Props) {
  return <section className="container legal-grid" aria-label="Legal document"><aside className="toc" aria-label="Document outline"><p className="toc-label">On this page</p>{sections.map((section) => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}</aside><article className="legal-document"><div className="legal-meta"><span>{updatedLabel}</span><span>Official document placeholder</span></div>{notice}<div className="reserved-sections">{sections.map((section) => <section className="reserved-section" id={section.id} key={section.id}><h2>{section.title}</h2><p>{section.description}</p></section>)}</div></article></section>;
}
