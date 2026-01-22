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
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <main
            className="custom-scrollbar"
            style={{
              marginLeft: '240px',
              minHeight: '100vh',
              flex: 1,
              padding: 'var(--spacing-2xl)',
            }}
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
