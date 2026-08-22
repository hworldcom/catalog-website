import { createHash } from "node:crypto";
import { basename } from "node:path";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Sql } from "postgres";

import { ProductDraftTitleService } from "@/features/product-draft-title/product-draft-title.service";
import { SupabaseProductDraftTitleRepository } from "@/features/product-draft-title/server/supabase-product-draft-title.repository";
import { ProductDraftImageLifecycleService } from "@/features/seller/server/product-draft-image-lifecycle.service";
import { SupabaseProductDraftImageLifecycleStorage } from "@/features/seller/server/product-draft-image-lifecycle.storage";
import { SupabaseProductDraftImageLifecycleRepository } from "@/features/seller/server/supabase-product-draft-image-lifecycle.repository";
import { SupabaseProductPublicationRepository } from "@/features/seller/server/supabase-product-publication.repository";
import { SupabaseProductPublicationStorage } from "@/features/seller/server/product-publication.storage";
import { ProductPublicationWorker } from "@/features/seller/server/product-publication.worker";
import type { Database } from "@/lib/supabase/types";

import { UAT_MARKETPLACE_FIXTURE_PREFIX } from "./uat-marketplace-fixtures.manifest";
import type {
  UatMarketplaceFixtureAsset,
  UatMarketplaceFixtureGateway,
  UatMarketplaceFixtureResetSummary,
  UatMarketplaceFixtureVerification,
} from "./uat-marketplace-fixtures.service";
import { UAT_MARKETPLACE_SELLERS } from "./uat-marketplace-fixtures.manifest";

type AdminClient = SupabaseClient<Database>;
type SellerRow = Database["public"]["Tables"]["sellers"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];

const PRIVATE_IMAGE_BUCKET = "product-draft-images";
const PUBLIC_IMAGE_BUCKET = "product-images";
const STORAGE_PAGE_SIZE = 100;

export class SupabaseUatMarketplaceFixtureGateway implements UatMarketplaceFixtureGateway {
  private readonly draftTitles: ProductDraftTitleService;
  private readonly draftImages: ProductDraftImageLifecycleService;
  private readonly publicationRepository: SupabaseProductPublicationRepository;
  private readonly publicationStorage: SupabaseProductPublicationStorage;
  private readonly publicationWorker: ProductPublicationWorker;

  constructor(
    private readonly database: AdminClient,
    private readonly sql: Sql,
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
  ) {
    this.draftTitles = new ProductDraftTitleService(
      new SupabaseProductDraftTitleRepository(database),
    );
    this.draftImages = new ProductDraftImageLifecycleService(
      new SupabaseProductDraftImageLifecycleRepository(database),
      new SupabaseProductDraftImageLifecycleStorage({
        database,
        supabaseUrl,
        serviceRoleKey,
      }),
    );
    this.publicationRepository = new SupabaseProductPublicationRepository(database);
    this.publicationStorage = new SupabaseProductPublicationStorage({
      supabaseUrl,
      serviceRoleKey,
    });
    this.publicationWorker = new ProductPublicationWorker(
      this.publicationRepository,
      this.publicationStorage,
      {
        deploymentEnvironment: "local",
        dispatchMode: "local",
        maximumImageCount: 20,
        itemConcurrency: 3,
        itemTimeoutMs: 30_000,
        workerDeadlineMs: 240_000,
        claimTimeoutSeconds: 360,
        supabaseUrl,
        serviceRoleKey,
      },
    );
  }

  async listSellerSlugs(): Promise<string[]> {
    const response = await this.database.from("sellers").select("slug").order("slug");
    if (response.error) throw databaseFailure("list_sellers", response.error);
    return response.data.map((seller) => seller.slug);
  }

