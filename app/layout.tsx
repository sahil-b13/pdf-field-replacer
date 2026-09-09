import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Cover Page Swap — Replace your details on any practical file",
  description:
    "Upload a practical file or assignment cover page, swap in your own name, roll number, and details, and download it back as a PDF — nothing else on the page changes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
