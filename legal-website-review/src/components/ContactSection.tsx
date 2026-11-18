import type { ReactNode } from "react";

type Props = { title: string; children: ReactNode };

export function ContactSection({ title, children }: Props) {
  return <section className="contact-card"><h2>{title}</h2><p>{children}</p><span className="contact-state">Contact details being finalized</span></section>;
}