  async reset(preservedAdministratorUserIds: string[]): Promise<UatMarketplaceFixtureResetSummary> {
    const sellers = await this.listAllSellers();
    if (sellers.length === 0) {
      return {
        deletedAuthUsers: 0,
        deletedDatabaseSellers: 0,
        deletedPrivateObjects: 0,
        deletedPublicObjects: 0,
      };
    }

    const sellerIds = sellers.map((seller) => seller.id);
    const ownerIds = sellers.flatMap((seller) => (seller.owner_id ? [seller.owner_id] : []));
    const administratorIds = new Set([
      ...preservedAdministratorUserIds,
      ...(await this.listDatabaseAdministratorUserIds()),
    ]);
    const storage = await this.captureStorageObjects(sellers, sellerIds);

    const deletedPrivateObjects = await this.removeAndVerifyStorageObjects(
      PRIVATE_IMAGE_BUCKET,
      storage.privateObjectKeys,
    );
    const deletedPublicObjects = await this.removeAndVerifyStorageObjects(
      PUBLIC_IMAGE_BUCKET,
      storage.publicObjectKeys,
    );
    const deletedDatabaseSellers = await this.deleteSellerData(sellerIds, ownerIds);

    let deletedAuthUsers = 0;
    for (const ownerId of [...new Set(ownerIds)].sort()) {
      if (administratorIds.has(ownerId)) continue;
      const response = await this.database.auth.admin.deleteUser(ownerId);
      if (response.error && !isAuthUserMissing(response.error.message)) {
        throw new Error(`uat_marketplace_fixture_auth_delete_failed:${ownerId}`);
      }
      if (!response.error) deletedAuthUsers += 1;
    }

    return {
      deletedAuthUsers,
      deletedDatabaseSellers,
      deletedPrivateObjects,
      deletedPublicObjects,
    };
  }

  async ensureSeller(
    input: Parameters<UatMarketplaceFixtureGateway["ensureSeller"]>[0],
  ): Promise<{ sellerId: string }> {
    const user = await this.ensureQaUser(input.fixture.email, input.password, input.fixture.slug);
    const fashionCategoryId = await this.requireCategoryId("fashion", false);
    const seller = await this.ensureSellerRecord(user.id, fashionCategoryId, input.fixture);

    const logoUrl = await this.ensurePublicObject(
      `${UAT_MARKETPLACE_FIXTURE_PREFIX}/sellers/${input.fixture.slug}/logo.jpg`,
      input.logo,
    );
    const coverUrl = await this.ensurePublicObject(
      `${UAT_MARKETPLACE_FIXTURE_PREFIX}/sellers/${input.fixture.slug}/storefront-cover.jpg`,
      input.cover,
    );

    const updated = await this.database
      .from("sellers")
      .update({
        about: input.fixture.about,
        city: input.fixture.city,
        country: input.fixture.country,
        cover_image_url: coverUrl,
        email: input.fixture.email,
        established_year: input.fixture.establishedYear,
        logo_url: logoUrl,
        name: input.fixture.name,
        primary_category_id: fashionCategoryId,
        published: true,
        verified: true,
      })
      .eq("id", seller.id)
      .select("id")
      .single();
    if (updated.error) throw databaseFailure("update_seller", updated.error);
    return { sellerId: updated.data.id };
  }

