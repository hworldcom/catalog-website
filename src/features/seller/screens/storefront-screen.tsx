import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import {
  normalizeSubmittedCompanyCode,
  readSellerCompanyCodeError,
} from "@/features/seller/company-code";
import { companyCodeCopy, companyCodeErrorCopy } from "@/features/seller/company-code.copy";
import { updateMyCompanyCode } from "@/features/seller/company-code.functions";
import {
  SellerProfileMediaField,
  SellerProfileMediaPreviewImage,
} from "@/features/seller/components/seller-profile-media-field";
import { removeMySellerProfileAsset } from "@/features/seller/seller-profile-media.functions";
import type {
  SellerProfileMediaPreview,
  SellerProfileModerationSnapshot,
} from "@/features/seller/seller-profile-moderation.types";
import { storefrontCopy } from "@/features/seller/storefront.copy";
import {
  getMySellerProfileModerationSnapshot,
  saveMySellerProfileWorkingCopy,
  setMySellerStorefrontEnabled,
  submitMySellerProfile,
  withdrawMySellerProfileSubmission,
} from "@/features/seller/storefront.functions";
import { tr, useLang } from "@/lib/i18n";

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

type ProfileAction = "save" | "submit" | "withdraw" | "enable" | "disable";
type RequestAction = Exclude<ProfileAction, "save">;

const stableActionErrorCodes = [
  "seller_approval_submission_invalid",
  "seller_approval_submission_conflict",
  "seller_profile_revision_conflict",
  "seller_profile_slug_conflict",
  "seller_approval_required",
  "seller_approval_not_found",
  "seller_profile_image_not_ready",
] as const;

