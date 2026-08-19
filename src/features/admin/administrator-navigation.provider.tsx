import type { ReactNode } from "react";

import type { AdministratorNavigationContext } from "./administrator-moderation.functions";
import { AdministratorNavigationContextValue } from "./administrator-navigation.context";

export function AdministratorNavigationProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AdministratorNavigationContext;
}) {
  return (
    <AdministratorNavigationContextValue.Provider value={value}>
      {children}
    </AdministratorNavigationContextValue.Provider>
  );
}
