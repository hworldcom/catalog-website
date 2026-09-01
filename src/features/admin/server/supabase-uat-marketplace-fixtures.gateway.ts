import { createHash } from "node:crypto";
import { basename } from "node:path";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Sql } from "postgres";

import type { PrototypeAdministratorRequestContext } from "@/features/admin/prototype-administrator.middleware";
import { LocalProductActivationDispatcher } from "@/features/admin/server/product-activation.dispatcher";
import { SupabaseProductActivationRepository } from "@/features/admin/server/product-activation.repository";
import {
  decideProductModerationSubmission,
  retryProductActivationDispatch,
  retryProductActivationRun,
} from "@/features/admin/server/product-activation.service";
import { ProductActivationWorker } from "@/features/admin/server/product-activation.worker";
import { ProductDraftTitleService } from "@/features/product-draft-title/product-draft-title.service";
import { SupabaseProductDraftTitleRepository } from "@/features/product-draft-title/server/supabase-product-draft-title.repository";
import { ProductDraftImageLifecycleService } from "@/features/seller/server/product-draft-image-lifecycle.service";
import { SupabaseProductDraftImageLifecycleRepository } from "@/features/seller/server/supabase-product-draft-image-lifecycle.repository";
import { SupabaseProductDraftImageLifecycleStorage } from "@/features/seller/server/product-draft-image-lifecycle.storage";
import { ProductModerationService } from "@/features/seller/server/product-moderation.service";
import { productModerationSnapshotSchema } from "@/features/seller/product-moderation-snapshot.types";
import { SupabaseProductPublicationStorage } from "@/features/seller/server/product-publication.storage";
import { SellerProfileMediaService } from "@/features/seller/server/seller-profile-media.service";
import { SupabaseSellerProfileMediaRepository } from "@/features/seller/server/supabase-seller-profile-media.repository";
import { SupabaseSellerProfileMediaStorage } from "@/features/seller/server/seller-profile-media.storage";
import {
  decideSellerProfileSubmission,
  setOwnedSellerStorefrontEnabled,
  submitOwnedSellerProfile,
} from "@/features/seller/server/seller-profile-moderation.service";
import {
  readOwnedSellerProfile,
  saveOwnedSellerProfile,
} from "@/features/seller/server/seller-profile-working-copy.service";
import { SELLER_PROFILE_IMAGE_BUCKET } from "@/features/seller/seller-profile-media.types";
import type { Database } from "@/lib/supabase/types";

import {
  UatMarketplaceFixtureActivationCoordinator,
  type UatFixtureActivationBackend,
  type UatFixtureActivationRun,
} from "./uat-marketplace-fixtures.activation";
import {
  UAT_MARKETPLACE_FIXTURE_BUNDLE_VERSION,
  UAT_MARKETPLACE_SELLERS,
} from "./uat-marketplace-fixtures.manifest";
import type {
  UatMarketplaceFixtureAsset,
  UatMarketplaceFixtureGateway,
  UatMarketplaceFixtureResetPlan,
  UatMarketplaceFixtureResetSummary,
  UatMarketplaceFixtureVerification,
} from "./uat-marketplace-fixtures.service";

type AdminClient = SupabaseClient<Database>;
type SellerRow = Database["public"]["Tables"]["sellers"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];

const PRIVATE_IMAGE_BUCKET = "product-draft-images";
const PUBLIC_IMAGE_BUCKET = "product-images";
const STORAGE_BUCKETS = [
  PRIVATE_IMAGE_BUCKET,
  PUBLIC_IMAGE_BUCKET,
  SELLER_PROFILE_IMAGE_BUCKET,
] as const;
const STORAGE_PAGE_SIZE = 100;
const CLAIM_TIMEOUT_SECONDS = 360;
const BUSINESS_TABLES = [
  "classifier_import_group_outcomes",
  "classifier_import_runs",
  "delegated_administrator_action_attempts",
  "direct_product_legacy_cover_allowances",
  "leads",
  "product_activation_cleanup_items",
  "product_activation_dispatch_retries",
  "product_activation_recovery_requests",
  "product_archive_restore_operations",
  "product_audience_memberships",
  "product_code_allocations",
  "product_draft_description_generation_attempts",
  "product_draft_descriptions",
  "product_draft_facts",
  "product_draft_image_promotions",
  "product_draft_image_storage_cutovers",
  "product_draft_image_storage_reconciliations",
  "product_draft_images",
  "product_draft_source_memberships",
  "product_image_publication_cutover_changes",
  "product_image_publication_items",
  "product_image_publication_runs",
  "product_images",
  "product_moderation_events",
  "product_moderation_submission_images",
  "product_moderation_submissions",
  "product_moderation_working_copies",
  "product_moderation_working_copy_images",
  "products",
  "seller_classifier_batches",
  "seller_profile_assets",
  "seller_profile_events",
  "seller_profile_submissions",
  "seller_profile_working_copies",
  "seller_slug_aliases",
  "sellers",
] as const;
const REQUIRED_FUNCTIONS = [
  "complete_seller_profile_asset_upload",
  "create_seller_with_company_code",
  "decide_product_moderation_submission",
  "decide_seller_profile_submission",
  "finalize_product_activation",
  "normalize_product_audience_set",
  "prepare_initial_product_draft_image_uploads",
  "prepare_seller_profile_asset_upload",
  "save_initial_product_draft_with_description",
  "save_seller_profile_working_copy",
  "set_seller_storefront_enabled",
  "submit_product_moderation",
  "submit_seller_profile_working_copy",
] as const;

const activationConfig = {
  maximumImageCount: 20,
  itemConcurrency: 3,
  itemTimeoutMs: 30_000,
  workerDeadlineMs: 240_000,
  claimTimeoutSeconds: CLAIM_TIMEOUT_SECONDS,
};

export class SupabaseUatMarketplaceFixtureGateway implements UatMarketplaceFixtureGateway {
  private readonly activationRepository: SupabaseProductActivationRepository;
  private readonly activationDispatcher: LocalProductActivationDispatcher;
  private readonly activationCoordinator: UatMarketplaceFixtureActivationCoordinator;
  private readonly draftImages: ProductDraftImageLifecycleService;
  private readonly draftTitles: ProductDraftTitleService;
  private readonly moderation: ProductModerationService;
  private readonly profileMedia: SellerProfileMediaService;
  private readonly publicationStorage: SupabaseProductPublicationStorage;

  constructor(
    private readonly database: AdminClient,
    private readonly sql: Sql,
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly administratorUserId: string,
    private readonly administratorUserIds: string[],
  ) {
    this.draftTitles = new ProductDraftTitleService(
      new SupabaseProductDraftTitleRepository(database),
    );
    this.draftImages = new ProductDraftImageLifecycleService(
      new SupabaseProductDraftImageLifecycleRepository(database),
      new SupabaseProductDraftImageLifecycleStorage({ database, supabaseUrl, serviceRoleKey }),
    );
    this.profileMedia = new SellerProfileMediaService(
      new SupabaseSellerProfileMediaRepository(database),
      new SupabaseSellerProfileMediaStorage({ database, supabaseUrl, serviceRoleKey }),
    );
    this.moderation = new ProductModerationService(database as never, database as never);
    this.publicationStorage = new SupabaseProductPublicationStorage({
      supabaseUrl,
      serviceRoleKey,
    });
    this.activationRepository = new SupabaseProductActivationRepository(database as never);
    this.activationDispatcher = new LocalProductActivationDispatcher(
      this.activationRepository,
      async () =>
        new ProductActivationWorker(
          this.activationRepository,
          this.publicationStorage,
          activationConfig,
        ),
      {
        ...activationConfig,
        deploymentEnvironment: "local",
        dispatchMode: "local",
        recoveryBatchSize: 25,
        recoveryIntervalMs: 30_000,
        supabaseUrl,
        serviceRoleKey,
      },
    );
    this.activationCoordinator = new UatMarketplaceFixtureActivationCoordinator(
      this.activationBackend(),
      CLAIM_TIMEOUT_SECONDS,
    );
  }

