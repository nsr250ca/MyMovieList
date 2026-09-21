import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Journal",
  description: "A private watched-movie dashboard with Supabase and TMDB matching."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
