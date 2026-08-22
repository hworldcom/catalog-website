import { OAuth2Client } from "google-auth-library";

const GOOGLE_TOKEN_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export type VerifiedTaskIdentity = {
  email: string;
};

export interface TaskIdentityVerifier {
  verify(token: string): Promise<VerifiedTaskIdentity>;
}

export interface GoogleIdentityTokenApi {
  verifyIdToken(options: { idToken: string; audience: string }): Promise<{
    getPayload():
      | {
          iss?: string;
          email?: string;
          email_verified?: boolean;
        }
      | undefined;
  }>;
}

export class GoogleTaskIdentityVerifier implements TaskIdentityVerifier {
  private readonly api: GoogleIdentityTokenApi;

  constructor(
    private readonly audience: string,
    api?: GoogleIdentityTokenApi,
  ) {
    const client = new OAuth2Client();
    this.api = api ?? {
      verifyIdToken: (options) => client.verifyIdToken(options),
    };
  }

  async verify(token: string): Promise<VerifiedTaskIdentity> {
    const ticket = await this.api.verifyIdToken({ idToken: token, audience: this.audience });
    const payload = ticket.getPayload();
    if (
      !payload ||
      !payload.iss ||
      !GOOGLE_TOKEN_ISSUERS.has(payload.iss) ||
      payload.email_verified !== true ||
      !payload.email
    ) {
      throw new Error("The task identity token is invalid.");
    }
    return { email: payload.email };
  }
}
