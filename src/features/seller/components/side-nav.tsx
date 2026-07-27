import { Link } from "@tanstack/react-router";

export function SideNav({ sellerSlug }: { sellerSlug: string }) {
  const link =
    "block border border-transparent px-3 py-2 text-sm text-muted-foreground hover:border-border hover:text-foreground";
  const active = "border-border bg-card text-foreground";

  return (
    <nav className="flex flex-col gap-1">
      <Link
        to="/seller"
        activeOptions={{ exact: true }}
        className={link}
        activeProps={{ className: `${link} ${active}` }}
      >
        Overview
      </Link>
      <Link
        to="/seller/storefront"
        className={link}
        activeProps={{ className: `${link} ${active}` }}
      >
        Storefront
      </Link>
      <Link to="/seller/products" className={link} activeProps={{ className: `${link} ${active}` }}>
        Products
      </Link>
      <Link to="/seller/leads" className={link} activeProps={{ className: `${link} ${active}` }}>
        Leads
      </Link>
      <a href={`/s/${sellerSlug}`} target="_blank" rel="noreferrer" className={link}>
        View public storefront ↗
      </a>
    </nav>
  );
}
