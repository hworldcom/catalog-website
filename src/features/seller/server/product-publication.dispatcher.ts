import type { ProductPublicationWorker } from "./product-publication.worker";
import type { ProductPublicationWorkerResult } from "./product-publication.types";

export interface ProductPublicationDispatcher {
  dispatch(productDraftId: string): Promise<"accepted">;
}

type WorkerFactory = () => Promise<Pick<ProductPublicationWorker, "run">>;
type Schedule = (work: () => void) => void;
type Log = (entry: LocalProductPublicationLog) => void;
type MarkDispatchFailed = (productDraftId: string) => Promise<void>;

export type LocalProductPublicationLog =
  | {
      event: "local_product_publication_finished";
      productDraftId: string;
      status: ProductPublicationWorkerResult["status"];
    }
  | {
      event: "local_product_publication_failed";
      productDraftId: string;
      errorCode: "product_publication_dispatch_failed";
      exceptionClass: string;
    };

export class LocalProductPublicationDispatcher implements ProductPublicationDispatcher {
  private readonly activeProductDrafts = new Set<string>();

  constructor(
    private readonly createWorker: WorkerFactory,
    private readonly schedule: Schedule = queueMicrotask,
    private readonly log: Log = writeLog,
    private readonly markDispatchFailed: MarkDispatchFailed = async () => undefined,
  ) {}

  async dispatch(productDraftId: string): Promise<"accepted"> {
    if (this.activeProductDrafts.has(productDraftId)) return "accepted";

    this.activeProductDrafts.add(productDraftId);
    try {
      this.schedule(() => void this.execute(productDraftId));
    } catch (error) {
      this.activeProductDrafts.delete(productDraftId);
      throw error;
    }
    return "accepted";
  }

  private async execute(productDraftId: string): Promise<void> {
    try {
      const worker = await this.createWorker();
      const result = await worker.run(productDraftId);
      this.log({
        event: "local_product_publication_finished",
        productDraftId,
        status: result.status,
      });
    } catch (error) {
      await this.markDispatchFailed(productDraftId);
      this.log({
        event: "local_product_publication_failed",
        productDraftId,
        errorCode: "product_publication_dispatch_failed",
        exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
      });
    } finally {
      this.activeProductDrafts.delete(productDraftId);
    }
  }
}

function writeLog(entry: LocalProductPublicationLog): void {
  const severity = entry.event === "local_product_publication_failed" ? "error" : "info";
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "bazoria_product_publication_dispatcher",
    severity,
    ...entry,
  });
  if (severity === "error") {
    console.error(line);
    return;
  }
  console.info(line);
}
