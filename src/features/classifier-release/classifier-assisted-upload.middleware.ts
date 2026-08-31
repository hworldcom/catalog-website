import { createMiddleware } from "@tanstack/react-start";

export const requireClassifierAssistedUpload = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { ClassifierAssistedUploadDisabledError } = await import("./classifier-assisted-upload");
    const { assertClassifierAssistedUploadEnabled } =
      await import("./server/classifier-assisted-upload-gate");
    try {
      assertClassifierAssistedUploadEnabled();
    } catch (error) {
      if (error instanceof ClassifierAssistedUploadDisabledError) {
        const { setResponseStatus } = await import("@tanstack/react-start/server");
        setResponseStatus(error.statusCode);
      }
      throw error;
    }
    return next();
  },
);
