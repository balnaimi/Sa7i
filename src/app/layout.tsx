import type { Metadata, Viewport } from "next";
import { Tajawal } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "شالترتيب!؟",
  description: "تنظيم القروبات والمواعيد والقطيّات بدون شات.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "شالترتيب!؟",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
