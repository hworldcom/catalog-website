import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";

import { listSellerBusinessCategories } from "@/features/seller/categories.functions";
import {
  deriveCompanyCodePreview,
  normalizeSubmittedCompanyCode,
  readSellerCompanyCodeError,
} from "@/features/seller/company-code";
import { companyCodeCopy, companyCodeErrorCopy } from "@/features/seller/company-code.copy";
import { onboardSeller } from "@/features/seller/onboarding.functions";
import { tr } from "@/lib/i18n";
import { toast } from "sonner";

import { Field } from "../components/field";

export function OnboardingScreen() {
  const onboard = useServerFn(onboardSeller);
  const listCats = useServerFn(listSellerBusinessCategories);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [companyCodeEdited, setCompanyCodeEdited] = useState(false);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);

  const cats = useQuery({
    queryKey: ["seller-business-categories"],
    queryFn: () => listCats(),
  });

  useEffect(() => {
    const fashion = cats.data?.categories[0];
    if (fashion && !categoryId) setCategoryId(fashion.id);
  }, [categoryId, cats.data?.categories]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onboard({
        data: {
          name,
          companyCode: normalizeSubmittedCompanyCode(companyCode),
          city,
          country,
          primary_category_id: categoryId,
          whatsapp: whatsapp.replace(/[^\d+]/g, ""),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["my-seller"] });
      toast.success(tr(companyCodeCopy.onboardingSuccess));
    } catch (err) {
      const code = readSellerCompanyCodeError(err);
      toast.error(
        code ? tr(companyCodeErrorCopy[code]) : tr(companyCodeCopy.onboardingUnavailable),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <div className="mb-4 text-xs uppercase tracking-widest text-primary/80">
        Step 1 of 2 · About your business
      </div>
      <h1 className="font-display text-3xl font-semibold">Set up your storefront</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tell buyers who you are. You can polish everything else on the next screen.
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <Field label="Business name*">
          <input
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => {
              const nextName = e.target.value;
              setName(nextName);
              if (!companyCodeEdited) setCompanyCode(deriveCompanyCodePreview(nextName));
            }}
            className="border border-border bg-background px-3 py-2 text-sm"
            placeholder="Kesar Textiles"
          />
        </Field>
        <Field label={tr(companyCodeCopy.label)}>
          <input
            required
            minLength={3}
            maxLength={10}
            pattern="[A-Z0-9]{3}[0-9]*"
            value={companyCode}
            onChange={(e) => {
              setCompanyCodeEdited(true);
              setCompanyCode(e.target.value.toUpperCase());
            }}
            className="border border-border bg-background px-3 py-2 text-sm uppercase"
            placeholder="KES"
            autoComplete="off"
          />
          <span className="text-[11px] text-muted-foreground">
            {tr(companyCodeCopy.onboardingHelp)}
          </span>
        </Field>
        <Field label="Primary category">
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Choose a category…
            </option>
            {cats.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={80}
              className="border border-border bg-background px-3 py-2 text-sm"
              placeholder="Jaipur"
            />
          </Field>
          <Field label="Country">
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={80}
              className="border border-border bg-background px-3 py-2 text-sm"
              placeholder="India"
            />
          </Field>
        </div>
        <Field label="WhatsApp (with country code)">
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            maxLength={40}
            className="border border-border bg-background px-3 py-2 text-sm"
            placeholder="+91 98765 43210"
          />
          <span className="text-[11px] text-muted-foreground">
            Buyers use this to message you directly. You can add it later.
          </span>
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
