import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { t, tr } from "@/lib/i18n";

import { submitLead } from "../catalog.functions";
import { buildInquirySubmission, type InquiryFields } from "../inquiry";
import { buildWhatsAppUrl } from "../seller-storefront";

const I = {
  productTitle: t(
    "Ask about this product",
    "Zapytaj o ten produkt",
    "Zu diesem Produkt anfragen",
    "Hỏi về sản phẩm này",
  ),
  sellerTitle: t(
    "Request a wholesale quote",
    "Poproś o wycenę hurtową",
    "Großhandelsangebot anfordern",
    "Yêu cầu báo giá bán buôn",
  ),
  sub: t(
    "Contact the supplier directly — no account needed.",
    "Skontaktuj się z dostawcą bezpośrednio — konto nie jest wymagane.",
    "Kontaktieren Sie den Lieferanten direkt — kein Konto erforderlich.",
    "Liên hệ trực tiếp nhà cung cấp — không cần tài khoản.",
  ),
  name: t("Your name*", "Twoje imię*", "Ihr Name*", "Tên bạn*"),
  email: t("Email", "E-mail", "E-Mail", "Email"),
  phone: t("Phone / WhatsApp", "Telefon / WhatsApp", "Telefon / WhatsApp", "Điện thoại / WhatsApp"),
  country: t("Country", "Kraj", "Land", "Quốc gia"),
  message: t("Message*", "Wiadomość*", "Nachricht*", "Tin nhắn*"),
  productSubmit: t(
    "Ask about this product",
    "Zapytaj o produkt",
    "Produkt anfragen",
    "Gửi câu hỏi",
  ),
  sellerSubmit: t("Send inquiry", "Wyślij zapytanie", "Anfrage senden", "Gửi yêu cầu"),
  sending: t("Sending…", "Wysyłanie…", "Wird gesendet…", "Đang gửi…"),
  whatsapp: t(
    "WhatsApp seller",
    "WhatsApp do sprzedawcy",
    "WhatsApp-Verkäufer",
    "WhatsApp nhà bán",
  ),
  sent: t("Inquiry sent.", "Zapytanie wysłane.", "Anfrage gesendet.", "Đã gửi yêu cầu."),
  sentSub: t(
    "The supplier will get back to you soon.",
    "Dostawca wkrótce się z Tobą skontaktuje.",
    "Der Lieferant meldet sich in Kürze.",
    "Nhà cung cấp sẽ phản hồi sớm.",
  ),
  errName: t(
    "Please enter your name.",
    "Podaj swoje imię.",
    "Bitte geben Sie Ihren Namen ein.",
    "Vui lòng nhập tên.",
  ),
  errMsg: t(
    "Please write a short message.",
    "Napisz krótką wiadomość.",
    "Bitte schreiben Sie eine kurze Nachricht.",
    "Vui lòng viết tin nhắn ngắn.",
  ),
  errLong: t(
    "Message is too long.",
    "Wiadomość jest za długa.",
    "Nachricht ist zu lang.",
    "Tin nhắn quá dài.",
  ),
  errEmail: t(
    "Please enter a valid email.",
    "Podaj poprawny e-mail.",
    "Bitte gültige E-Mail eingeben.",
    "Vui lòng nhập email hợp lệ.",
  ),
  errSend: t(
    "Couldn't send the inquiry. Please try again.",
    "Nie udało się wysłać zapytania. Spróbuj ponownie.",
    "Anfrage konnte nicht gesendet werden. Bitte erneut versuchen.",
    "Không thể gửi yêu cầu. Vui lòng thử lại.",
  ),
  productGreeting: t(
    "Hi, I'd like to ask about",
    "Cześć, chciałbym zapytać o",
    "Hallo, ich möchte gerne fragen zu",
    "Xin chào, tôi muốn hỏi về",
  ),
  sellerGreeting: t(
    "Hi, I'd like to request a wholesale quote from",
    "Dzień dobry, proszę o wycenę hurtową od",
    "Hallo, ich möchte ein Großhandelsangebot anfordern von",
    "Xin chào, tôi muốn yêu cầu báo giá bán buôn từ",
  ),
};

