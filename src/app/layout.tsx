import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catalog: product management dashboard",
  description: "A small SaaS dashboard for managing products, with role-based access and AI-drafted descriptions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
