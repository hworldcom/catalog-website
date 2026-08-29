import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

export function PublicContainer({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1320px] px-5 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}
