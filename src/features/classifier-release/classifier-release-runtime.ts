import { useEffect, useState } from "react";

import {
  getOptionalInitializedRuntimePublicConfig,
  type RuntimePublicConfig,
} from "@/lib/runtime-public-config";

export function useClassifierAssistedUploadEnabled(): boolean {
  return useRuntimePublicConfig()?.classifierAssistedUploadEnabled ?? false;
}

export function useRuntimePublicConfig(): RuntimePublicConfig | null {
  const [config, setConfig] = useState<RuntimePublicConfig | null>(null);
  useEffect(() => {
    setConfig(getOptionalInitializedRuntimePublicConfig());
  }, []);
  return config;
}