  async planReset(
    preservedAdministratorUserIds: string[],
  ): Promise<UatMarketplaceFixtureResetPlan> {
    const preserved = [
      ...new Set(preservedAdministratorUserIds.map((id) => id.toLowerCase())),
    ].sort();
    const users = await this.listAuthUsers();
    const storageObjectKeys = Object.fromEntries(
      await Promise.all(
        STORAGE_BUCKETS.map(async (bucket) => [bucket, await this.listStorageObjectKeys(bucket)]),
      ),
    );
    return {
      authUserIds: users
        .map((user) => user.id)
        .filter((id) => !preserved.includes(id))
        .sort(),
      databaseRows: await this.countBusinessRows(preserved),
      preservedAdministratorUserIds: preserved,
      storageObjectKeys,
    };
  }

  async reset(plan: UatMarketplaceFixtureResetPlan): Promise<UatMarketplaceFixtureResetSummary> {
    const plannedStorageObjects = Object.values(plan.storageObjectKeys).reduce(
      (total, keys) => total + keys.length,
      0,
    );
    let deletedStorageObjects = 0;
    for (const bucket of STORAGE_BUCKETS) {
      deletedStorageObjects += await this.removeAndVerifyStorageObjects(
        bucket,
        plan.storageObjectKeys[bucket] ?? [],
      );
    }

    const deletedDatabaseRows = await this.truncateBusinessData(plan.preservedAdministratorUserIds);
    let deletedAuthUsers = 0;
    for (const userId of plan.authUserIds) {
      const response = await this.database.auth.admin.deleteUser(userId);
      if (response.error && !isAuthUserMissing(response.error.message)) {
        throw new Error("uat_marketplace_fixture_reset_failed");
      }
      if (!response.error) deletedAuthUsers += 1;
    }
    await this.verifyReset(plan.preservedAdministratorUserIds);
    return {
      deletedAuthUsers,
      deletedDatabaseRows,
      deletedStorageObjects,
      plannedAuthUsers: plan.authUserIds.length,
      plannedDatabaseRows: plan.databaseRows,
      plannedStorageObjects,
    };
  }

  async preflightSeed(assets: Map<string, UatMarketplaceFixtureAsset>): Promise<void> {
    await this.requireReferenceData();
    const expectedSlugs = new Set(UAT_MARKETPLACE_SELLERS.map((seller) => seller.slug));
    const expectedTitles = new Set(
      UAT_MARKETPLACE_SELLERS.flatMap((seller) => seller.products.map((product) => product.title)),
    );
    const sellers = await this.listAllSellers();
    if (sellers.some((seller) => !expectedSlugs.has(seller.slug))) throw fixtureConflict();

    const users = await this.listAuthUsers();
    const usersById = new Map(users.map((user) => [user.id, user]));
    for (const user of users) {
      if (this.administratorUserIds.includes(user.id)) continue;
      const slug = fixtureUserSlug(user);
      if (!slug || !expectedSlugs.has(slug)) throw fixtureConflict();
    }
    if (
      sellers.some(
        (seller) =>
          !seller.owner_id || fixtureUserSlug(usersById.get(seller.owner_id)) !== seller.slug,
      )
    ) {
      throw fixtureConflict();
    }

    const roles = await this.database.from("user_roles").select("user_id,role");
    if (roles.error) throw databaseFailure("preflight_user_roles", roles.error);
    if (
      roles.data.some((role) => {
        if (role.role === "admin") return !this.administratorUserIds.includes(role.user_id);
        if (role.role !== "seller") return true;
        const slug = fixtureUserSlug(usersById.get(role.user_id));
        return !slug || !expectedSlugs.has(slug);
      })
    ) {
      throw fixtureConflict();
    }

    const products = await this.database.from("products").select("id,seller_id,title");
    if (products.error) throw databaseFailure("preflight_products", products.error);
    const sellerSlugsById = new Map(sellers.map((seller) => [seller.id, seller.slug]));
    const expectedTitlesBySlug = new Map(
      UAT_MARKETPLACE_SELLERS.map((seller) => [
        seller.slug,
        new Set(seller.products.map((product) => product.title)),
      ]),
    );
    if (
      products.data.some((product) => {
        const sellerSlug = sellerSlugsById.get(product.seller_id);
        return (
          !expectedTitles.has(product.title) ||
          !sellerSlug ||
          !expectedTitlesBySlug.get(sellerSlug)?.has(product.title)
        );
      })
    ) {
      throw fixtureConflict();
    }

    const unrelated = await this.sql<{ count: number }[]>`
      SELECT (
        (SELECT count(*) FROM public.leads) +
        (SELECT count(*) FROM public.classifier_import_runs) +
        (SELECT count(*) FROM public.seller_classifier_batches) +
        (SELECT count(*) FROM public.delegated_administrator_action_attempts)
      )::integer AS count
    `;
    if ((unrelated[0]?.count ?? 0) > 0) throw fixtureConflict();

    const linkedKeys = await this.linkedStorageObjectKeys();
    for (const bucket of STORAGE_BUCKETS) {
      const actual = await this.listStorageObjectKeys(bucket);
      if (actual.some((key) => !linkedKeys[bucket].has(key))) throw fixtureConflict();
    }
    if (assets.size !== expectedAssetCount()) {
      throw new Error("uat_marketplace_fixture_reference_data_invalid");
    }
  }

  async ensureSeller(
    input: Parameters<UatMarketplaceFixtureGateway["ensureSeller"]>[0],
  ): Promise<{ sellerId: string; sellerUserId: string }> {
    try {
      const user = await this.ensureQaUser(input.fixture.email, input.password, input.fixture.slug);
      const fashionCategoryId = await this.requireCategoryId("fashion", false);
      const seller = await this.ensureSellerRecord(user.id, fashionCategoryId, input.fixture);
      const logoAssetId = await this.ensureProfileAsset(
        seller.id,
        "logo",
        input.logo,
        input.fixture.slug,
      );
      const coverAssetId = await this.ensureProfileAsset(
        seller.id,
        "cover",
        input.cover,
        input.fixture.slug,
      );

      const expectedProfile = {
        name: input.fixture.name,
        slug: input.fixture.slug,
        city: input.fixture.city,
        country: input.fixture.country,
        whatsapp: null,
        email: input.fixture.email,
        about: input.fixture.about,
        establishedYear: input.fixture.establishedYear,
        logoAssetId,
        coverAssetId,
      };
      const sellerRequestId = deterministicUuid(`seller:${input.fixture.slug}:submit`);
      let submission = await this.findSellerSubmission(seller.id, sellerRequestId);
      if (!submission) {
        const current = await readOwnedSellerProfile({
          requester: this.database,
          administrator: this.database as never,
          userId: user.id,
        });
        const profile = profileMatches(current.workingCopy, expectedProfile)
          ? current.workingCopy
          : (
              await saveOwnedSellerProfile({
                requester: this.database,
                administrator: this.database as never,
                userId: user.id,
                patch: { expectedRevision: current.workingCopy.revision, ...expectedProfile },
              })
            ).workingCopy;
        submission = (
          await submitOwnedSellerProfile({
            requester: this.database,
            administrator: this.database as never,
            userId: user.id,
            expectedRevision: profile.revision,
            requestId: sellerRequestId,
          })
        ).submission;
      } else if (!sellerSubmissionMatches(submission, expectedProfile)) {
        throw fixtureConflict();
      }
      if (submission.status === "pending") {
        submission = (
          await decideSellerProfileSubmission({
            authorization: this.administratorAuthorization(),
            administrator: this.database as never,
            sellerId: seller.id,
            submissionId: submission.id,
            expectedRevision: submission.revision,
            decision: "approve",
            reason: null,
            requestId: deterministicUuid(`seller:${input.fixture.slug}:approve`),
          })
        ).submission;
      }
      if (submission.status !== "approved") throw moderationFailed();
      await setOwnedSellerStorefrontEnabled({
        requester: this.database,
        administrator: this.database as never,
        userId: user.id,
        enabled: true,
        requestId: deterministicUuid(`seller:${input.fixture.slug}:enable-storefront`),
      });
      return { sellerId: seller.id, sellerUserId: user.id };
    } catch (error) {
      throw mapFixturePhaseError("seller", input.fixture.slug, error);
    }
  }

