export const CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE =
  "classifier_assisted_upload_disabled" as const;
export const CLASSIFIER_ASSISTED_UPLOAD_DISABLED_MESSAGE =
  "Classifier-assisted uploads are unavailable in this environment." as const;

export class ClassifierAssistedUploadDisabledError extends Error {
  readonly statusCode = 503;
  readonly code = CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE;

  constructor() {
    super(CLASSIFIER_ASSISTED_UPLOAD_DISABLED_MESSAGE);
    this.name = "ClassifierAssistedUploadDisabledError";
  }
}

export function classifierAssistedUploadDisabledResponse(): Response {
  return Response.json(
    {
      code: CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE,
      message: CLASSIFIER_ASSISTED_UPLOAD_DISABLED_MESSAGE,
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
