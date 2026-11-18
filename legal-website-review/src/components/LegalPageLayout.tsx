import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

type Props = { title: string; description: string; children: ReactNode };

export function LegalPageLayout({ title, description, children }: Props) {
  return <div className="site-shell"><SiteHeader /><main><section className="page-intro"><div className="container"><p className="eyebrow">Cubyfit support & legal</p><h1>{title}</h1><p>{description}</p></div></section>{children}</main><SiteFooter /></div>;
}