  async ensureProduct(
    input: Parameters<UatMarketplaceFixtureGateway["ensureProduct"]>[0],
  ): Promise<void> {
    try {
      const categoryId = await this.requireCategoryId(input.fixture.categorySlug, true);
      let product = await this.findFixtureProduct(input.sellerId, input.fixture.title);
      if (!product) {
        const created = await this.draftTitles.saveSellerProduct({
          sellerId: input.sellerId,
          title: input.fixture.title,
          productFields: productFields(input, categoryId),
        });
        product = await this.requireProduct(created.productDraftId, input.sellerId);
      }
      if (product.status === "archived" || product.category_id !== categoryId) {
        throw fixtureConflict();
      }

      const requestIdentity = `${input.sellerSlug}:${input.fixture.title}`;
      const sellerRequestId = deterministicUuid(`product:${requestIdentity}:submit`);
      let submission = await this.findProductSubmission(product.id, sellerRequestId);

      if (!submission) {
        if (product.status !== "draft") throw moderationFailed();
        if (!(await this.productFieldsMatch(product, input, categoryId))) {
          await this.draftTitles.saveSellerProduct({
            productDraftId: product.id,
            expectedModerationRevision: product.moderation_revision,
            sellerId: input.sellerId,
            title: input.fixture.title,
            productFields: productFields(input, categoryId),
          });
          product = await this.requireProduct(product.id, input.sellerId);
        }
        product = await this.ensureProductImages(product, input);
        submission = await this.moderation.submitForSeller({
          userId: input.sellerUserId,
          sellerId: input.sellerId,
          productDraftId: product.id,
          expectedModerationRevision: product.moderation_revision,
          requestId: sellerRequestId,
        });
      } else if (!productSubmissionMatches(submission.snapshot, input, categoryId)) {
        throw fixtureConflict();
      }
      if (submission.reviewStatus === "pending") {
        await decideProductModerationSubmission({
          authorization: this.administratorAuthorization(),
          repository: this.activationRepository,
          dispatcher: this.activationDispatcher,
          submissionId: submission.id,
          expectedRevision: submission.revision,
          decision: "approve",
          reason: null,
          decisionRequestId: deterministicUuid(`product:${requestIdentity}:approve`),
        });
      } else if (submission.reviewStatus !== "approved") {
        throw moderationFailed();
      }

      await this.activationCoordinator.complete({
        submissionId: submission.id,
        retryActivationRequestId: deterministicUuid(`product:${requestIdentity}:retry-activation`),
        retryDispatchRequestId: deterministicUuid(`product:${requestIdentity}:retry-dispatch`),
      });
      const published = await this.requireProduct(product.id, input.sellerId);
      if (
        published.status !== "published" ||
        !published.product_code ||
        !published.cover_image_url
      ) {
        throw activationFailed();
      }
    } catch (error) {
      throw mapFixturePhaseError("product", input.fixture.title, error);
    }
  }

  async verify(
    assets: Map<string, UatMarketplaceFixtureAsset>,
  ): Promise<UatMarketplaceFixtureVerification> {
    try {
      const sellerResponse = await this.database
        .from("sellers")
        .select(
          "id,owner_id,slug,published,verified,storefront_enabled,approved_profile_submission_id,logo_url,cover_image_url",
        )
        .order("slug");
      if (sellerResponse.error) throw databaseFailure("verify_sellers", sellerResponse.error);
      const sellers = sellerResponse.data;
      const expectedSlugs = UAT_MARKETPLACE_SELLERS.map((seller) => seller.slug).sort();
      if (
        sellers.length !== expectedSlugs.length ||
        JSON.stringify(sellers.map((seller) => seller.slug)) !== JSON.stringify(expectedSlugs) ||
        sellers.some(
          (seller) =>
            !seller.owner_id ||
            !seller.published ||
            !seller.verified ||
            !seller.storefront_enabled ||
            !seller.approved_profile_submission_id ||
            !seller.logo_url ||
            !seller.cover_image_url,
        )
      ) {
        throw verificationFailed();
      }

      const sellerIds = sellers.map((seller) => seller.id);
      const [
        productsResponse,
        membershipsResponse,
        imagesResponse,
        draftImagesResponse,
        runsResponse,
      ] = await Promise.all([
        this.database
          .from("products")
          .select(
            "id,seller_id,category_id,title,description,status,product_code,cover_image_id,cover_image_url,approved_moderation_submission_id",
          )
          .in("seller_id", sellerIds),
        this.database.from("product_audience_memberships").select("product_id,audience"),
        this.database
          .from("product_images")
          .select("id,product_id,url,sort_order,source_product_draft_image_id"),
        this.database
          .from("product_draft_images")
          .select(
            "id,product_draft_id,storage_bucket,destination_key,content_type,size_bytes,status,source_position",
          ),
        this.database
          .from("product_image_publication_runs")
          .select("id,moderation_submission_id,product_id,status,phase")
          .in("seller_id", sellerIds),
      ]);
      if (productsResponse.error) throw databaseFailure("verify_products", productsResponse.error);
      if (membershipsResponse.error) {
        throw databaseFailure("verify_audiences", membershipsResponse.error);
      }
      if (imagesResponse.error) throw databaseFailure("verify_images", imagesResponse.error);
      if (draftImagesResponse.error) {
        throw databaseFailure("verify_draft_images", draftImagesResponse.error);
      }
      if (runsResponse.error) throw databaseFailure("verify_activations", runsResponse.error);

      const products = productsResponse.data;
      const productIds = new Set(products.map((product) => product.id));
      const memberships = membershipsResponse.data.filter((row) => productIds.has(row.product_id));
      const images = imagesResponse.data.filter((row) => productIds.has(row.product_id));
      if (products.length !== 16 || images.length !== 20) throw verificationFailed();

      const categoryIds = await this.categoryIdsBySlug();
      const sellerBySlug = new Map(sellers.map((seller) => [seller.slug, seller]));
      for (const fixtureSeller of UAT_MARKETPLACE_SELLERS) {
        const seller = sellerBySlug.get(fixtureSeller.slug);
        if (!seller?.owner_id) throw verificationFailed();
        await this.requireQaAccountOwnership(
          fixtureSeller.email,
          seller.owner_id,
          fixtureSeller.slug,
        );
        await this.verifySellerHistory(
          seller.id,
          seller.approved_profile_submission_id!,
          requireVerificationAsset(assets, fixtureSeller.logoFile),
          requireVerificationAsset(assets, fixtureSeller.coverFile),
        );
        for (const fixtureProduct of fixtureSeller.products) {
          const matches = products.filter(
            (product) => product.seller_id === seller.id && product.title === fixtureProduct.title,
          );
          const product = matches[0];
          if (!product) throw verificationFailed();
          const productImages = images
            .filter((image) => image.product_id === product.id)
            .sort((left, right) => left.sort_order - right.sort_order);
          const runs = runsResponse.data.filter((candidate) => candidate.product_id === product.id);
          const productAudiences = memberships.filter((row) => row.product_id === product.id);
          if (
            matches.length !== 1 ||
            product.status !== "published" ||
            product.category_id !== categoryIds.get(fixtureProduct.categorySlug) ||
            product.description !== fixtureProduct.description ||
            !product.product_code ||
            !product.cover_image_id ||
            !product.cover_image_url ||
            !product.approved_moderation_submission_id ||
            productImages.length !== fixtureProduct.imageFiles.length ||
            productImages.some(
              (image, index) => image.sort_order !== index || !image.source_product_draft_image_id,
            ) ||
            productAudiences.length !== 1 ||
            productAudiences[0]!.audience !== fixtureSeller.audience ||
            runs.length !== 1 ||
            runs[0]!.status !== "completed" ||
            runs[0]!.phase !== "activation" ||
            runs[0]!.moderation_submission_id !== product.approved_moderation_submission_id
          ) {
            throw verificationFailed();
          }
          await this.verifyActivationItems(runs[0]!.id, fixtureProduct.imageFiles.length);
          await this.verifyProductHistory(product.approved_moderation_submission_id);
          for (const [index, expectedAssetFile] of fixtureProduct.imageFiles.entries()) {
            const publicImage = productImages[index];
            const draftImage = draftImagesResponse.data.find(
              (image) => image.id === publicImage?.source_product_draft_image_id,
            );
            await this.verifyProductImageContent(
              publicImage,
              draftImage,
              requireVerificationAsset(assets, expectedAssetFile),
              index,
            );
          }
        }
      }
      await this.verifyNoPendingFixtureModeration(sellerIds, [...productIds]);
      await this.verifyReadModels(sellerBySlug);
      return {
        sellerCount: sellers.length,
        sellerSlugs: sellers.map((seller) => seller.slug),
        productCount: products.length,
        publicImageCount: images.length,
        productCodes: products.map((product) => product.product_code!).sort(),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "uat_marketplace_fixture_verification_failed"
      ) {
        throw error;
      }
      throw verificationFailed();
    }
  }

