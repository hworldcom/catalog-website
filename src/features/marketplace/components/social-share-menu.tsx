import { Copy, Facebook, MessageCircle, Share2, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pick, t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { facebookShareUrl, whatsAppShareUrl } from "../social-share-destinations";

const S = {
  share: t("Share", "Udostępnij", "Teilen", "Chia sẻ"),
  shareUsingAnotherApp: t(
    "Share using another app",
    "Udostępnij w innej aplikacji",
    "Mit einer anderen App teilen",
    "Chia sẻ bằng ứng dụng khác",
  ),
  copyLink: t("Copy link", "Kopiuj link", "Link kopieren", "Sao chép liên kết"),
  copied: t("Link copied.", "Link skopiowany.", "Link kopiert.", "Đã sao chép liên kết."),
  shareFailed: t(
    "Sharing failed. Try another option.",
    "Udostępnianie nie powiodło się. Wybierz inną opcję.",
    "Teilen fehlgeschlagen. Versuchen Sie eine andere Option.",
    "Không thể chia sẻ. Hãy thử một tùy chọn khác.",
  ),
  copyFailed: t(
    "Could not copy the link.",
    "Nie udało się skopiować linku.",
    "Der Link konnte nicht kopiert werden.",
    "Không thể sao chép liên kết.",
  ),
};

export function SocialShareMenu({
  title,
  url,
  language,
  className,
}: {
  title: string;
  url: string;
  language: Lang;
  className?: string;
}) {
  const [canUseNativeShare, setCanUseNativeShare] = useState(false);
  const shareLabel = pick(S.share, language);

  useEffect(() => {
    setCanUseNativeShare(typeof navigator.share === "function");
  }, []);

  const shareUsingAnotherApp = async () => {
    try {
      await navigator.share({ title, url });
    } catch (error) {
      if (!isNativeShareCancellation(error)) {
        toast.error(pick(S.shareFailed, language));
      }
    }
  };

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(url);
      toast.success(pick(S.copied, language));
    } catch {
      toast.error(pick(S.copyFailed, language));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-10 shrink-0 px-3", className)}
          aria-label={shareLabel}
          title={shareLabel}
        >
          <Share2 aria-hidden />
          <span>{shareLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {canUseNativeShare ? (
          <DropdownMenuItem onSelect={() => void shareUsingAnotherApp()}>
            <Smartphone aria-hidden />
            {pick(S.shareUsingAnotherApp, language)}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => openShareDestination(facebookShareUrl(url))}>
          <Facebook aria-hidden />
          Facebook
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openShareDestination(whatsAppShareUrl(title, url))}>
          <MessageCircle aria-hidden />
          WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyLink()}>
          <Copy aria-hidden />
          {pick(S.copyLink, language)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function openShareDestination(url: string) {
  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (openedWindow) openedWindow.opener = null;
}

function isNativeShareCancellation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}
