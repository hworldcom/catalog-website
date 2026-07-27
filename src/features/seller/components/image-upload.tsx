import { useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

import {
  buildImageUploadPath,
  IMAGE_UPLOAD_EXTENSIONS,
  type ImageUploadFolder,
  validateImageUpload,
} from "./image-upload.helpers";

type ImageUploadProps = {
  value: string;
  onChange: (url: string) => void;
  folder: ImageUploadFolder;
  label: string;
};

export function ImageUpload({ value, onChange, folder, label }: ImageUploadProps) {
  const [busy, setBusy] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const validation = validateImageUpload(file);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }

    setBusy(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("You must be signed in to upload images.");
      const uid = userData.user.id;
      const path = buildImageUploadPath({
        userId: uid,
        folder,
        extension: validation.extension,
      });

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("product-images").getPublicUrl(path);
      onChange(publicUrlData.publicUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={Object.keys(IMAGE_UPLOAD_EXTENSIONS).join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary disabled:opacity-60"
        >
          {busy ? "Uploading…" : value ? "Replace image" : "Upload image"}
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-sm text-muted-foreground hover:text-destructive"
          >
            Remove
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowUrl((s) => !s)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {showUrl ? "Hide URL" : "Use URL instead"}
        </button>
      </div>
      {showUrl ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className="border border-border bg-background px-3 py-2 text-sm"
        />
      ) : null}
      {value ? (
        <img src={value} alt={label} className="mt-1 h-32 w-32 border border-border object-cover" />
      ) : null}
    </div>
  );
}