export function InquiryForm({
  sellerId,
  sellerName,
  whatsapp,
  productId,
  productTitle,
  className,
}: {
  sellerId: string;
  sellerName: string;
  whatsapp: string | null;
  productId?: string;
  productTitle?: string;
  className?: string;
}) {
  const submit = useServerFn(submitLead);
  const isProductInquiry = Boolean(productId && productTitle);
  const greeting = isProductInquiry ? tr(I.productGreeting) : tr(I.sellerGreeting);
  const initialMessage = isProductInquiry
    ? `${greeting} "${productTitle}".`
    : `${greeting} ${sellerName}.`;
  const [form, setForm] = useState<InquiryFields>({
    buyerName: "",
    buyerEmail: "",
    buyerPhone: "",
    buyerCountry: "",
    message: initialMessage,
  });
  const [errors, setErrors] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: (source: "form" | "whatsapp") =>
      submit({
        data: buildInquirySubmission({
          fields: form,
          sellerId,
          productId,
          source,
        }),
      }),
  });

  const validate = () => {
    const nextErrors: string[] = [];
    if (form.buyerName.trim().length < 1) nextErrors.push(tr(I.errName));
    if (form.message.trim().length < 1) nextErrors.push(tr(I.errMsg));
    if (form.message.trim().length > 2000) nextErrors.push(tr(I.errLong));
    if (form.buyerEmail && !z.string().email().safeParse(form.buyerEmail).success) {
      nextErrors.push(tr(I.errEmail));
    }
    setErrors(nextErrors);
    return nextErrors.length === 0;
  };

  const submitForm = (event: FormEvent) => {
    event.preventDefault();
    if (validate()) mutation.mutate("form");
  };

  const openWhatsApp = () => {
    const url = buildWhatsAppUrl(whatsapp, form.message.trim() || initialMessage);
    if (!url || !validate()) return;
    window.open(url, "_blank", "noopener,noreferrer");
    mutation.mutate("whatsapp");
  };

  if (mutation.isSuccess && mutation.variables === "form") {
    return (
      <div
        className={`border border-primary/60 bg-primary/10 p-5 text-sm ${className ?? ""}`}
        role="status"
      >
        <div className="font-medium text-primary">{tr(I.sent)}</div>
        <div className="mt-1 text-muted-foreground">
          {productTitle ? `${productTitle} · ` : ""}
          {tr(I.sentSub)}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submitForm}
      noValidate
      className={`border border-border/60 bg-card/70 p-5 sm:p-6 ${className ?? ""}`}
    >
      <h2 className="font-display text-xl font-semibold">
        {tr(isProductInquiry ? I.productTitle : I.sellerTitle)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{tr(I.sub)}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field
          label={tr(I.name)}
          value={form.buyerName}
          onChange={(value) => setForm((current) => ({ ...current, buyerName: value }))}
          autoComplete="name"
        />
        <Field
          label={tr(I.email)}
          value={form.buyerEmail}
          onChange={(value) => setForm((current) => ({ ...current, buyerEmail: value }))}
          type="email"
          autoComplete="email"
        />
        <Field
          label={tr(I.phone)}
          value={form.buyerPhone}
          onChange={(value) => setForm((current) => ({ ...current, buyerPhone: value }))}
          type="tel"
          autoComplete="tel"
        />
        <Field
          label={tr(I.country)}
          value={form.buyerCountry}
          onChange={(value) => setForm((current) => ({ ...current, buyerCountry: value }))}
          autoComplete="country-name"
        />
      </div>
      <label className="mt-3 block">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {tr(I.message)}
        </span>
        <textarea
          value={form.message}
          onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
          rows={4}
          maxLength={2000}
          className="mt-1 w-full border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>

      {errors.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-rose-600" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {mutation.isError ? (
        <div className="mt-2 text-xs text-rose-600" role="alert">
          {tr(I.errSend)}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex min-h-10 items-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60"
        >
          {mutation.isPending && mutation.variables === "form"
            ? tr(I.sending)
            : tr(isProductInquiry ? I.productSubmit : I.sellerSubmit)}
        </button>
        {whatsapp ? (
          <button
            type="button"
            onClick={openWhatsApp}
            disabled={mutation.isPending}
            className="inline-flex min-h-10 items-center border border-primary/60 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60"
          >
            {tr(I.whatsapp)}
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="mt-1 w-full border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}
