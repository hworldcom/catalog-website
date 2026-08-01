import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { t, tr } from "@/lib/i18n";

import type { DelegatedUploadSeller } from "../delegated-classifier-upload.types";

const S = {
  seller: t("Destination seller", "Sprzedawca docelowy", "Zielverkäufer", "Nhà bán đích"),
  owner: t(
    "This seller owns the workflow and all resulting products.",
    "Ten sprzedawca jest właścicielem procesu i wszystkich wynikowych produktów.",
    "Dieser Verkäufer besitzt den Ablauf und alle daraus entstehenden Produkte.",
    "Nhà bán này sở hữu quy trình và mọi sản phẩm được tạo.",
  ),
  published: t(
    "Published storefront",
    "Opublikowany sklep",
    "Veröffentlichter Shop",
    "Gian hàng đã xuất bản",
  ),
  unpublished: t(
    "Unpublished storefront",
    "Nieopublikowany sklep",
    "Nicht veröffentlichter Shop",
    "Gian hàng chưa xuất bản",
  ),
};

export function DelegatedClassifierSellerCard({ seller }: { seller: DelegatedUploadSeller }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{tr(S.seller)}</CardTitle>
            <CardDescription>{tr(S.owner)}</CardDescription>
          </div>
          <Badge variant={seller.published ? "secondary" : "outline"}>
            {seller.published ? tr(S.published) : tr(S.unpublished)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="font-medium">{seller.name}</p>
        <p className="text-sm text-muted-foreground">/{seller.slug}</p>
        <p className="break-all text-xs text-muted-foreground">{seller.sellerId}</p>
      </CardContent>
    </Card>
  );
}
