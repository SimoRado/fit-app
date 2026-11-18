import type { ReactNode } from "react";

type Props = { title: string; children: ReactNode };

export function PlaceholderNotice({ title, children }: Props) {
  return <div className="placeholder-notice"><h2>{title}</h2><p>{children}</p></div>;
}
