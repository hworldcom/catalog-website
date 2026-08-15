import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  normalizeSubmittedCompanyCode,
  readSellerCompanyCodeError,
} from "@/features/seller/company-code";
import { companyCodeCopy, companyCodeErrorCopy } from "@/features/seller/company-code.copy";
import { updateMyCompanyCode } from "@/features/seller/company-code.functions";
import {
  getMySellerProfileWorkingCopy,
  saveMySellerProfileWorkingCopy,
} from "@/features/seller/storefront.functions";
import { SellerProfileMediaField } from "@/features/seller/components/seller-profile-media-field";
import { removeMySellerProfileAsset } from "@/features/seller/seller-profile-media.functions";
import { tr } from "@/lib/i18n";
import { toast } from "sonner";

import { Field } from "../components/field";

type StorefrontForm = {
  revision: number;
  name: string;
  slug: string;
  city: string;
  country: string;
  whatsapp: string;
  email: string;
  about: string;
  establishedYear: string;
  logoAssetId: string | null;
  coverAssetId: string | null;
  companyCode: string;
  savedCompanyCode: string;
  companyCodeLockedAt: string | null;
};

export function StorefrontScreen() {
  const getProfile = useServerFn(getMySellerProfileWorkingCopy);
  const saveProfile = useServerFn(saveMySellerProfileWorkingCopy);
  const saveCompanyCode = useServerFn(updateMyCompanyCode);
  const removeAsset = useServerFn(removeMySellerProfileAsset);
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["my-seller-profile"],
    queryFn: () => getProfile(),
  });
  const [form, setForm] = useState<StorefrontForm | null>(null);
  const formRef = useRef<StorefrontForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);

  useEffect(() => {
    if (!profileQuery.data || form) return;
    const { seller, workingCopy } = profileQuery.data;
    const initialForm = {
      revision: workingCopy.revision,
      name: workingCopy.name,
      slug: workingCopy.slug,
      city: workingCopy.city ?? "",
      country: workingCopy.country ?? "",
      whatsapp: workingCopy.whatsapp ?? "",
      email: workingCopy.email ?? "",
      about: workingCopy.about ?? "",
      establishedYear: workingCopy.established_year ? String(workingCopy.established_year) : "",
      logoAssetId: workingCopy.logo_asset_id,
      coverAssetId: workingCopy.cover_asset_id,
      companyCode: seller.company_code,
      savedCompanyCode: seller.company_code,
      companyCodeLockedAt: seller.company_code_locked_at,
    };
    formRef.current = initialForm;
    setForm(initialForm);
  }, [form, profileQuery.data]);

  if (profileQuery.isError) {
    return (
      <div className="border border-destructive/40 bg-destructive/5 p-4 text-sm">
        Seller profile could not be loaded.
      </div>
    );
  }

  if (!form) return <div className="text-sm text-muted-foreground">Loading…</div>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const companyCode = normalizeSubmittedCompanyCode(form.companyCode);
      if (!form.companyCodeLockedAt && companyCode !== form.savedCompanyCode) {
        const result = await saveCompanyCode({ data: { companyCode } });
        setForm((current) =>
          current
            ? {
                ...current,
                companyCode: result.seller.company_code,
                savedCompanyCode: result.seller.company_code,
                companyCodeLockedAt: result.seller.company_code_locked_at,
              }
            : current,
        );
      }

      const result = await persistProfile(form);
      applyWorkingCopy(result.workingCopy);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-seller-profile"] }),
        queryClient.invalidateQueries({ queryKey: ["my-seller"] }),
      ]);
      toast.success("Profile draft saved.");
    } catch (error) {
      const companyCodeError = readSellerCompanyCodeError(error);
      toast.error(
        companyCodeError ? tr(companyCodeErrorCopy[companyCodeError]) : profileErrorMessage(error),
      );
    } finally {
      setBusy(false);
    }
  }

  const update = <Key extends keyof StorefrontForm>(key: Key, value: StorefrontForm[Key]) =>
    setForm((current) => {
      const next = current ? { ...current, [key]: value } : current;
      formRef.current = next;
      return next;
    });
  const inputClass = "border border-border bg-background px-3 py-2 text-sm";

  async function persistProfile(next: StorefrontForm) {
    return saveProfile({
      data: {
        expectedRevision: next.revision,
        name: next.name,
        slug: next.slug,
        city: next.city,
        country: next.country,
        whatsapp: next.whatsapp,
        email: next.email,
        about: next.about,
        establishedYear: next.establishedYear ? Number(next.establishedYear) : null,
        logoAssetId: next.logoAssetId,
        coverAssetId: next.coverAssetId,
      },
    });
  }

  function applyWorkingCopy(
    workingCopy: Awaited<ReturnType<typeof persistProfile>>["workingCopy"],
  ) {
    setForm((current) => {
      const next = current
        ? {
            ...current,
            revision: workingCopy.revision,
            name: workingCopy.name,
            slug: workingCopy.slug,
            city: workingCopy.city ?? "",
            country: workingCopy.country ?? "",
            whatsapp: workingCopy.whatsapp ?? "",
            email: workingCopy.email ?? "",
            about: workingCopy.about ?? "",
            establishedYear: workingCopy.established_year
              ? String(workingCopy.established_year)
              : "",
            logoAssetId: workingCopy.logo_asset_id,
            coverAssetId: workingCopy.cover_asset_id,
          }
        : current;
      formRef.current = next;
      return next;
    });
  }

  async function selectMedia(kind: "logo" | "cover", assetId: string) {
    const current = formRef.current;
    if (!current) return;
    const previousAssetId = kind === "logo" ? current.logoAssetId : current.coverAssetId;
    const next = {
      ...current,
      ...(kind === "logo" ? { logoAssetId: assetId } : { coverAssetId: assetId }),
    };
    try {
      const result = await persistProfile(next);
      applyWorkingCopy(result.workingCopy);
    } catch (error) {
      try {
        await removeAsset({ data: { assetId } });
      } catch {
        // The durable cleanup state remains retryable through the server operation.
      }
      throw error;
    }
    if (previousAssetId && previousAssetId !== assetId) {
      await removeAsset({ data: { assetId: previousAssetId } });
    }
    toast.success(`${kind === "logo" ? "Logo" : "Cover image"} saved to the profile draft.`);
  }

  async function removeMedia(kind: "logo" | "cover") {
    const current = formRef.current;
    if (!current) return;
    const assetId = kind === "logo" ? current.logoAssetId : current.coverAssetId;
    if (!assetId) return;
    const next = {
      ...current,
      ...(kind === "logo" ? { logoAssetId: null } : { coverAssetId: null }),
    };
    const result = await persistProfile(next);
    applyWorkingCopy(result.workingCopy);
    await removeAsset({ data: { assetId } });
    toast.success(`${kind === "logo" ? "Logo" : "Cover image"} removed.`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Storefront profile</h1>
        <p className="text-sm text-muted-foreground">
          These edits stay private until seller approval controls are available.
        </p>
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SellerProfileMediaField
          kind="logo"
          assetId={form.logoAssetId}
          disabled={busy || mediaBusy}
          onSelect={(assetId) => selectMedia("logo", assetId)}
          onRemove={() => removeMedia("logo")}
          onBusyChange={setMediaBusy}
        />
        <SellerProfileMediaField
          kind="cover"
          assetId={form.coverAssetId}
          disabled={busy || mediaBusy}
          onSelect={(assetId) => selectMedia("cover", assetId)}
          onRemove={() => removeMedia("cover")}
          onBusyChange={setMediaBusy}
        />
        <Field label="Business name">
          <input
            required
            minLength={2}
            maxLength={120}
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label={tr(companyCodeCopy.label)}>
          <input
            required
            minLength={3}
            maxLength={10}
            pattern="[A-Z0-9]{3}[0-9]*"
            value={form.companyCode}
            onChange={(event) => update("companyCode", event.target.value.toUpperCase())}
            disabled={Boolean(form.companyCodeLockedAt)}
            className={`${inputClass} uppercase disabled:cursor-not-allowed disabled:opacity-60`}
            autoComplete="off"
          />
          <span className="text-[11px] text-muted-foreground">
            {tr(
              form.companyCodeLockedAt ? companyCodeCopy.lockedHelp : companyCodeCopy.unlockedHelp,
            )}
          </span>
        </Field>
        <Field label="URL slug (a-z, 0-9, -)">
          <input
            required
            minLength={2}
            maxLength={60}
            value={form.slug}
            onChange={(event) => update("slug", event.target.value)}
            className={inputClass}
            pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
          />
        </Field>
        <Field label="Business category">
          <input value="Fashion" disabled className={`${inputClass} opacity-60`} />
        </Field>
        <Field label="City">
          <input
            maxLength={80}
            value={form.city}
            onChange={(event) => update("city", event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Country">
          <input
            maxLength={80}
            value={form.country}
            onChange={(event) => update("country", event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="WhatsApp">
          <input
            maxLength={40}
            value={form.whatsapp}
            onChange={(event) => update("whatsapp", event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Contact email">
          <input
            type="email"
            maxLength={255}
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Established year">
          <input
            type="number"
            min={1800}
            max={2100}
            value={form.establishedYear}
            onChange={(event) => update("establishedYear", event.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="About">
            <textarea
              rows={5}
              maxLength={4000}
              value={form.about}
              onChange={(event) => update("about", event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy || mediaBusy}
            className="bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save profile draft"}
          </button>
        </div>
      </form>
    </div>
  );
}

function profileErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Seller profile is temporarily unavailable.";
  if (error.message.includes("seller_profile_revision_conflict")) {
    return "This profile changed elsewhere. Reload the page and try again.";
  }
  if (error.message.includes("seller_approval_submission_invalid")) {
    return "Check the profile fields and try again.";
  }
  if (error.message.includes("seller_approval_not_found")) {
    return "Seller profile could not be found.";
  }
  if (error.message.includes("seller_profile_image_not_ready")) {
    return "The selected logo or cover image is not ready.";
  }
  return "Seller profile is temporarily unavailable.";
}