  private activationBackend(): UatFixtureActivationBackend {
    return {
      readRun: (submissionId) => this.readActivationRun(submissionId),
      isRetryable: async (errorCode) => {
        const response = await this.database.rpc("product_activation_error_is_retryable", {
          p_error_code: errorCode,
        });
        if (response.error || typeof response.data !== "boolean") throw activationFailed();
        return response.data;
      },
      dispatch: async (run) => {
        await this.activationDispatcher.dispatch({
          runId: run.id,
          dispatchGeneration: run.dispatchGeneration,
        });
      },
      recover: () => this.activationDispatcher.recover(),
      retryActivation: async (run, requestId) => {
        await retryProductActivationRun({
          authorization: this.administratorAuthorization(),
          repository: this.activationRepository,
          dispatcher: this.activationDispatcher,
          runId: run.id,
          expectedDispatchGeneration: run.dispatchGeneration,
          requestId,
        });
      },
      retryDispatch: async (run, requestId) => {
        await retryProductActivationDispatch({
          authorization: this.administratorAuthorization(),
          repository: this.activationRepository,
          dispatcher: this.activationDispatcher,
          runId: run.id,
          expectedDispatchGeneration: run.dispatchGeneration,
          requestId,
        });
      },
    };
  }

  private administratorAuthorization(): PrototypeAdministratorRequestContext {
    return {
      claims: {},
      prototypeAdministrator: true,
      supabase: this.database,
      userId: this.administratorUserId,
    };
  }

  private async readActivationRun(submissionId: string): Promise<UatFixtureActivationRun | null> {
    const response = await this.database
      .from("product_image_publication_runs")
      .select("id,status,phase,dispatch_generation,dispatch_status,error_code,claim_started_at")
      .eq("moderation_submission_id", submissionId)
      .maybeSingle();
    if (response.error) throw databaseFailure("read_activation", response.error);
    if (!response.data) return null;
    const run = response.data;
    if (
      !["pending", "running", "failed", "cleanup_required", "completed", "abandoned"].includes(
        run.status,
      ) ||
      !["activation", "post_switch_cleanup"].includes(run.phase) ||
      !["pending", "dispatched", "failed"].includes(run.dispatch_status)
    ) {
      throw activationFailed();
    }
    return {
      id: run.id,
      status: run.status as UatFixtureActivationRun["status"],
      phase: run.phase as UatFixtureActivationRun["phase"],
      dispatchGeneration: run.dispatch_generation,
      dispatchStatus: run.dispatch_status as UatFixtureActivationRun["dispatchStatus"],
      errorCode: run.error_code,
      claimStartedAt: run.claim_started_at,
    };
  }

  private async ensureProfileAsset(
    sellerId: string,
    kind: "logo" | "cover",
    asset: UatMarketplaceFixtureAsset,
    sellerSlug: string,
  ): Promise<string> {
    const prepared = await this.profileMedia.prepare(sellerId, {
      kind,
      originalFilename: basename(asset.relativePath),
      contentType: asset.contentType,
      sizeBytes: asset.bytes.byteLength,
      requestId: deterministicUuid(`seller:${sellerSlug}:${kind}:prepare`),
    });
    if (prepared.asset.status === "pending") {
      if (!prepared.uploadPath || !prepared.uploadToken) {
        throw new Error("seller_profile_image_not_ready");
      }
      const uploaded = await this.database.storage
        .from(SELLER_PROFILE_IMAGE_BUCKET)
        .uploadToSignedUrl(prepared.uploadPath, prepared.uploadToken, asset.bytes, {
          contentType: asset.contentType,
        });
      if (uploaded.error) throw new Error("seller_profile_image_storage_unavailable");
    }
    const finalized = await this.profileMedia.finalize(sellerId, prepared.asset.assetId);
    if (finalized.status !== "available") throw new Error("seller_profile_image_not_ready");
    const delivered = await this.profileMedia.getPrivate(finalized.assetId, {
      sellerId,
      prototypeAdministrator: true,
    });
    if (sha256(delivered.bytes) !== sha256(asset.bytes)) throw fixtureConflict();
    return finalized.assetId;
  }

  private async ensureProductImages(
    product: ProductRow,
    input: Parameters<UatMarketplaceFixtureGateway["ensureProduct"]>[0],
  ): Promise<ProductRow> {
    const files = input.assets.map((asset, index) => ({
      asset,
      clientUploadId: deterministicUuid(
        `product:${input.sellerSlug}:${input.fixture.title}:image:${index}`,
      ),
      originalFilename: basename(asset.relativePath),
    }));
    const prepared = await this.draftImages.prepare(input.sellerId, {
      productDraftId: product.id,
      expectedModerationRevision: product.moderation_revision,
      expectedGalleryRevision: product.image_gallery_revision,
      files: files.map((file) => ({
        clientUploadId: file.clientUploadId,
        originalFilename: file.originalFilename,
        contentType: file.asset.contentType,
        sizeBytes: file.asset.bytes.byteLength,
      })),
    });
    for (const image of prepared.images) {
      if (image.durableStatus === "available") continue;
      const file = files.find((candidate) => candidate.clientUploadId === image.clientUploadId);
      if (!file || !image.uploadPath || !image.uploadToken) {
        throw new Error("product_draft_image_upload_invalid");
      }
      const uploaded = await this.database.storage
        .from(PRIVATE_IMAGE_BUCKET)
        .uploadToSignedUrl(image.uploadPath, image.uploadToken, file.asset.bytes, {
          contentType: file.asset.contentType,
        });
      if (uploaded.error && !(await this.privateObjectMatches(image.uploadPath, file.asset))) {
        throw new Error("product_draft_image_upload_unavailable");
      }
    }
    const finalized = await this.draftImages.finalize(input.sellerId, {
      productDraftId: product.id,
      expectedModerationRevision: prepared.moderationRevision,
      imageIds: prepared.images.map((image) => image.imageId),
    });
    if (finalized.images.some((image) => image.durableStatus !== "available")) {
      throw new Error("product_draft_image_upload_unavailable");
    }
    await this.draftImages.update(input.sellerId, {
      productDraftId: product.id,
      expectedModerationRevision: finalized.moderationRevision,
      expectedGalleryRevision: finalized.galleryRevision,
      orderedAvailableImageIds: prepared.images.map((image) => image.imageId),
      coverImageId: prepared.images[0]!.imageId,
    });
    return this.requireProduct(product.id, input.sellerId);
  }

