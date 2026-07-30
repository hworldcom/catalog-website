import { describe, expect, it } from "vitest";

import {
  clearSellerClassifierCreationSession,
  loadSellerClassifierCreationSession,
  saveSellerClassifierCreationSession,
} from "./seller-classifier-creation-session";

describe("seller classifier creation session", () => {
  it("preserves one request and workflow across reloads", () => {
    const storage = memoryStorage();
    saveSellerClassifierCreationSession({ requestId: uuid(1), workflowId: uuid(2) }, storage);

    expect(loadSellerClassifierCreationSession(storage)).toEqual({
      requestId: uuid(1),
      workflowId: uuid(2),
    });
    clearSellerClassifierCreationSession(storage);
    expect(loadSellerClassifierCreationSession(storage)).toBeNull();
  });

  it("ignores malformed persisted state", () => {
    const storage = memoryStorage();
    storage.setItem("bazoria.seller-classifier.creation", '{"requestId":"invalid"}');
    expect(loadSellerClassifierCreationSession(storage)).toBeNull();
  });
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
