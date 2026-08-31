export const LOCAL_PUBLIC_SITE_ORIGIN = "http://localhost:8080";

const DEPLOYMENT_ENVIRONMENTS = ["local", "uat", "production"] as const;

type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export function resolvePublicSiteOrigin(environment: Record<string, string | undefined>): string {
  const deploymentEnvironment = readDeploymentEnvironment(
    environment.BAZORIA_DEPLOYMENT_ENVIRONMENT,
  );
  const configuredOrigin = environment.BAZORIA_PUBLIC_SITE_URL?.trim();

  if (!configuredOrigin) {
    if (deploymentEnvironment === "local") return LOCAL_PUBLIC_SITE_ORIGIN;
    throw configurationError("BAZORIA_PUBLIC_SITE_URL is required in hosted environments");
  }

  let parsed: URL;
  try {
    parsed = new URL(configuredOrigin);
  } catch {
    throw configurationError("BAZORIA_PUBLIC_SITE_URL must be an absolute URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw configurationError("BAZORIA_PUBLIC_SITE_URL must use HTTP or HTTPS");
  }
  if (deploymentEnvironment !== "local" && parsed.protocol !== "https:") {
    throw configurationError("BAZORIA_PUBLIC_SITE_URL must use HTTPS in hosted environments");
  }
  if (parsed.username || parsed.password) {
    throw configurationError("BAZORIA_PUBLIC_SITE_URL must not include credentials");
  }
  if (parsed.href !== `${parsed.origin}/`) {
    throw configurationError(
      "BAZORIA_PUBLIC_SITE_URL must be a root origin without a path, query, or fragment",
    );
  }

  return parsed.origin;
}

function readDeploymentEnvironment(value: string | undefined): DeploymentEnvironment {
  const normalized = value?.trim();
  if (DEPLOYMENT_ENVIRONMENTS.includes(normalized as DeploymentEnvironment)) {
    return normalized as DeploymentEnvironment;
  }
  throw configurationError("BAZORIA_DEPLOYMENT_ENVIRONMENT must be local, uat, or production");
}

function configurationError(message: string): Error {
  return new Error(`public_site_configuration_invalid: ${message}`);
}
