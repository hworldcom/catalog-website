import { readDefaultClassifierSellerId } from "./classifier-import.config";
import type {
  ClassifierImportRepository,
  EligibleDestinationSeller,
} from "./classifier-import.repository";
import { ClassifierImportApiError } from "./classifier-import.types";

export type ClassifierImportDestinationSnapshot = {
  destinationSeller: EligibleDestinationSeller;
  source: "prototype_default";
};

export interface ClassifierImportDestinationResolver {
  resolveDestination(): Promise<EligibleDestinationSeller>;
}

export interface ClassifierImportDestinationReader {
  getDestination(): Promise<ClassifierImportDestinationSnapshot>;
}

export class DefaultClassifierImportDestinationService
  implements ClassifierImportDestinationResolver, ClassifierImportDestinationReader
{
  constructor(
    private readonly repository: Pick<ClassifierImportRepository, "getEligibleSeller">,
    private readonly resolveDefaultSellerId: () => string = readDefaultClassifierSellerId,
  ) {}

  async resolveDestination(): Promise<EligibleDestinationSeller> {
    let sellerId: string;
    try {
      sellerId = this.resolveDefaultSellerId();
    } catch {
      throw new ClassifierImportApiError(
        500,
        "classifier_import_configuration_invalid",
        "Classifier import is not configured.",
      );
    }

    const seller = await this.repository.getEligibleSeller(sellerId);
    if (!seller) {
      throw new ClassifierImportApiError(
        503,
        "classifier_import_default_seller_unavailable",
        "The default classifier import store is unavailable.",
      );
    }
    return seller;
  }

  async getDestination(): Promise<ClassifierImportDestinationSnapshot> {
    return {
      destinationSeller: await this.resolveDestination(),
      source: "prototype_default",
    };
  }
}