  private async requireReferenceData(): Promise<void> {
    const categorySlugs = [
      "fashion",
      ...UAT_MARKETPLACE_SELLERS.flatMap((seller) =>
        seller.products.map((product) => product.categorySlug),
      ),
    ];
    const categories = await this.database
      .from("categories")
      .select("id,slug,parent_id")
      .in("slug", [...new Set(categorySlugs)]);
    if (categories.error) throw databaseFailure("preflight_categories", categories.error);
    const fashion = categories.data.find((category) => category.slug === "fashion");
    if (
      !fashion ||
      fashion.parent_id !== null ||
      categorySlugs.some(
        (slug) =>
          slug !== "fashion" &&
          !categories.data.some(
            (category) => category.slug === slug && category.parent_id === fashion.id,
          ),
      )
    ) {
      throw new Error("uat_marketplace_fixture_reference_data_invalid");
    }

    const functions = await this.sql<{ proname: string }[]>`
      SELECT DISTINCT procedure.proname
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname IN ${this.sql(REQUIRED_FUNCTIONS)}
    `;
    const names = new Set(functions.map((row) => row.proname));
    if (REQUIRED_FUNCTIONS.some((name) => !names.has(name))) {
      throw new Error("uat_marketplace_fixture_reference_data_invalid");
    }

    await this.requireNormalizedAudiences();

    const buckets = await this.sql<
      { id: string; public: boolean; file_size_limit: number; allowed_mime_types: string[] }[]
    >`
      SELECT id, public, file_size_limit::integer, allowed_mime_types
      FROM storage.buckets
      WHERE id IN ${this.sql(STORAGE_BUCKETS)}
    `;
    if (
      buckets.length !== STORAGE_BUCKETS.length ||
      buckets.some(
        (bucket) =>
          bucket.file_size_limit < 20 * 1024 * 1024 ||
          !bucket.allowed_mime_types.includes("image/jpeg") ||
          (bucket.id === PUBLIC_IMAGE_BUCKET ? !bucket.public : bucket.public),
      )
    ) {
      throw new Error("uat_marketplace_fixture_reference_data_invalid");
    }
  }

  private async requireNormalizedAudiences(): Promise<void> {
    const audiences = await this.sql<{ audiences: string[] }[]>`
      SELECT public.normalize_product_audience_set(
        ARRAY['women', 'men', 'kids']::text[]
      ) AS audiences
    `;
    if (JSON.stringify(audiences[0]?.audiences) !== JSON.stringify(["women", "men", "kids"])) {
      throw new Error("uat_marketplace_fixture_reference_data_invalid");
    }
  }

  private async countBusinessRows(preservedAdministratorUserIds: string[] = []): Promise<number> {
    let total = 0;
    for (const table of BUSINESS_TABLES) {
      const rows = await this.sql.unsafe<{ count: number }[]>(
        `SELECT count(*)::integer AS count FROM public.${table}`,
      );
      total += rows[0]?.count ?? 0;
    }
    const roles = preservedAdministratorUserIds.length
      ? await this.sql<{ count: number }[]>`
          SELECT count(*)::integer AS count
          FROM public.user_roles
          WHERE user_id NOT IN ${this.sql(preservedAdministratorUserIds)}
        `
      : await this.sql<{ count: number }[]>`
          SELECT count(*)::integer AS count FROM public.user_roles
        `;
    return total + (roles[0]?.count ?? 0);
  }

  private async truncateBusinessData(preservedAdministratorUserIds: string[]): Promise<number> {
    const before = await this.countBusinessRows(preservedAdministratorUserIds);
    await this.sql.begin(async (transaction) => {
      await transaction`SET LOCAL ROLE postgres`;
      await transaction.unsafe(
        `TRUNCATE TABLE ${BUSINESS_TABLES.map((table) => `public.${table}`).join(", ")} RESTART IDENTITY CASCADE`,
      );
      if (preservedAdministratorUserIds.length > 0) {
        await transaction`
          DELETE FROM public.user_roles
          WHERE user_id NOT IN ${transaction(preservedAdministratorUserIds)}
        `;
      } else {
        await transaction`DELETE FROM public.user_roles`;
      }
    });
    return before;
  }

  private async verifyReset(preservedAdministratorUserIds: string[]): Promise<void> {
    if ((await this.countBusinessRows(preservedAdministratorUserIds)) !== 0) {
      throw new Error("uat_marketplace_fixture_reset_failed");
    }
    for (const bucket of STORAGE_BUCKETS) {
      if ((await this.listStorageObjectKeys(bucket)).length > 0) {
        throw new Error("uat_marketplace_fixture_reset_failed");
      }
    }
    const users = await this.listAuthUsers();
    if (users.some((user) => !preservedAdministratorUserIds.includes(user.id))) {
      throw new Error("uat_marketplace_fixture_reset_failed");
    }
    const adminRoles = await this.database.from("user_roles").select("user_id").eq("role", "admin");
    if (
      adminRoles.error ||
      adminRoles.data.length !== preservedAdministratorUserIds.length ||
      preservedAdministratorUserIds.some(
        (userId) => !adminRoles.data.some((role) => role.user_id === userId),
      )
    ) {
      throw new Error("uat_marketplace_fixture_reset_failed");
    }
  }

  private async linkedStorageObjectKeys(): Promise<
    Record<(typeof STORAGE_BUCKETS)[number], Set<string>>
  > {
    const [drafts, publicImages, publicationItems, profileAssets] = await Promise.all([
      this.database.from("product_draft_images").select("storage_bucket,destination_key"),
      this.database.from("product_images").select("url"),
      this.database.from("product_image_publication_items").select("destination_key"),
      this.database.from("seller_profile_assets").select("object_key"),
    ]);
    if (drafts.error || publicImages.error || publicationItems.error || profileAssets.error) {
      throw new Error("uat_marketplace_fixture_reference_data_invalid");
    }
    const result = {
      [PRIVATE_IMAGE_BUCKET]: new Set<string>(),
      [PUBLIC_IMAGE_BUCKET]: new Set<string>(),
      [SELLER_PROFILE_IMAGE_BUCKET]: new Set<string>(),
    };
    drafts.data.forEach((row) => {
      if (row.storage_bucket === PRIVATE_IMAGE_BUCKET) {
        result[PRIVATE_IMAGE_BUCKET].add(row.destination_key);
      }
    });
    publicationItems.data.forEach((row) => result[PUBLIC_IMAGE_BUCKET].add(row.destination_key));
    publicImages.data.forEach((row) => {
      const key = publicObjectKey(row.url, this.supabaseUrl);
      if (key) result[PUBLIC_IMAGE_BUCKET].add(key);
    });
    profileAssets.data.forEach((row) => result[SELLER_PROFILE_IMAGE_BUCKET].add(row.object_key));
    return result;
  }

