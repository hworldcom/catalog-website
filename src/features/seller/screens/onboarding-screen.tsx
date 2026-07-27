import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";

import { listCategoriesForPicker } from "@/features/seller/categories.functions";
import { onboardSeller } from "@/features/seller/onboarding.functions";
import { toast } from "sonner";

import { Field } from "../components/field";

export function OnboardingScreen() {
  const onboard = useServerFn(onboardSeller);
  const listCats = useServerFn(listCategoriesForPicker);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);

  const cats = useQuery({
    queryKey: ["categories-picker"],
    queryFn: () => listCats(),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onboard({
        data: {
          name,
          city,
          country,
          primary_category_id: categoryId,
          whatsapp: whatsapp.replace(/[^\d+]/g, ""),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["my-seller"] });
      toast.success("Storefront created — a few more steps to publish.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create storefront");
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
            onChange={(e) => setName(e.target.value)}
            className="border border-border bg-background px-3 py-2 text-sm"
            placeholder="Kesar Textiles"
          />
        </Field>
        <Field label="Primary category">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Choose a category…</option>
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
