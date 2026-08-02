import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";

import { listSellerBusinessCategories } from "@/features/seller/categories.functions";
import {
  normalizeSubmittedCompanyCode,
  readSellerCompanyCodeError,
} from "@/features/seller/company-code";
import { companyCodeCopy, companyCodeErrorCopy } from "@/features/seller/company-code.copy";
import { updateMyCompanyCode } from "@/features/seller/company-code.functions";
import { getMySeller } from "@/features/seller/current-seller.functions";
import { updateStorefront } from "@/features/seller/storefront.functions";
import { tr } from "@/lib/i18n";
import { toast } from "sonner";

import { Field } from "../components/field";
import { ImageUpload } from "../components/image-upload";

export function StorefrontScreen() {
  const getSeller = useServerFn(getMySeller);
  const save = useServerFn(updateStorefront);
  const saveCompanyCode = useServerFn(updateMyCompanyCode);
  const listCats = useServerFn(listSellerBusinessCategories);
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["my-seller"], queryFn: () => getSeller() });
  const cats = useQuery({ queryKey: ["seller-business-categories"], queryFn: () => listCats() });

  const seller = data?.seller;
  const [form, setForm] = useState<null | {
    id: string;
    name: string;
    slug: string;
    city: string;
    country: string;
    whatsapp: string;
    email: string;
    about: string;
    logo_url: string;
    cover_image_url: string;
    established_year: string;
    primary_category_id: string;
    company_code: string;
    company_code_saved: string;
    company_code_locked_at: string | null;
    published: boolean;
  }>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seller && !form) {
      setForm({
        id: seller.id,
        name: seller.name ?? "",
        slug: seller.slug ?? "",
        city: seller.city ?? "",
        country: seller.country ?? "",
        whatsapp: seller.whatsapp ?? "",
        email: seller.email ?? "",
        about: seller.about ?? "",
        logo_url: seller.logo_url ?? "",
        cover_image_url: seller.cover_image_url ?? "",
        established_year: seller.established_year ? String(seller.established_year) : "",
        primary_category_id: seller.primary_category_id ?? "",
        company_code: seller.company_code,
        company_code_saved: seller.company_code,
        company_code_locked_at: seller.company_code_locked_at,
        published: seller.published,
      });
    }
  }, [seller, form]);

  if (!form) return <div className="text-sm text-muted-foreground">Loading…</div>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const companyCode = normalizeSubmittedCompanyCode(form.company_code);
      if (!form.company_code_locked_at && companyCode !== form.company_code_saved) {
        const result = await saveCompanyCode({ data: { companyCode } });
        setForm((current) =>
          current
            ? {
                ...current,
                company_code: result.seller.company_code,
                company_code_saved: result.seller.company_code,
                company_code_locked_at: result.seller.company_code_locked_at,
              }
            : current,
        );
      }

      await save({
        data: {
          id: form.id,
          name: form.name,
          slug: form.slug,
          city: form.city,
          country: form.country,
          whatsapp: form.whatsapp,
          email: form.email,
          about: form.about,
          logo_url: form.logo_url,
          cover_image_url: form.cover_image_url,
          established_year: form.established_year ? Number(form.established_year) : null,
          primary_category_id: form.primary_category_id || null,
          published: form.published,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["my-seller"] });
      toast.success(tr(companyCodeCopy.saveSuccess));
    } catch (err) {
      const companyCodeError = readSellerCompanyCodeError(err);
      toast.error(
        companyCodeError
          ? tr(companyCodeErrorCopy[companyCodeError])
          : err instanceof Error && err.message !== "seller_company_code_unavailable"
            ? err.message
            : tr(companyCodeCopy.saveUnavailable),
      );
    } finally {
      setBusy(false);
    }
  }

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const inputCls = "border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Storefront</h1>
        <p className="text-sm text-muted-foreground">
          Info shown to buyers on your public storefront.
        </p>
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Business name">
          <input
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={tr(companyCodeCopy.label)}>
          <input
            required
            minLength={3}
            maxLength={10}
            pattern="[A-Z0-9]{3}[0-9]*"
            value={form.company_code}
            onChange={(e) => update("company_code", e.target.value.toUpperCase())}
            disabled={Boolean(form.company_code_locked_at)}
            className={`${inputCls} uppercase disabled:cursor-not-allowed disabled:opacity-60`}
            autoComplete="off"
          />
          <span className="text-[11px] text-muted-foreground">
            {tr(
              form.company_code_locked_at
                ? companyCodeCopy.lockedHelp
                : companyCodeCopy.unlockedHelp,
            )}
          </span>
        </Field>
        <Field label="URL slug (a-z, 0-9, -)">
          <input
            required
            value={form.slug}
            onChange={(e) => update("slug", e.target.value)}
            className={inputCls}
            pattern="^[a-z0-9-]+$"
          />
        </Field>
        <Field label="City">
          <input
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Country">
          <input
            value={form.country}
            onChange={(e) => update("country", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="WhatsApp (E.164, e.g. +919812345678)">
          <input
            value={form.whatsapp}
            onChange={(e) => update("whatsapp", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Established year">
          <input
            type="number"
            min={1800}
            max={2100}
            value={form.established_year}
            onChange={(e) => update("established_year", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Primary category">
          <select
            value={form.primary_category_id}
            onChange={(e) => update("primary_category_id", e.target.value)}
            className={inputCls}
          >
            <option value="">— none —</option>
            {cats.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <ImageUpload
            label="Logo"
            folder="storefront"
            value={form.logo_url}
            onChange={(url) => update("logo_url", url)}
          />
        </div>
        <div className="md:col-span-2">
          <ImageUpload
            label="Cover image"
            folder="storefront"
            value={form.cover_image_url}
            onChange={(url) => update("cover_image_url", url)}
          />
        </div>
        <div className="md:col-span-2">
          <Field label="About">
            <textarea
              rows={5}
              value={form.about}
              onChange={(e) => update("about", e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => update("published", e.target.checked)}
          />
          Publish storefront (visible to buyers)
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