  async ensureProduct(
    input: Parameters<UatMarketplaceFixtureGateway["ensureProduct"]>[0],
  ): Promise<void> {
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

    if (product.status === "archived") {
      throw new Error(`uat_marketplace_fixture_product_archived:${product.id}`);
    }
    if (product.category_id !== categoryId) {
      throw new Error(`uat_marketplace_fixture_product_conflict:${product.id}`);
    }
    if (product.status === "published") return;

    await this.draftTitles.saveSellerProduct({
      productDraftId: product.id,
      expectedModerationRevision: product.moderation_revision,
      sellerId: input.sellerId,
      title: input.fixture.title,
      productFields: productFields(input, categoryId),
    });
    product = await this.requireProduct(product.id, input.sellerId);

    const files = input.assets.map((asset, index) => ({
      asset,
      clientUploadId: deterministicUuid(
        `${input.sellerSlug}:${input.fixture.categorySlug}:${index}`,
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
        throw new Error(`uat_marketplace_fixture_private_upload_invalid:${image.imageId}`);
      }
      const uploaded = await this.database.storage
        .from(PRIVATE_IMAGE_BUCKET)
        .uploadToSignedUrl(image.uploadPath, image.uploadToken, file.asset.bytes, {
          contentType: file.asset.contentType,
        });
      if (uploaded.error && !(await this.privateObjectMatches(image.uploadPath, file.asset))) {
        throw new Error(`uat_marketplace_fixture_private_upload_failed:${image.imageId}`);
      }
    }

    const finalized = await this.draftImages.finalize(input.sellerId, {
      productDraftId: product.id,
      expectedModerationRevision: prepared.moderationRevision,
      imageIds: prepared.images.map((image) => image.imageId),
    });
    if (finalized.images.some((image) => image.durableStatus !== "available")) {
      throw new Error(`uat_marketplace_fixture_private_image_invalid:${product.id}`);
    }
    await this.draftImages.update(input.sellerId, {
      productDraftId: product.id,
      expectedModerationRevision: finalized.moderationRevision,
      expectedGalleryRevision: finalized.galleryRevision,
      orderedAvailableImageIds: prepared.images.map((image) => image.imageId),
      coverImageId: prepared.images[0]!.imageId,
    });

    const authorization = await this.publicationRepository.authorize({
      productDraftId: product.id,
      sellerId: input.sellerId,
      audiences: [input.audience],
      titlePatchPresent: true,
      title: input.fixture.title,
      descriptionPatchPresent: true,
      description: input.fixture.description,
      categoryId,
      moq: input.fixture.minimumOrderQuantity,
      packSize: input.fixture.packSize,
      price: input.fixture.price,
      currency: input.fixture.currency,
      stock: input.fixture.stock,
      coverImageUrlPatchPresent: false,
      coverImageUrl: null,
      trending: input.fixture.trending,
      delegatedAction: null,
    });
    if (authorization.result !== "pending" && authorization.result !== "in_progress") {
      throw new Error(
        `uat_marketplace_fixture_publication_not_authorized:${product.id}:${authorization.result}`,
      );
    }
    const publication = await this.publicationWorker.run(product.id);
    if (publication.status !== "completed" && publication.status !== "already_terminal") {
      throw new Error(
        `uat_marketplace_fixture_publication_failed:${product.id}:${publication.status}`,
      );
    }
    const published = await this.requireProduct(product.id, input.sellerId);
    if (published.status !== "published" || !published.cover_image_url || !published.product_code) {
      throw new Error(`uat_marketplace_fixture_publication_incomplete:${product.id}`);
    }
  }

  async verify(): Promise<UatMarketplaceFixtureVerification> {
    const sellerResponse = await this.database
      .from("sellers")
      .select("id,owner_id,slug,published,cover_image_url,logo_url")
      .order("slug");
    if (sellerResponse.error) throw databaseFailure("verify_sellers", sellerResponse.error);
    const sellers = sellerResponse.data;
    const expectedSlugs = UAT_MARKETPLACE_SELLERS.map((seller) => seller.slug).sort();
    if (
      sellers.length !== expectedSlugs.length ||
      JSON.stringify(sellers.map((seller) => seller.slug)) !== JSON.stringify(expectedSlugs) ||
      sellers.some(
        (seller) =>
          !seller.owner_id || !seller.published || !seller.cover_image_url || !seller.logo_url,
      )
    ) {
      throw new Error("uat_marketplace_fixture_seller_verification_failed");
    }

    const sellerIds = sellers.map((seller) => seller.id);
    const [productsResponse, membershipsResponse, imagesResponse, runsResponse] = await Promise.all(
      [
        this.database
          .from("products")
          .select("id,seller_id,category_id,title,description,status,product_code,cover_image_url")
          .in("seller_id", sellerIds),
        this.database.from("product_audience_memberships").select("product_id,audience"),
        this.database.from("product_images").select("product_id,url,sort_order"),
        this.database
          .from("product_image_publication_runs")
          .select("product_draft_id,status")
          .in("seller_id", sellerIds),
      ],
    );
    if (productsResponse.error) throw databaseFailure("verify_products", productsResponse.error);
    if (membershipsResponse.error) {
      throw databaseFailure("verify_audiences", membershipsResponse.error);
    }
    if (imagesResponse.error) throw databaseFailure("verify_images", imagesResponse.error);
    if (runsResponse.error) throw databaseFailure("verify_publications", runsResponse.error);

    const products = productsResponse.data;
    const productIds = new Set(products.map((product) => product.id));
    const memberships = membershipsResponse.data.filter((row) => productIds.has(row.product_id));
    const images = imagesResponse.data.filter((row) => productIds.has(row.product_id));
    const runs = new Map(runsResponse.data.map((run) => [run.product_draft_id, run.status]));
    if (products.length !== 16 || images.length !== 20) {
      throw new Error("uat_marketplace_fixture_product_count_invalid");
    }

    const categoryIds = await this.categoryIdsBySlug();
    const sellerBySlug = new Map(sellers.map((seller) => [seller.slug, seller]));
    for (const fixtureSeller of UAT_MARKETPLACE_SELLERS) {
      const seller = sellerBySlug.get(fixtureSeller.slug)!;
      await this.requireQaAccountOwnership(fixtureSeller.email, seller.owner_id!);
      for (const fixtureProduct of fixtureSeller.products) {
        const matching = products.filter(
          (product) => product.seller_id === seller.id && product.title === fixtureProduct.title,
        );
        const product = matching[0];
        const productImages = product
          ? images.filter((image) => image.product_id === product.id)
          : [];
        const productAudiences = product
          ? memberships.filter((membership) => membership.product_id === product.id)
          : [];
        if (
          matching.length !== 1 ||
          !product ||
          product.status !== "published" ||
          product.category_id !== categoryIds.get(fixtureProduct.categorySlug) ||
          !product.description ||
          !product.product_code ||
          !product.cover_image_url ||
          productImages.length !== fixtureProduct.imageFiles.length ||
          productAudiences.length !== 1 ||
          productAudiences[0]!.audience !== fixtureSeller.audience ||
          runs.get(product.id) !== "completed"
        ) {
          throw new Error(
            `uat_marketplace_fixture_product_verification_failed:${fixtureProduct.title}`,
          );
        }
      }
    }

    const publicUrls = [
      ...sellers.flatMap((seller) => [seller.cover_image_url!, seller.logo_url!]),
      ...images.map((image) => image.url),
    ];
    for (const url of publicUrls) {
      const objectKey = publicObjectKey(url, this.supabaseUrl);
      if (
        !objectKey ||
        !(await this.publicationStorage.read(
          PUBLIC_IMAGE_BUCKET,
          objectKey,
          new AbortController().signal,
        ))
      ) {
        throw new Error(`uat_marketplace_fixture_public_object_missing:${objectKey ?? "invalid"}`);
      }
    }

    return {
      sellerCount: sellers.length,
      sellerSlugs: sellers.map((seller) => seller.slug),
      productCount: products.length,
      publicImageCount: images.length,
      productCodes: products.map((product) => product.product_code!).sort(),
    };
  }

  private async listAllSellers(): Promise<SellerRow[]> {
    const response = await this.database.from("sellers").select("*").order("id");
    if (response.error) throw databaseFailure("list_all_sellers", response.error);
    return response.data;
  }

  private async listDatabaseAdministratorUserIds(): Promise<string[]> {
    const response = await this.database.from("user_roles").select("user_id").eq("role", "admin");
    if (response.error) throw databaseFailure("list_administrators", response.error);
    return response.data.map((row) => row.user_id);
  }

  private async captureStorageObjects(sellers: SellerRow[], sellerIds: string[]) {
    const products = await this.database
      .from("products")
      .select("id,cover_image_url")
      .in("seller_id", sellerIds);
    if (products.error) throw databaseFailure("capture_products", products.error);
    const productIds = products.data.map((product) => product.id);

    const privateKeys = productIds.length
      ? await this.database
          .from("product_draft_images")
          .select("destination_key,storage_bucket")
          .in("product_draft_id", productIds)
      : { data: [], error: null };
    const publicationKeys = productIds.length
      ? await this.database
          .from("product_image_publication_items")
          .select("destination_key")
          .in("product_draft_id", productIds)
      : { data: [], error: null };
    const publicImages = productIds.length
      ? await this.database.from("product_images").select("url").in("product_id", productIds)
      : { data: [], error: null };
    if (privateKeys.error) throw databaseFailure("capture_private_images", privateKeys.error);
    if (publicationKeys.error) {
      throw databaseFailure("capture_publication_images", publicationKeys.error);
    }
    if (publicImages.error) throw databaseFailure("capture_public_images", publicImages.error);

    const publicObjectKeys = new Set(
      [
        ...sellers.flatMap((seller) => [seller.cover_image_url, seller.logo_url]),
        ...products.data.map((product) => product.cover_image_url),
        ...publicImages.data.map((image) => image.url),
      ]
        .filter((url): url is string => Boolean(url))
        .flatMap((url) => {
          const key = publicObjectKey(url, this.supabaseUrl);
          return key ? [key] : [];
        }),
    );
    publicationKeys.data.forEach((row) => publicObjectKeys.add(row.destination_key));
    (await this.listStorageObjectKeys(PUBLIC_IMAGE_BUCKET, UAT_MARKETPLACE_FIXTURE_PREFIX)).forEach(
      (key) => publicObjectKeys.add(key),
    );

    return {
      privateObjectKeys: privateKeys.data
        .filter((row) => row.storage_bucket === PRIVATE_IMAGE_BUCKET)
        .map((row) => row.destination_key),
      publicObjectKeys: [...publicObjectKeys],
    };
  }

  private async removeAndVerifyStorageObjects(
    bucket: typeof PRIVATE_IMAGE_BUCKET | typeof PUBLIC_IMAGE_BUCKET,
    keys: string[],
  ): Promise<number> {
    const unique = [...new Set(keys)].sort();
    let deleted = 0;
    for (let index = 0; index < unique.length; index += STORAGE_PAGE_SIZE) {
      const batch = unique.slice(index, index + STORAGE_PAGE_SIZE);
      const response = await this.database.storage.from(bucket).remove(batch);
      if (response.error)
        throw new Error(`uat_marketplace_fixture_storage_delete_failed:${bucket}`);
      deleted += response.data?.length ?? 0;
    }
    for (const key of unique) {
      const current = await this.publicationStorage.read(bucket, key, new AbortController().signal);
      if (current)
        throw new Error(`uat_marketplace_fixture_storage_delete_unverified:${bucket}:${key}`);
    }
    return deleted;
  }

  private async deleteSellerData(sellerIds: string[], ownerIds: string[]): Promise<number> {
    return this.sql.begin(async (transaction) => {
      // Supabase CLI database logins are intentionally unprivileged until they
      // assume the project-local postgres role used by migration tooling.
      await transaction`SET LOCAL ROLE postgres`;
      await transaction`DELETE FROM public.leads WHERE seller_id IN ${transaction(sellerIds)}`;
      await transaction`DELETE FROM public.products WHERE seller_id IN ${transaction(sellerIds)}`;
      await transaction`DELETE FROM public.classifier_import_runs WHERE seller_id IN ${transaction(sellerIds)}`;
      await transaction`DELETE FROM public.delegated_administrator_action_attempts WHERE seller_id IN ${transaction(sellerIds)}`;
      await transaction`DELETE FROM public.seller_classifier_batches WHERE seller_id IN ${transaction(sellerIds)}`;
      await transaction`DELETE FROM public.product_code_allocations WHERE seller_id IN ${transaction(sellerIds)}`;
      if (ownerIds.length > 0) {
        await transaction`DELETE FROM public.user_roles WHERE role = 'seller' AND user_id IN ${transaction(ownerIds)}`;
      }
      const deleted =
        await transaction`DELETE FROM public.sellers WHERE id IN ${transaction(sellerIds)} RETURNING id`;
      return deleted.length;
    });
  }

  private async ensureQaUser(email: string, password: string, sellerSlug: string): Promise<User> {
    const matching = (await this.listAuthUsers()).filter(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (matching.length > 1) throw new Error(`uat_marketplace_fixture_auth_conflict:${email}`);
    const attributes = {
      email,
      password,
      email_confirm: true,
      app_metadata: { uat_marketplace_fixture: true, fixture_seller_slug: sellerSlug },
      user_metadata: { display_name: sellerSlug, uat_marketplace_fixture: true },
    };
    if (!matching[0]) {
      const created = await this.database.auth.admin.createUser(attributes);
      if (created.error || !created.data.user) {
        throw new Error(`uat_marketplace_fixture_auth_create_failed:${email}`);
      }
      return created.data.user;
    }
    const updated = await this.database.auth.admin.updateUserById(matching[0].id, attributes);
    if (updated.error || !updated.data.user) {
      throw new Error(`uat_marketplace_fixture_auth_update_failed:${email}`);
    }
    return updated.data.user;
  }

  private async listAuthUsers(): Promise<User[]> {
    const users: User[] = [];
    for (let page = 1; ; page += 1) {
      const response = await this.database.auth.admin.listUsers({ page, perPage: 100 });
      if (response.error) throw new Error("uat_marketplace_fixture_auth_list_failed");
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
        p_whatsapp: null,
        p_submitted_company_code: fixture.companyCode,
      });
      if (created.error || !created.data?.[0]) {
        throw databaseFailure("create_seller", created.error ?? { message: "missing seller" });
      }
      seller = created.data[0];
    }
    if (seller.slug !== fixture.slug || seller.company_code !== fixture.companyCode) {
      throw new Error(`uat_marketplace_fixture_seller_conflict:${fixture.slug}`);
    }
    return seller;
  }

  private async ensurePublicObject(
    objectKey: string,
    asset: UatMarketplaceFixtureAsset,
  ): Promise<string> {
    const existing = await this.publicationStorage.read(
      PUBLIC_IMAGE_BUCKET,
      objectKey,
      new AbortController().signal,
    );
    if (existing) {
      if (
        existing.contentType !== asset.contentType ||
        sha256(existing.bytes) !== sha256(asset.bytes)
      ) {
        throw new Error(`uat_marketplace_fixture_public_object_conflict:${objectKey}`);
      }
    } else {
      const created = await this.publicationStorage.createPublicObject({
        objectKey,
        bytes: asset.bytes,
        contentType: asset.contentType,
        metadata: { fixture: "0039c1", kind: "seller-branding" },
        signal: new AbortController().signal,
      });
      if (created !== "created") {
        throw new Error(`uat_marketplace_fixture_public_object_conflict:${objectKey}`);
      }
    }
    return this.publicationStorage.publicUrl(objectKey);
  }

  private async privateObjectMatches(
    objectKey: string,
    asset: UatMarketplaceFixtureAsset,
  ): Promise<boolean> {
    const existing = await this.publicationStorage.read(
      PRIVATE_IMAGE_BUCKET,
      objectKey,
      new AbortController().signal,
    );
    return Boolean(
      existing &&
      existing.contentType === asset.contentType &&
      sha256(existing.bytes) === sha256(asset.bytes),
    );
  }

  private async findFixtureProduct(sellerId: string, title: string): Promise<ProductRow | null> {
    const response = await this.database
      .from("products")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("title", title);
    if (response.error) throw databaseFailure("find_product", response.error);
    if (response.data.length > 1)
      throw new Error(`uat_marketplace_fixture_product_conflict:${title}`);
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
      throw new Error(`uat_marketplace_fixture_category_invalid:${slug}`);
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

  private async requireQaAccountOwnership(email: string, ownerId: string): Promise<void> {
    const users = await this.listAuthUsers();
    if (
      users.filter(
        (user) => user.id === ownerId && user.email?.toLowerCase() === email.toLowerCase(),
      ).length !== 1
    ) {
      throw new Error(`uat_marketplace_fixture_auth_verification_failed:${email}`);
    }
  }

  private async listStorageObjectKeys(bucket: string, rootPrefix: string): Promise<string[]> {
    const objects: string[] = [];
    const prefixes = [rootPrefix];
    while (prefixes.length > 0) {
      const prefix = prefixes.shift()!;
      for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
        const response = await this.database.storage.from(bucket).list(prefix, {
          limit: STORAGE_PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (response.error)
          throw new Error(`uat_marketplace_fixture_storage_list_failed:${bucket}`);
        for (const entry of response.data) {
          const path = `${prefix}/${entry.name}`;
          if (entry.id) objects.push(path);
          else prefixes.push(path);
        }
        if (response.data.length < STORAGE_PAGE_SIZE) break;
      }
    }
    return objects;
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

function deterministicUuid(value: string): string {
  const bytes = createHash("sha256")
    .update(`bazoria-uat-marketplace:${value}`)
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

function databaseFailure(operation: string, error: { message: string }): Error {
  console.error("[UAT marketplace fixtures] Database operation failed.", {
    operation,
    message: error.message,
  });
  return new Error(`uat_marketplace_fixture_database_failed:${operation}`);
}

function isAuthUserMissing(message: string): boolean {
  return message.toLowerCase().includes("not found");
}
