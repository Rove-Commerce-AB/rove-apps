import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { ThemeClass } from "@/components/ThemeClass";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rove Apps",
  description: "Internal apps for planning, time reporting, and more",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full overflow-hidden ${instrumentSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full overflow-hidden antialiased font-primary">
        <ThemeClass />
        {children}
      </body>
    </html>
  );
}
