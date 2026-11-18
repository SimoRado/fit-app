import type { Metadata } from "next";
import { ContactSection } from "@/components/ContactSection";
import { LegalPageLayout } from "@/components/LegalPageLayout";

export const metadata: Metadata = { title: "Support & Contact", robots: { index: false, follow: false } };

export default function ContactPage() {
  return <LegalPageLayout title="Support & Contact" description="Official Cubyfit contact details are being prepared for publication. This page does not collect or submit information."><section className="container contact-grid"><ContactSection title="General support">A dedicated support email address will be published here for Cubyfit users.</ContactSection><ContactSection title="Privacy questions">The official contact method for privacy-related questions will be published here.</ContactSection><ContactSection title="Account deletion inquiries">Official deletion-request contact details will be added alongside the final instructions.</ContactSection><ContactSection title="Other questions">A general contact route will be added when public support information is finalized.</ContactSection><section className="contact-note"><h2>Contact information is not available yet.</h2><p>No support email address has been provided for publication, so this page intentionally does not invent one or include a contact form.</p></section></section></LegalPageLayout>;
}
