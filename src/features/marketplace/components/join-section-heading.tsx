import { cn } from "@/lib/utils";

export function JoinSectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      <p className="text-xs font-semibold uppercase text-primary">{eyebrow}</p>
      <h2 className="mt-3 break-words font-display text-3xl font-semibold sm:text-4xl">{title}</h2>
      {lead ? (
        <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">{lead}</p>
      ) : null}
    </div>
  );
}
