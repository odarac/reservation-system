import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Schedulio",
  description: "Resource reservation system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}