  private async listAllSellers(): Promise<SellerRow[]> {
    const response = await this.database.from("sellers").select("*").order("id");
    if (response.error) throw databaseFailure("list_sellers", response.error);
    return response.data;
  }

  private async ensureQaUser(email: string, password: string, sellerSlug: string): Promise<User> {
    const matching = (await this.listAuthUsers()).filter(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (matching.length > 1) throw fixtureConflict();
    if (matching[0] && fixtureUserSlug(matching[0]) !== sellerSlug) throw fixtureConflict();
    const attributes = {
      email,
      password,
      email_confirm: true,
      app_metadata: {
        uat_marketplace_fixture: true,
        fixture_bundle_version: UAT_MARKETPLACE_FIXTURE_BUNDLE_VERSION,
        fixture_seller_slug: sellerSlug,
      },
      user_metadata: { display_name: sellerSlug, uat_marketplace_fixture: true },
    };
    const response = matching[0]
      ? await this.database.auth.admin.updateUserById(matching[0].id, attributes)
      : await this.database.auth.admin.createUser(attributes);
    if (response.error || !response.data.user) {
      throw new Error("uat_marketplace_fixture_seed_failed");
    }
    return response.data.user;
  }

  private async listAuthUsers(): Promise<User[]> {
    const users: User[] = [];
    for (let page = 1; ; page += 1) {
      const response = await this.database.auth.admin.listUsers({ page, perPage: 100 });
      if (response.error) throw new Error("uat_marketplace_fixture_reference_data_invalid");
      users.push(...response.data.users);
      if (response.data.users.length < 100) return users;
    }
  }

  private async ensureSellerRecord(
    ownerId: string,
    fashionCategoryId: string,
    fixture: (typeof UAT_MARKETPLACE_SELLERS)[number],
  ): Promise<SellerRow> {
    const existing = await this.database
      .from("sellers")
      .select("*")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (existing.error) throw databaseFailure("find_seller", existing.error);
    let seller = existing.data;
    if (!seller) {
      const created = await this.database.rpc("create_seller_with_company_code", {
        p_owner_id: ownerId,
        p_name: fixture.name,
        p_slug_base: fixture.slug,
        p_city: fixture.city,
        p_country: fixture.country,
        p_primary_category_id: fashionCategoryId,
        p_whatsapp: null as never,
        p_submitted_company_code: fixture.companyCode,
      });
      if (created.error || !created.data?.[0]) {
        throw databaseFailure("create_seller", created.error ?? { message: "missing seller" });
      }
      seller = created.data[0];
    }
    if (seller.slug !== fixture.slug || seller.company_code !== fixture.companyCode) {
      throw fixtureConflict();
    }
    const roles = await this.database.from("user_roles").select("role").eq("user_id", ownerId);
    if (roles.error || roles.data.length !== 1 || roles.data[0]?.role !== "seller") {
      throw fixtureConflict();
    }
    return seller;
  }

  private async findSellerSubmission(sellerId: string, requestId: string) {
    const response = await this.database
      .from("seller_profile_submissions")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("seller_request_id", requestId)
      .maybeSingle();
    if (response.error) throw databaseFailure("find_seller_submission", response.error);
    if (!response.data) return null;
    return {
      ...response.data,
      status: response.data.status as
        "pending" | "changes_requested" | "approved" | "rejected" | "withdrawn",
      submission_kind: response.data.submission_kind as "initial" | "update",
    };
  }

  private async findProductSubmission(productId: string, requestId: string) {
    const response = await this.database
      .from("product_moderation_submissions")
      .select("id,revision,review_status,snapshot_json")
      .eq("product_id", productId)
      .eq("seller_request_id", requestId)
      .maybeSingle();
    if (response.error) throw databaseFailure("find_product_submission", response.error);
    if (!response.data) return null;
    return {
      id: response.data.id,
      revision: response.data.revision,
      snapshot: response.data.snapshot_json,
      reviewStatus: response.data.review_status as
        "pending" | "changes_requested" | "approved" | "rejected" | "withdrawn",
    };
  }

  private async productFieldsMatch(
    product: ProductRow,
    input: Parameters<UatMarketplaceFixtureGateway["ensureProduct"]>[0],
    categoryId: string,
  ): Promise<boolean> {
    const audiences = await this.database
      .from("product_audience_memberships")
      .select("audience")
      .eq("product_id", product.id);
    if (audiences.error) throw databaseFailure("read_product_audiences", audiences.error);
    return (
      product.title === input.fixture.title &&
      product.description === input.fixture.description &&
      product.category_id === categoryId &&
      product.moq === input.fixture.minimumOrderQuantity &&
      product.pack_size === input.fixture.packSize &&
      product.price === input.fixture.price &&
      product.currency === input.fixture.currency &&
      product.stock === input.fixture.stock &&
      product.trending === input.fixture.trending &&
      audiences.data.length === 1 &&
      audiences.data[0]?.audience === input.audience
    );
  }

  private async findFixtureProduct(sellerId: string, title: string): Promise<ProductRow | null> {
    const response = await this.database
      .from("products")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("title", title);
    if (response.error) throw databaseFailure("find_product", response.error);
    if (response.data.length > 1) throw fixtureConflict();
    return response.data[0] ?? null;
  }

  private async requireProduct(productId: string, sellerId: string): Promise<ProductRow> {
    const response = await this.database
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("seller_id", sellerId)
      .single();
    if (response.error) throw databaseFailure("require_product", response.error);
    return response.data;
  }

  private async requireCategoryId(slug: string, leaf: boolean): Promise<string> {
    const response = await this.database
      .from("categories")
      .select("id,parent_id")
      .eq("slug", slug)
      .single();
    if (response.error || (leaf ? !response.data.parent_id : response.data.parent_id !== null)) {
      throw new Error("uat_marketplace_fixture_reference_data_invalid");
    }
    return response.data.id;
  }

  private async categoryIdsBySlug(): Promise<Map<string, string>> {
    const slugs = UAT_MARKETPLACE_SELLERS.flatMap((seller) =>
      seller.products.map((product) => product.categorySlug),
    );
    const response = await this.database.from("categories").select("id,slug").in("slug", slugs);
    if (response.error) throw databaseFailure("list_categories", response.error);
    return new Map(response.data.map((category) => [category.slug, category.id]));
  }

  private async requireQaAccountOwnership(
    email: string,
    ownerId: string,
    sellerSlug: string,
  ): Promise<void> {
    const users = await this.listAuthUsers();
    const user = users.find((candidate) => candidate.id === ownerId);
    if (
      user?.email?.toLowerCase() !== email.toLowerCase() ||
      fixtureUserSlug(user) !== sellerSlug
    ) {
      throw verificationFailed();
    }
  }

  private async verifySellerHistory(
    sellerId: string,
    submissionId: string,
    logo: UatMarketplaceFixtureAsset,
    cover: UatMarketplaceFixtureAsset,
  ): Promise<void> {
    const [submission, assets, events] = await Promise.all([
      this.database
        .from("seller_profile_submissions")
        .select("status,administrator_user_id,logo_asset_id,cover_asset_id")
        .eq("id", submissionId)
        .single(),
      this.database
        .from("seller_profile_assets")
        .select("id,status,kind,mime_type,size_bytes,object_key")
        .eq("seller_id", sellerId),
      this.database
        .from("seller_profile_events")
        .select("event_type,actor_user_id")
        .eq("seller_id", sellerId),
    ]);
    if (
      submission.error ||
      assets.error ||
      events.error ||
      submission.data.status !== "approved" ||
      submission.data.administrator_user_id !== this.administratorUserId ||
      !submission.data.logo_asset_id ||
      !submission.data.cover_asset_id ||
      assets.data.length !== 2 ||
      assets.data.some((asset) => asset.status !== "available") ||
      !assets.data.some((asset) => asset.id === submission.data.logo_asset_id) ||
      !assets.data.some((asset) => asset.id === submission.data.cover_asset_id) ||
      !events.data.some((event) => event.event_type === "approved") ||
      !events.data.some(
        (event) =>
          event.event_type === "approved" && event.actor_user_id === this.administratorUserId,
      ) ||
      !events.data.some((event) => event.event_type === "storefront_enabled")
    ) {
      throw verificationFailed();
    }
    for (const [kind, expected] of [
      ["logo", logo],
      ["cover", cover],
    ] as const) {
      const asset = assets.data.find((candidate) => candidate.kind === kind);
      if (
        !asset ||
        asset.mime_type !== expected.contentType ||
        asset.size_bytes !== expected.bytes.byteLength
      ) {
        throw verificationFailed();
      }
      const stored = await this.profileMedia.getPrivate(asset.id, {
        sellerId,
        prototypeAdministrator: true,
      });
      if (
        stored.contentType !== expected.contentType ||
        sha256(stored.bytes) !== sha256(expected.bytes)
      ) {
        throw verificationFailed();
      }
    }
  }

  private async verifyProductImageContent(
    publicImage:
      | {
          id: string;
          product_id: string;
          sort_order: number;
          source_product_draft_image_id: string | null;
          url: string;
        }
      | undefined,
    draftImage:
      | {
          content_type: string | null;
          destination_key: string;
          id: string;
          product_draft_id: string;
          size_bytes: number | null;
          source_position: number;
          status: Database["public"]["Enums"]["product_draft_image_status"];
          storage_bucket: string;
        }
      | undefined,
    expected: UatMarketplaceFixtureAsset,
    expectedPosition: number,
  ): Promise<void> {
    if (
      !publicImage ||
      !draftImage ||
      draftImage.storage_bucket !== PRIVATE_IMAGE_BUCKET ||
      draftImage.status !== "available" ||
      draftImage.source_position !== expectedPosition ||
      draftImage.content_type !== expected.contentType ||
      draftImage.size_bytes !== expected.bytes.byteLength
    ) {
      throw verificationFailed();
    }
    const publicObjectKeyValue = publicObjectKey(publicImage.url, this.supabaseUrl);
    if (!publicObjectKeyValue) throw verificationFailed();
    const [privateObject, publicObject] = await Promise.all([
      this.readStoredObject(PRIVATE_IMAGE_BUCKET, draftImage.destination_key),
      this.readStoredObject(PUBLIC_IMAGE_BUCKET, publicObjectKeyValue),
    ]);
    const expectedSha256 = sha256(expected.bytes);
    if (
      !privateObject ||
      !publicObject ||
      privateObject.contentType !== expected.contentType ||
      publicObject.contentType !== expected.contentType ||
      sha256(privateObject.bytes) !== expectedSha256 ||
      sha256(publicObject.bytes) !== expectedSha256
    ) {
      throw verificationFailed();
    }
  }

  private async verifyActivationItems(runId: string, expectedCount: number): Promise<void> {
    const items = await this.database
      .from("product_image_publication_items")
      .select(
        "status,publication_order,is_cover,source_sha256,public_sha256,public_size_bytes,public_url",
      )
      .eq("run_id", runId)
      .order("publication_order");
    if (
      items.error ||
      items.data.length !== expectedCount ||
      items.data.some(
        (item, index) =>
          item.status !== "completed" ||
          item.publication_order !== index ||
          item.is_cover !== (index === 0) ||
          !item.source_sha256 ||
          !item.public_sha256 ||
          item.source_sha256 !== item.public_sha256 ||
          !item.public_size_bytes ||
          !item.public_url,
      )
    ) {
      throw verificationFailed();
    }
  }

  private async verifyNoPendingFixtureModeration(
    sellerIds: string[],
    productIds: string[],
  ): Promise<void> {
    const [sellerQueue, productQueue] = await Promise.all([
      this.database
        .from("seller_profile_submissions")
        .select("id")
        .in("seller_id", sellerIds)
        .eq("status", "pending"),
      this.database
        .from("product_moderation_submissions")
        .select("id")
        .in("product_id", productIds)
        .eq("review_status", "pending"),
    ]);
    if (
      sellerQueue.error ||
      productQueue.error ||
      sellerQueue.data.length ||
      productQueue.data.length
    ) {
      throw verificationFailed();
    }
  }

  private async verifyProductHistory(submissionId: string): Promise<void> {
    const submission = await this.database
      .from("product_moderation_submissions")
      .select("review_status,administrator_user_id,decision_request_id")
      .eq("id", submissionId)
      .single();
    const detail = await this.database.rpc("read_administrator_product_moderation_request", {
      p_submission_id: submissionId,
    });
    if (
      submission.error ||
      detail.error ||
      detail.data === null ||
      submission.data.review_status !== "approved" ||
      submission.data.administrator_user_id !== this.administratorUserId ||
      !submission.data.decision_request_id
    ) {
      throw verificationFailed();
    }
  }

  private async verifyReadModels(
    sellerBySlug: Map<
      string,
      {
        id: string;
        approved_profile_submission_id: string | null;
      }
    >,
  ): Promise<void> {
    for (const fixtureSeller of UAT_MARKETPLACE_SELLERS) {
      const seller = sellerBySlug.get(fixtureSeller.slug);
      if (!seller?.approved_profile_submission_id) throw verificationFailed();
      const [dashboard, publicProducts, sellerDetail] = await Promise.all([
        this.database.rpc("list_seller_products_for_moderation", {
          p_seller_id: seller.id,
          p_status: "active",
          p_limit: 100,
        }),
        this.database.rpc("list_public_seller_products", {
          p_seller_slug: fixtureSeller.slug,
          p_audience: fixtureSeller.audience,
          p_limit: 100,
        }),
        this.database.rpc("read_administrator_seller_moderation_request", {
          p_submission_id: seller.approved_profile_submission_id,
        }),
      ]);
      if (
        dashboard.error ||
        publicProducts.error ||
        sellerDetail.error ||
        sellerDetail.data === null ||
        dashboard.data.length !== fixtureSeller.products.length ||
        dashboard.data.some(
          (product) =>
            product.status !== "published" || product.marketplace_visibility !== "visible",
        ) ||
        publicProducts.data.length !== fixtureSeller.products.length
      ) {
        throw verificationFailed();
      }
    }

    for (const audience of ["women", "men", "kids"] as const) {
      const expected = UAT_MARKETPLACE_SELLERS.filter((seller) => seller.audience === audience).map(
        (seller) => seller.slug,
      );
      const response = await this.database.rpc("list_public_audience_sellers", {
        p_audience: audience,
        p_limit: 100,
      });
      if (
        response.error ||
        response.data.length !== expected.length ||
        expected.some((slug) => !response.data.some((seller) => seller.slug === slug))
      ) {
        throw verificationFailed();
      }
    }
  }

  private async privateObjectMatches(
    objectKey: string,
    asset: UatMarketplaceFixtureAsset,
  ): Promise<boolean> {
    const existing = await this.readStoredObject(PRIVATE_IMAGE_BUCKET, objectKey);
    return Boolean(
      existing &&
      existing.contentType === asset.contentType &&
      sha256(existing.bytes) === sha256(asset.bytes),
    );
  }

  private readStoredObject(
    bucket: typeof PRIVATE_IMAGE_BUCKET | typeof PUBLIC_IMAGE_BUCKET,
    objectKey: string,
  ) {
    return this.publicationStorage.read(bucket, objectKey, new AbortController().signal);
  }

  private async removeAndVerifyStorageObjects(bucket: string, keys: string[]): Promise<number> {
    const unique = [...new Set(keys)].sort();
    for (let index = 0; index < unique.length; index += STORAGE_PAGE_SIZE) {
      const response = await this.database.storage
        .from(bucket)
        .remove(unique.slice(index, index + STORAGE_PAGE_SIZE));
      if (response.error) throw new Error("uat_marketplace_fixture_reset_failed");
    }
    if ((await this.listStorageObjectKeys(bucket)).some((key) => unique.includes(key))) {
      throw new Error("uat_marketplace_fixture_reset_failed");
    }
    return unique.length;
  }

  private async listStorageObjectKeys(bucket: string): Promise<string[]> {
    const objects: string[] = [];
    const prefixes = [""];
    while (prefixes.length > 0) {
      const prefix = prefixes.shift()!;
      for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
        const response = await this.database.storage.from(bucket).list(prefix, {
          limit: STORAGE_PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (response.error) {
          throw new Error("uat_marketplace_fixture_reference_data_invalid");
        }
        for (const entry of response.data) {
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.id) objects.push(path);
          else prefixes.push(path);
        }
        if (response.data.length < STORAGE_PAGE_SIZE) break;
      }
    }
    return objects.sort();
  }
}

function productFields(
  input: Parameters<UatMarketplaceFixtureGateway["ensureProduct"]>[0],
  categoryId: string,
) {
  return {
    audiences: [input.audience],
    category_id: categoryId,
    description: input.fixture.description,
    moq: input.fixture.minimumOrderQuantity,
    pack_size: input.fixture.packSize,
    price: input.fixture.price,
    currency: input.fixture.currency,
    stock: input.fixture.stock,
    trending: input.fixture.trending,
    status: "draft" as const,
  };
}

function profileMatches(
  current: {
    name: string;
    slug: string;
    city: string | null;
    country: string | null;
    whatsapp: string | null;
    email: string | null;
    about: string | null;
    established_year: number | null;
    logo_asset_id: string | null;
    cover_asset_id: string | null;
  },
  expected: {
    name: string;
    slug: string;
    city: string | null;
    country: string | null;
    whatsapp: string | null;
    email: string | null;
    about: string | null;
    establishedYear: number | null;
    logoAssetId: string | null;
    coverAssetId: string | null;
  },
): boolean {
  return (
    current.name === expected.name &&
    current.slug === expected.slug &&
    current.city === expected.city &&
    current.country === expected.country &&
    current.whatsapp === expected.whatsapp &&
    current.email === expected.email &&
    current.about === expected.about &&
    current.established_year === expected.establishedYear &&
    current.logo_asset_id === expected.logoAssetId &&
    current.cover_asset_id === expected.coverAssetId
  );
}

function sellerSubmissionMatches(
  submission: {
    about: string | null;
    city: string | null;
    country: string | null;
    cover_asset_id: string | null;
    email: string | null;
    established_year: number | null;
    logo_asset_id: string | null;
    name: string;
    slug: string;
    whatsapp: string | null;
  },
  expected: {
    about: string | null;
    city: string | null;
    country: string | null;
    coverAssetId: string | null;
    email: string | null;
    establishedYear: number | null;
    logoAssetId: string | null;
    name: string;
    slug: string;
    whatsapp: string | null;
  },
): boolean {
  return (
    submission.name === expected.name &&
    submission.slug === expected.slug &&
    submission.city === expected.city &&
    submission.country === expected.country &&
    submission.whatsapp === expected.whatsapp &&
    submission.email === expected.email &&
    submission.about === expected.about &&
    submission.established_year === expected.establishedYear &&
    submission.logo_asset_id === expected.logoAssetId &&
    submission.cover_asset_id === expected.coverAssetId
  );
}

function productSubmissionMatches(
  value: unknown,
  input: Parameters<UatMarketplaceFixtureGateway["ensureProduct"]>[0],
  categoryId: string,
): boolean {
  const parsed = productModerationSnapshotSchema.safeParse(value);
  if (!parsed.success) return false;
  const snapshot = parsed.data;
  const englishDescription = snapshot.descriptions.find(
    (description) => description.language === "en",
  );
  return (
    snapshot.sellerId === input.sellerId &&
    snapshot.title === input.fixture.title &&
    snapshot.categoryId === categoryId &&
    snapshot.audiences.length === 1 &&
    snapshot.audiences[0] === input.audience &&
    englishDescription?.descriptionText === input.fixture.description &&
    snapshot.minimumOrder === input.fixture.minimumOrderQuantity &&
    snapshot.packSize === input.fixture.packSize &&
    snapshot.price === input.fixture.price &&
    snapshot.currency === input.fixture.currency &&
    snapshot.stock === input.fixture.stock &&
    snapshot.imageIds.length === input.assets.length &&
    snapshot.coverImageId === snapshot.imageIds[0]
  );
}

function fixtureUserSlug(user: User | undefined): string | null {
  return user?.app_metadata?.uat_marketplace_fixture === true &&
    user.app_metadata?.fixture_bundle_version === UAT_MARKETPLACE_FIXTURE_BUNDLE_VERSION &&
    typeof user.app_metadata?.fixture_seller_slug === "string"
    ? user.app_metadata.fixture_seller_slug
    : null;
}

function deterministicUuid(value: string): string {
  const bytes = createHash("sha256")
    .update(`bazoria-uat-marketplace:${UAT_MARKETPLACE_FIXTURE_BUNDLE_VERSION}:${value}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function publicObjectKey(url: string, supabaseUrl: string): string | null {
  const prefix = `${supabaseUrl}/storage/v1/object/public/${PUBLIC_IMAGE_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  try {
    return url
      .slice(prefix.length)
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
}

function expectedAssetCount(): number {
  return UAT_MARKETPLACE_SELLERS.reduce(
    (total, seller) =>
      total +
      2 +
      seller.products.reduce((images, product) => images + product.imageFiles.length, 0),
    0,
  );
}

function requireVerificationAsset(
  assets: Map<string, UatMarketplaceFixtureAsset>,
  relativePath: string,
): UatMarketplaceFixtureAsset {
  const asset = assets.get(relativePath);
  if (!asset) throw verificationFailed();
  return asset;
}

function mapFixturePhaseError(
  phase: "seller" | "product",
  identifier: string,
  error: unknown,
): Error {
  const stableErrorCodes = new Set([
    "uat_marketplace_fixture_reference_data_invalid",
    "uat_marketplace_fixture_conflict",
    "uat_marketplace_fixture_seed_failed",
    "uat_marketplace_fixture_moderation_failed",
    "uat_marketplace_fixture_activation_failed",
  ]);
  console.error("[UAT marketplace fixtures] Lifecycle operation failed.", {
    phase,
    identifier,
    exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    errorCode: error instanceof Error ? error.message : "uat_marketplace_fixture_seed_failed",
  });
  if (error instanceof Error && stableErrorCodes.has(error.message)) return error;
  return new Error("uat_marketplace_fixture_seed_failed");
}

function databaseFailure(operation: string, error: { message: string }): Error {
  console.error("[UAT marketplace fixtures] Database operation failed.", {
    operation,
    message: error.message,
  });
  return new Error(`uat_marketplace_fixture_database_failed:${operation}`);
}

function fixtureConflict(): Error {
  return new Error("uat_marketplace_fixture_conflict");
}

function moderationFailed(): Error {
  return new Error("uat_marketplace_fixture_moderation_failed");
}

function activationFailed(): Error {
  return new Error("uat_marketplace_fixture_activation_failed");
}

function verificationFailed(): Error {
  return new Error("uat_marketplace_fixture_verification_failed");
}

function isAuthUserMissing(message: string): boolean {
  return message.toLowerCase().includes("not found");
}
