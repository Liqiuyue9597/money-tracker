"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, Receipt, Wallet, Settings } from "lucide-react";

const navItems = [
  { href: "/", label: "概览", icon: Home },
  { href: "/transactions", label: "账单", icon: Receipt },
  { href: "/quick", label: "记账", icon: PlusCircle, highlight: true },
  { href: "/assets", label: "资产", icon: Wallet },
  { href: "/settings", label: "设置", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t safe-area-bottom">
      <div className="mx-auto flex max-w-lg items-end justify-around px-4 pb-1 pt-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          if (item.highlight) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center -mt-5"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <span className="mt-1 text-[10px] font-medium text-primary">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 py-2 px-3"
            >
              <Icon
                className={`h-5 w-5 transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              />
              <span
                className={`text-[10px] transition-colors ${
                  isActive
                    ? "text-primary font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
