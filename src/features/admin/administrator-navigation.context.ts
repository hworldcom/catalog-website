import { createContext, useContext } from "react";

import type { AdministratorNavigationContext } from "./administrator-moderation.functions";

const defaultContext: AdministratorNavigationContext = {
  prototypeAdministrator: false,
};

export const AdministratorNavigationContextValue =
  createContext<AdministratorNavigationContext>(defaultContext);

export function useAdministratorNavigationContext(): AdministratorNavigationContext {
  return useContext(AdministratorNavigationContextValue);
}
