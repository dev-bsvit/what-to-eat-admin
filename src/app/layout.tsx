import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "What to Eat? Admin",
  description: "Admin panel for recipes and product catalogs",
};

// Force dynamic rendering for all pages (admin panel uses useSearchParams)
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased">
        <div className="admin-shell">
          <Sidebar />
          <main
            className="custom-scrollbar admin-main"
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