export function StorefrontScreen() {
  const lang = useLang();
  const getSnapshot = useServerFn(getMySellerProfileModerationSnapshot);
  const saveProfile = useServerFn(saveMySellerProfileWorkingCopy);
  const submitProfile = useServerFn(submitMySellerProfile);
  const withdrawSubmission = useServerFn(withdrawMySellerProfileSubmission);
  const setStorefrontEnabled = useServerFn(setMySellerStorefrontEnabled);
  const saveCompanyCode = useServerFn(updateMyCompanyCode);
  const removeAsset = useServerFn(removeMySellerProfileAsset);
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["my-seller-profile-moderation"],
    queryFn: () => getSnapshot(),
  });
  const { refetch } = profileQuery;
  const [form, setForm] = useState<StorefrontForm | null>(null);
  const formRef = useRef<StorefrontForm | null>(null);
  const actionRequestIds = useRef<Partial<Record<RequestAction, string>>>({});
  const [busyAction, setBusyAction] = useState<ProfileAction | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);

  const applyForm = useCallback((next: StorefrontForm | null) => {
    formRef.current = next;
    setForm(next);
  }, []);

  useEffect(() => {
    if (!profileQuery.data || formRef.current) return;
    applyForm(formFromSnapshot(profileQuery.data));
  }, [applyForm, profileQuery.data]);

  const refreshSnapshot = useCallback(
    async (preserveForm = true) => {
      const refreshed = await refetch();
      if (!refreshed.data) return;
      const snapshot = refreshed.data;
      const current = formRef.current;
      if (!current || !preserveForm) {
        applyForm(formFromSnapshot(snapshot));
        return;
      }
      applyForm({
        ...current,
        revision: snapshot.workingCopy.revision,
        companyCode:
          current.companyCode === current.savedCompanyCode
            ? snapshot.companyCode
            : current.companyCode,
        savedCompanyCode: snapshot.companyCode,
        companyCodeLockedAt: snapshot.companyCodeLockedAt,
      });
    },
    [applyForm, refetch],
  );
  const refreshPreviewSnapshot = useCallback(() => refreshSnapshot(true), [refreshSnapshot]);

  if (profileQuery.isError) {
    return (
      <div className="border border-destructive/40 bg-destructive/5 p-4 text-sm">
        {tr(storefrontCopy.loadFailed)}
      </div>
    );
  }

  const snapshot = profileQuery.data;
  if (!snapshot || !form) {
    return <div className="text-sm text-muted-foreground">{tr(storefrontCopy.loading)}</div>;
  }

  const dirty = formDiffersFromSnapshot(form, snapshot);
  const editorDisabled = !snapshot.actions.canEdit || busyAction !== null || mediaBusy;
  const workingLogo = previewForFormAsset(form.logoAssetId, snapshot.workingCopy.logo);
  const workingCover = previewForFormAsset(form.coverAssetId, snapshot.workingCopy.cover);

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    const current = formRef.current;
    if (!current || !snapshot?.actions.canEdit) return;
    setBusyAction("save");
    try {
      const companyCode = normalizeSubmittedCompanyCode(current.companyCode);
      if (!current.companyCodeLockedAt && companyCode !== current.savedCompanyCode) {
        const result = await saveCompanyCode({ data: { companyCode } });
        applyForm({
          ...current,
          companyCode: result.seller.company_code,
          savedCompanyCode: result.seller.company_code,
          companyCodeLockedAt: result.seller.company_code_locked_at,
        });
      }
      const result = await persistProfile(formRef.current ?? current);
      applyWorkingCopy(result.workingCopy);
      await refreshSnapshot(false);
      await queryClient.invalidateQueries({ queryKey: ["my-seller-profile"] });
      toast.success(tr(storefrontCopy.draftSaved));
    } catch (error) {
      if (isRevisionConflict(error)) await refreshSnapshot(true);
      const companyCodeError = readSellerCompanyCodeError(error);
      toast.error(
        companyCodeError ? tr(companyCodeErrorCopy[companyCodeError]) : profileErrorMessage(error),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function submitForReview() {
    const current = formRef.current;
    if (!current || !snapshot?.actions.canSubmit) return;
    if (formDiffersFromSnapshot(current, snapshot)) {
      toast.error(tr(storefrontCopy.saveBeforeSubmit));
      return;
    }
    await runRequestAction(
      "submit",
      () =>
        submitProfile({
          data: {
            expectedRevision: current.revision,
            requestId: requestIdFor("submit"),
          },
        }),
      storefrontCopy.submittedSuccess,
    );
  }

  async function withdrawLatestSubmission() {
    const latest = snapshot?.latestSubmission;
    if (!latest || !snapshot.actions.canWithdraw) return;
    await runRequestAction(
      "withdraw",
      () =>
        withdrawSubmission({
          data: {
            submissionId: latest.id,
            expectedRevision: latest.revision,
            requestId: requestIdFor("withdraw"),
          },
        }),
      storefrontCopy.withdrawnSuccess,
    );
  }

  async function updateStorefront(enabled: boolean) {
    const action: RequestAction = enabled ? "enable" : "disable";
    await runRequestAction(
      action,
      () =>
        setStorefrontEnabled({
          data: { enabled, requestId: requestIdFor(action) },
        }),
      enabled ? storefrontCopy.storefrontEnabledSuccess : storefrontCopy.storefrontDisabledSuccess,
    );
  }

  async function runRequestAction(
    action: RequestAction,
    operation: () => Promise<unknown>,
    successCopy: (typeof storefrontCopy)[keyof typeof storefrontCopy],
  ) {
    setBusyAction(action);
    try {
      await operation();
      clearRequestId(action);
      await refreshSnapshot(true);
      await queryClient.invalidateQueries({ queryKey: ["my-seller-profile"] });
      toast.success(tr(successCopy));
    } catch (error) {
      if (isStableActionError(error)) clearRequestId(action);
      if (isRevisionConflict(error)) await refreshSnapshot(true);
      toast.error(profileErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function requestIdFor(action: RequestAction) {
    const existing = actionRequestIds.current[action];
    if (existing) return existing;
    const created = crypto.randomUUID();
    actionRequestIds.current[action] = created;
    return created;
  }

  function clearRequestId(action: RequestAction) {
    delete actionRequestIds.current[action];
  }

  function update<Key extends keyof StorefrontForm>(key: Key, value: StorefrontForm[Key]) {
    const current = formRef.current;
    if (!current) return;
    applyForm({ ...current, [key]: value });
  }

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
    const current = formRef.current;
    if (!current) return;
    applyForm({
      ...current,
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
      if (isRevisionConflict(error)) await refreshSnapshot(true);
      try {
        await removeAsset({ data: { assetId } });
      } catch {
        // The durable cleanup state remains retryable through the server operation.
      }
      throw error;
    }
    if (previousAssetId && previousAssetId !== assetId) {
      try {
        await removeAsset({ data: { assetId: previousAssetId } });
      } catch {
        // Immutable historical submissions may still own the previous asset.
      }
    }
    await refreshSnapshot(false);
    toast.success(tr(kind === "logo" ? storefrontCopy.logoSaved : storefrontCopy.coverSaved));
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
    try {
      const result = await persistProfile(next);
      applyWorkingCopy(result.workingCopy);
    } catch (error) {
      if (isRevisionConflict(error)) await refreshSnapshot(true);
      throw error;
    }
    try {
      await removeAsset({ data: { assetId } });
    } catch {
      // Approved or historical submissions retain referenced private assets.
    }
    await refreshSnapshot(false);
    toast.success(tr(kind === "logo" ? storefrontCopy.logoRemoved : storefrontCopy.coverRemoved));
  }

  const inputClass = "border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">{tr(storefrontCopy.title)}</h1>
        <p className="text-sm text-muted-foreground">{tr(storefrontCopy.intro)}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusPanel title={tr(storefrontCopy.approvalTitle)}>
          <StatusBadge
            tone={snapshot.approvalState === "not_approved" ? "notApproved" : "approved"}
          >
            {approvalStateLabel(snapshot)}
          </StatusBadge>
          <p className="text-sm text-muted-foreground">{approvalStateHelp(snapshot)}</p>
          {snapshot.actions.canEnableStorefront || snapshot.actions.canDisableStorefront ? (
            <button
              type="button"
              className={`w-fit border px-3 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                snapshot.actions.canEnableStorefront
                  ? "border-emerald-600 bg-emerald-600 hover:bg-emerald-700"
                  : "border-destructive bg-destructive hover:bg-destructive/90"
              }`}
              disabled={busyAction !== null}
              onClick={() => void updateStorefront(snapshot.actions.canEnableStorefront)}
            >
              {busyAction === "enable" || busyAction === "disable"
                ? tr(storefrontCopy.updatingStorefront)
                : tr(
                    snapshot.actions.canEnableStorefront
                      ? storefrontCopy.enableStorefront
                      : storefrontCopy.disableStorefront,
                  )}
            </button>
          ) : null}
        </StatusPanel>

        <StatusPanel title={tr(storefrontCopy.reviewTitle)}>
          {snapshot.latestSubmission ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={snapshot.latestSubmission.status === "pending" ? "pending" : "neutral"}
                >
                  {submissionStatusLabel(snapshot.latestSubmission.status)}
                </StatusBadge>
                <span className="text-xs text-muted-foreground">
                  {tr(
                    snapshot.latestSubmission.kind === "initial"
                      ? storefrontCopy.initialSubmission
                      : storefrontCopy.updateSubmission,
                  )}
                </span>
              </div>
              <dl className="grid gap-1 text-xs text-muted-foreground">
                <div>
                  <dt className="inline font-medium text-foreground">
                    {tr(storefrontCopy.submittedAt)}:{" "}
                  </dt>
                  <dd className="inline">
                    {formatDate(snapshot.latestSubmission.submittedAt, lang)}
                  </dd>
                </div>
                {snapshot.latestSubmission.decidedAt ? (
                  <div>
                    <dt className="inline font-medium text-foreground">
                      {tr(storefrontCopy.decidedAt)}:{" "}
                    </dt>
                    <dd className="inline">
                      {formatDate(snapshot.latestSubmission.decidedAt, lang)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {snapshot.latestSubmission.sellerVisibleReason ? (
                <div className="border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  <p className="font-medium">{tr(storefrontCopy.feedbackTitle)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {snapshot.latestSubmission.sellerVisibleReason}
                  </p>
                </div>
              ) : null}
              {snapshot.actions.canWithdraw ? (
                <button
                  type="button"
                  className="w-fit border border-orange-600 bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                  disabled={busyAction !== null}
                  onClick={() => void withdrawLatestSubmission()}
                >
                  {busyAction === "withdraw"
                    ? tr(storefrontCopy.withdrawing)
                    : tr(storefrontCopy.withdraw)}
                </button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{tr(storefrontCopy.noSubmission)}</p>
          )}
        </StatusPanel>
      </div>

      {snapshot.approvedProfile ? (
        <ApprovedProfileSummary snapshot={snapshot} onPreviewRefresh={refreshPreviewSnapshot} />
      ) : null}

      <section className="border border-border bg-card/30 p-4 sm:p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">
            {tr(storefrontCopy.privateDraftTitle)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tr(
              snapshot.actions.canEdit
                ? storefrontCopy.privateDraftHelp
                : storefrontCopy.pendingReadOnly,
            )}
          </p>
        </div>

        <form onSubmit={saveDraft} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <SellerProfileMediaField
            kind="logo"
            preview={workingLogo}
            disabled={editorDisabled}
            onSelect={(assetId) => selectMedia("logo", assetId)}
            onRemove={() => removeMedia("logo")}
            onBusyChange={setMediaBusy}
            onPreviewRefresh={refreshPreviewSnapshot}
          />
          <SellerProfileMediaField
            kind="cover"
            preview={workingCover}
            disabled={editorDisabled}
            onSelect={(assetId) => selectMedia("cover", assetId)}
            onRemove={() => removeMedia("cover")}
            onBusyChange={setMediaBusy}
            onPreviewRefresh={refreshPreviewSnapshot}
          />
          <fieldset disabled={editorDisabled} className="contents">
            <Field label={tr(storefrontCopy.businessName)}>
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
                disabled={Boolean(form.companyCodeLockedAt) || editorDisabled}
                className={`${inputClass} uppercase disabled:cursor-not-allowed disabled:opacity-60`}
                autoComplete="off"
              />
              <span className="text-[11px] text-muted-foreground">
                {tr(
                  form.companyCodeLockedAt
                    ? companyCodeCopy.lockedHelp
                    : companyCodeCopy.unlockedHelp,
                )}
              </span>
            </Field>
            <Field label={tr(storefrontCopy.slug)}>
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
            <Field label={tr(storefrontCopy.businessCategory)}>
              <input
                value={tr(storefrontCopy.fashion)}
                disabled
                className={`${inputClass} opacity-60`}
              />
            </Field>
            <Field label={tr(storefrontCopy.city)}>
              <input
                maxLength={80}
                value={form.city}
                onChange={(event) => update("city", event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={tr(storefrontCopy.country)}>
              <input
                maxLength={80}
                value={form.country}
                onChange={(event) => update("country", event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={tr(storefrontCopy.whatsapp)}>
              <input
                maxLength={40}
                value={form.whatsapp}
                onChange={(event) => update("whatsapp", event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={tr(storefrontCopy.contactEmail)}>
              <input
                type="email"
                maxLength={255}
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={tr(storefrontCopy.establishedYear)}>
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
              <Field label={tr(storefrontCopy.about)}>
                <textarea
                  rows={5}
                  maxLength={4000}
                  value={form.about}
                  onChange={(event) => update("about", event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={editorDisabled}
              className="border border-orange-600 bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {busyAction === "save" ? tr(storefrontCopy.saving) : tr(storefrontCopy.saveDraft)}
            </button>
            {snapshot.actions.canSubmit ? (
              <button
                type="button"
                disabled={busyAction !== null || mediaBusy || dirty}
                className="border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
                onClick={() => void submitForReview()}
              >
                {busyAction === "submit"
                  ? tr(storefrontCopy.submitting)
                  : tr(storefrontCopy.submitReview)}
              </button>
            ) : null}
            {snapshot.actions.canSubmit && dirty ? (
              <p className="text-xs text-muted-foreground">{tr(storefrontCopy.saveBeforeSubmit)}</p>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function StatusPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border border-border bg-card/30 p-4">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "notApproved" | "approved" | "pending";
}) {
  const toneClass = {
    neutral: "border-border bg-background",
    notApproved: "border-primary/30 bg-primary/10 text-foreground",
    approved: "border-emerald-600 bg-emerald-600 text-white",
    pending: "border-primary/30 bg-primary/10 text-foreground",
  }[tone];

  return (
    <span className={`w-fit border px-2 py-1 text-xs font-medium ${toneClass}`}>{children}</span>
  );
}

function ApprovedProfileSummary({
  snapshot,
  onPreviewRefresh,
}: {
  snapshot: SellerProfileModerationSnapshot;
  onPreviewRefresh(): Promise<void>;
}) {
  const profile = snapshot.approvedProfile;
  if (!profile) return null;
  return (
    <section className="border border-border bg-card/30 p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold">
        {tr(storefrontCopy.approvedProfileTitle)}
      </h2>
      <p className="text-sm text-muted-foreground">{tr(storefrontCopy.approvedProfileHelp)}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[10rem_1fr]">
        <SellerProfileMediaPreviewImage
          preview={profile.logo}
          kind="logo"
          onPreviewRefresh={onPreviewRefresh}
        />
        <SellerProfileMediaPreviewImage
          preview={profile.cover}
          kind="cover"
          onPreviewRefresh={onPreviewRefresh}
        />
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <SummaryField label={tr(storefrontCopy.businessName)} value={profile.name} />
        <SummaryField label={tr(storefrontCopy.slug)} value={profile.slug} />
        <SummaryField label={tr(storefrontCopy.city)} value={profile.city} />
        <SummaryField label={tr(storefrontCopy.country)} value={profile.country} />
        <SummaryField label={tr(storefrontCopy.whatsapp)} value={profile.whatsapp} />
        <SummaryField label={tr(storefrontCopy.contactEmail)} value={profile.email} />
        <SummaryField
          label={tr(storefrontCopy.establishedYear)}
          value={profile.establishedYear ? String(profile.establishedYear) : null}
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <SummaryField label={tr(storefrontCopy.about)} value={profile.about} />
        </div>
      </dl>
    </section>
  );
}

function SummaryField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap">{value || "—"}</dd>
    </div>
  );
}

function formFromSnapshot(snapshot: SellerProfileModerationSnapshot): StorefrontForm {
  return {
    revision: snapshot.workingCopy.revision,
    name: snapshot.workingCopy.name,
    slug: snapshot.workingCopy.slug,
    city: snapshot.workingCopy.city ?? "",
    country: snapshot.workingCopy.country ?? "",
    whatsapp: snapshot.workingCopy.whatsapp ?? "",
    email: snapshot.workingCopy.email ?? "",
    about: snapshot.workingCopy.about ?? "",
    establishedYear: snapshot.workingCopy.establishedYear
      ? String(snapshot.workingCopy.establishedYear)
      : "",
    logoAssetId: snapshot.workingCopy.logo?.assetId ?? null,
    coverAssetId: snapshot.workingCopy.cover?.assetId ?? null,
    companyCode: snapshot.companyCode,
    savedCompanyCode: snapshot.companyCode,
    companyCodeLockedAt: snapshot.companyCodeLockedAt,
  };
}

function formDiffersFromSnapshot(form: StorefrontForm, snapshot: SellerProfileModerationSnapshot) {
  const workingCopy = snapshot.workingCopy;
  return (
    form.name !== workingCopy.name ||
    form.slug !== workingCopy.slug ||
    form.city !== (workingCopy.city ?? "") ||
    form.country !== (workingCopy.country ?? "") ||
    form.whatsapp !== (workingCopy.whatsapp ?? "") ||
    form.email !== (workingCopy.email ?? "") ||
    form.about !== (workingCopy.about ?? "") ||
    form.establishedYear !==
      (workingCopy.establishedYear ? String(workingCopy.establishedYear) : "") ||
    form.logoAssetId !== (workingCopy.logo?.assetId ?? null) ||
    form.coverAssetId !== (workingCopy.cover?.assetId ?? null) ||
    normalizeSubmittedCompanyCode(form.companyCode) !== snapshot.companyCode
  );
}

function previewForFormAsset(
  assetId: string | null,
  snapshotPreview: SellerProfileMediaPreview | null,
): SellerProfileMediaPreview | null {
  if (!assetId) return null;
  if (snapshotPreview?.assetId === assetId) return snapshotPreview;
  return {
    assetId,
    durableStatus: "available",
    deliveryStatus: "available",
    deliveryErrorCode: null,
    url: `/v1/seller-profile-assets/${assetId}`,
  };
}

function approvalStateLabel(snapshot: SellerProfileModerationSnapshot) {
  if (snapshot.approvalState === "approved_storefront_enabled") {
    return tr(storefrontCopy.approvedEnabled);
  }
  if (snapshot.approvalState === "approved_storefront_disabled") {
    return tr(storefrontCopy.approvedDisabled);
  }
  return tr(storefrontCopy.notApproved);
}

function approvalStateHelp(snapshot: SellerProfileModerationSnapshot) {
  if (snapshot.approvalState === "approved_storefront_enabled") {
    return tr(storefrontCopy.storefrontEnabledHelp);
  }
  if (snapshot.approvalState === "approved_storefront_disabled") {
    return tr(storefrontCopy.storefrontDisabledHelp);
  }
  return tr(storefrontCopy.notApprovedHelp);
}

function submissionStatusLabel(
  status: NonNullable<SellerProfileModerationSnapshot["latestSubmission"]>["status"],
) {
  const labels = {
    pending: storefrontCopy.pending,
    changes_requested: storefrontCopy.changesRequested,
    approved: storefrontCopy.approved,
    rejected: storefrontCopy.rejected,
    withdrawn: storefrontCopy.withdrawn,
  };
  return tr(labels[status]);
}

function formatDate(value: string, lang: ReturnType<typeof useLang>) {
  const locales = { EN: "en-GB", PL: "pl-PL", DE: "de-DE", VI: "vi-VN" } as const;
  return new Intl.DateTimeFormat(locales[lang], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isRevisionConflict(error: unknown) {
  return error instanceof Error && error.message.includes("seller_profile_revision_conflict");
}

function isStableActionError(error: unknown) {
  return (
    error instanceof Error && stableActionErrorCodes.some((code) => error.message.includes(code))
  );
}

function profileErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return tr(storefrontCopy.unavailable);
  if (error.message.includes("seller_profile_revision_conflict")) {
    return tr(storefrontCopy.revisionConflict);
  }
  if (error.message.includes("seller_approval_submission_invalid")) {
    return tr(storefrontCopy.invalid);
  }
  if (error.message.includes("seller_approval_submission_conflict")) {
    return tr(storefrontCopy.actionConflict);
  }
  if (error.message.includes("seller_profile_slug_conflict")) {
    return tr(storefrontCopy.slugConflict);
  }
  if (error.message.includes("seller_approval_required")) {
    return tr(storefrontCopy.approvalRequired);
  }
  if (error.message.includes("seller_approval_not_found")) {
    return tr(storefrontCopy.notFound);
  }
  if (error.message.includes("seller_profile_image_not_ready")) {
    return tr(storefrontCopy.imageNotReady);
  }
  if (error.message.includes("seller_profile_moderation_status_unavailable")) {
    return tr(storefrontCopy.loadFailed);
  }
  return tr(storefrontCopy.unavailable);
}
