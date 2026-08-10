export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      delegated_administrator_action_attempts: {
        Row: {
          action_type: string;
          administrator_user_id: string;
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          request_fingerprint: string;
          request_id: string;
          seller_id: string;
          status: string;
          target_id: string | null;
          workflow_id: string;
        };
        Insert: {
          action_type: string;
          administrator_user_id: string;
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          request_fingerprint: string;
          request_id: string;
          seller_id: string;
          status?: string;
          target_id?: string | null;
          workflow_id: string;
        };
        Update: {
          action_type?: string;
          administrator_user_id?: string;
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          request_fingerprint?: string;
          request_id?: string;
          seller_id?: string;
          status?: string;
          target_id?: string | null;
          workflow_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delegated_administrator_action_attempts_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delegated_administrator_action_attempts_workflow_id_fkey";
            columns: ["workflow_id"];
            isOneToOne: false;
            referencedRelation: "seller_classifier_batches";
            referencedColumns: ["id"];
          },
        ];
      };
      classifier_import_group_outcomes: {
        Row: {
          approved_category_slug: string | null;
          classifier_group_id: string;
          classifier_import_run_id: string;
          created_at: string;
          error_code: string | null;
          product_draft_id: string | null;
          retryable: boolean;
          source_cover_classifier_image_id: string;
          source_group_position: number | null;
          status: Database["public"]["Enums"]["classifier_import_group_status"];
          updated_at: string;
        };
        Insert: {
          approved_category_slug?: string | null;
          classifier_group_id: string;
          classifier_import_run_id: string;
          created_at?: string;
          error_code?: string | null;
          product_draft_id?: string | null;
          retryable?: boolean;
          source_cover_classifier_image_id: string;
          source_group_position?: number | null;
          status?: Database["public"]["Enums"]["classifier_import_group_status"];
          updated_at?: string;
        };
        Update: {
          approved_category_slug?: string | null;
          classifier_group_id?: string;
          classifier_import_run_id?: string;
          created_at?: string;
          error_code?: string | null;
          product_draft_id?: string | null;
          retryable?: boolean;
          source_cover_classifier_image_id?: string;
          source_group_position?: number | null;
          status?: Database["public"]["Enums"]["classifier_import_group_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classifier_import_group_outcomes_classifier_import_run_id_fkey";
            columns: ["classifier_import_run_id"];
            isOneToOne: false;
            referencedRelation: "classifier_import_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classifier_import_group_outcomes_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      classifier_import_runs: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          classifier_batch_id: string;
          classifier_organization_id: string;
          completed_at: string | null;
          created_at: string;
          error_code: string | null;
          id: string;
          last_heartbeat_at: string | null;
          operation_kind: Database["public"]["Enums"]["classifier_import_operation_kind"];
          pipeline_version: string | null;
          requested_by_user_id: string | null;
          retry_policy: Database["public"]["Enums"]["classifier_import_retry_policy"];
          retryable: boolean;
          seller_classifier_workflow_id: string | null;
          seller_id: string;
          status: Database["public"]["Enums"]["classifier_import_status"];
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          classifier_batch_id: string;
          classifier_organization_id: string;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          last_heartbeat_at?: string | null;
          operation_kind?: Database["public"]["Enums"]["classifier_import_operation_kind"];
          pipeline_version?: string | null;
          requested_by_user_id?: string | null;
          retry_policy?: Database["public"]["Enums"]["classifier_import_retry_policy"];
          retryable?: boolean;
          seller_classifier_workflow_id?: string | null;
          seller_id: string;
          status?: Database["public"]["Enums"]["classifier_import_status"];
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          classifier_batch_id?: string;
          classifier_organization_id?: string;
          completed_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          id?: string;
          last_heartbeat_at?: string | null;
          operation_kind?: Database["public"]["Enums"]["classifier_import_operation_kind"];
          pipeline_version?: string | null;
          requested_by_user_id?: string | null;
          retry_policy?: Database["public"]["Enums"]["classifier_import_retry_policy"];
          retryable?: boolean;
          seller_classifier_workflow_id?: string | null;
          seller_id?: string;
          status?: Database["public"]["Enums"]["classifier_import_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "classifier_import_runs_seller_classifier_workflow_id_fkey";
            columns: ["seller_classifier_workflow_id"];
            isOneToOne: true;
            referencedRelation: "seller_classifier_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classifier_import_runs_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          parent_id: string | null;
          product_code_prefix: string | null;
          slug: string;
          sort_order: number;
          tagline: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          parent_id?: string | null;
          product_code_prefix?: string | null;
          slug: string;
          sort_order?: number;
          tagline?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
          product_code_prefix?: string | null;
          slug?: string;
          sort_order?: number;
          tagline?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          buyer_country: string | null;
          buyer_email: string | null;
          buyer_name: string | null;
          buyer_phone: string | null;
          created_at: string;
          id: string;
          message: string | null;
          product_id: string | null;
          seller_id: string | null;
          source: Database["public"]["Enums"]["lead_source"];
        };
        Insert: {
          buyer_country?: string | null;
          buyer_email?: string | null;
          buyer_name?: string | null;
          buyer_phone?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          product_id?: string | null;
          seller_id?: string | null;
          source?: Database["public"]["Enums"]["lead_source"];
        };
        Update: {
          buyer_country?: string | null;
          buyer_email?: string | null;
          buyer_name?: string | null;
          buyer_phone?: string | null;
          created_at?: string;
          id?: string;
          message?: string | null;
          product_id?: string | null;
          seller_id?: string | null;
          source?: Database["public"]["Enums"]["lead_source"];
        };
        Relationships: [
          {
            foreignKeyName: "leads_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_facts: {
        Row: {
          created_at: string;
          facts_json: Json;
          facts_revision: number;
          product_draft_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          facts_json?: Json;
          facts_revision?: number;
          product_draft_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          facts_json?: Json;
          facts_revision?: number;
          product_draft_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_facts_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_description_generation_attempts: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          created_at: string;
          error_code: string | null;
          finished_at: string | null;
          product_draft_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          finished_at?: string | null;
          product_draft_id: string;
          status: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          created_at?: string;
          error_code?: string | null;
          finished_at?: string | null;
          product_draft_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_description_generation_attempts_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_descriptions: {
        Row: {
          backfilled_from_legacy: boolean;
          created_at: string;
          description_text: string;
          facts_revision: number | null;
          generated_at: string | null;
          language: string;
          model: string | null;
          pipeline_version: string | null;
          product_draft_id: string;
          provider: string | null;
          source: string;
          updated_at: string;
        };
        Insert: {
          backfilled_from_legacy?: boolean;
          created_at?: string;
          description_text: string;
          facts_revision?: number | null;
          generated_at?: string | null;
          language: string;
          model?: string | null;
          pipeline_version?: string | null;
          product_draft_id: string;
          provider?: string | null;
          source: string;
          updated_at?: string;
        };
        Update: {
          backfilled_from_legacy?: boolean;
          created_at?: string;
          description_text?: string;
          facts_revision?: number | null;
          generated_at?: string | null;
          language?: string;
          model?: string | null;
          pipeline_version?: string | null;
          product_draft_id?: string;
          provider?: string | null;
          source?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_descriptions_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_image_promotions: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          classifier_batch_id: string;
          classifier_group_id: string;
          classifier_image_id: string;
          classifier_organization_id: string;
          created_at: string;
          destination_size_bytes: number | null;
          error_code: string | null;
          id: string;
          is_source_cover: boolean;
          last_attempt_at: string | null;
          product_draft_id: string;
          product_draft_image_id: string;
          promoted_at: string | null;
          retryable: boolean;
          source_content_length: number | null;
          status: Database["public"]["Enums"]["product_draft_image_promotion_status"];
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          classifier_batch_id: string;
          classifier_group_id: string;
          classifier_image_id: string;
          classifier_organization_id: string;
          created_at?: string;
          destination_size_bytes?: number | null;
          error_code?: string | null;
          id?: string;
          is_source_cover: boolean;
          last_attempt_at?: string | null;
          product_draft_id: string;
          product_draft_image_id: string;
          promoted_at?: string | null;
          retryable?: boolean;
          source_content_length?: number | null;
          status?: Database["public"]["Enums"]["product_draft_image_promotion_status"];
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          classifier_batch_id?: string;
          classifier_group_id?: string;
          classifier_image_id?: string;
          classifier_organization_id?: string;
          created_at?: string;
          destination_size_bytes?: number | null;
          error_code?: string | null;
          id?: string;
          is_source_cover?: boolean;
          last_attempt_at?: string | null;
          product_draft_id?: string;
          product_draft_image_id?: string;
          promoted_at?: string | null;
          retryable?: boolean;
          source_content_length?: number | null;
          status?: Database["public"]["Enums"]["product_draft_image_promotion_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_image_promotions_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_draft_image_promotions_product_draft_image_id_fkey";
            columns: ["product_draft_image_id"];
            isOneToOne: true;
            referencedRelation: "product_draft_images";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_image_storage_cutovers: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          completed_at: string | null;
          completed_count: number;
          created_at: string;
          error_code: string | null;
          failed_count: number;
          last_attempt_at: string | null;
          pending_count: number;
          release_blocking_count: number;
          scan_cursor: string | null;
          scan_phase: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          started_at: string | null;
          started_count: number;
          status: Database["public"]["Enums"]["product_draft_image_storage_cutover_status"];
          updated_at: string;
          version: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          completed_count?: number;
          created_at?: string;
          error_code?: string | null;
          failed_count?: number;
          last_attempt_at?: string | null;
          pending_count?: number;
          release_blocking_count?: number;
          scan_cursor?: string | null;
          scan_phase?: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          started_at?: string | null;
          started_count?: number;
          status?: Database["public"]["Enums"]["product_draft_image_storage_cutover_status"];
          updated_at?: string;
          version: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          completed_count?: number;
          created_at?: string;
          error_code?: string | null;
          failed_count?: number;
          last_attempt_at?: string | null;
          pending_count?: number;
          release_blocking_count?: number;
          scan_cursor?: string | null;
          scan_phase?: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          started_at?: string | null;
          started_count?: number;
          status?: Database["public"]["Enums"]["product_draft_image_storage_cutover_status"];
          updated_at?: string;
          version?: string;
        };
        Relationships: [];
      };
      product_draft_image_storage_reconciliations: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          completed_at: string | null;
          created_at: string;
          destination_key: string;
          error_code: string | null;
          last_attempt_at: string | null;
          product_draft_image_id: string | null;
          public_object_state: Database["public"]["Enums"]["product_draft_image_public_object_state"];
          release_blocking: boolean;
          retryable: boolean;
          status: Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"];
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          destination_key: string;
          error_code?: string | null;
          last_attempt_at?: string | null;
          product_draft_image_id?: string | null;
          public_object_state?: Database["public"]["Enums"]["product_draft_image_public_object_state"];
          release_blocking?: boolean;
          retryable?: boolean;
          status?: Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"];
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          destination_key?: string;
          error_code?: string | null;
          last_attempt_at?: string | null;
          product_draft_image_id?: string | null;
          public_object_state?: Database["public"]["Enums"]["product_draft_image_public_object_state"];
          release_blocking?: boolean;
          retryable?: boolean;
          status?: Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_image_storage_reconciliations_product_draft_image_id_fkey";
            columns: ["product_draft_image_id"];
            isOneToOne: true;
            referencedRelation: "product_draft_images";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_images: {
        Row: {
          classifier_image_id: string | null;
          client_upload_id: string | null;
          content_type: string | null;
          created_at: string;
          destination_key: string;
          id: string;
          lifecycle_error_code: string | null;
          original_filename: string | null;
          product_draft_id: string;
          size_bytes: number | null;
          source_kind: string;
          source_position: number;
          status: Database["public"]["Enums"]["product_draft_image_status"];
          storage_bucket: string;
          updated_at: string;
        };
        Insert: {
          classifier_image_id?: string | null;
          client_upload_id?: string | null;
          content_type?: string | null;
          created_at?: string;
          destination_key: string;
          id?: string;
          lifecycle_error_code?: string | null;
          original_filename?: string | null;
          product_draft_id: string;
          size_bytes?: number | null;
          source_kind?: string;
          source_position: number;
          status?: Database["public"]["Enums"]["product_draft_image_status"];
          storage_bucket?: string;
          updated_at?: string;
        };
        Update: {
          classifier_image_id?: string | null;
          client_upload_id?: string | null;
          content_type?: string | null;
          created_at?: string;
          destination_key?: string;
          id?: string;
          lifecycle_error_code?: string | null;
          original_filename?: string | null;
          product_draft_id?: string;
          size_bytes?: number | null;
          source_kind?: string;
          source_position?: number;
          status?: Database["public"]["Enums"]["product_draft_image_status"];
          storage_bucket?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_images_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_draft_source_memberships: {
        Row: {
          classifier_batch_id: string;
          classifier_group_id: string;
          classifier_image_id: string;
          classifier_organization_id: string;
          created_at: string;
          duplicate_of_classifier_image_id: string | null;
          is_duplicate: boolean;
          product_draft_id: string;
          promotion_required: boolean;
          source_position: number;
          updated_at: string;
        };
        Insert: {
          classifier_batch_id: string;
          classifier_group_id: string;
          classifier_image_id: string;
          classifier_organization_id: string;
          created_at?: string;
          duplicate_of_classifier_image_id?: string | null;
          is_duplicate: boolean;
          product_draft_id: string;
          promotion_required: boolean;
          source_position: number;
          updated_at?: string;
        };
        Update: {
          classifier_batch_id?: string;
          classifier_group_id?: string;
          classifier_image_id?: string;
          classifier_organization_id?: string;
          created_at?: string;
          duplicate_of_classifier_image_id?: string | null;
          is_duplicate?: boolean;
          product_draft_id?: string;
          promotion_required?: boolean;
          source_position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_draft_source_memberships_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_audience_memberships: {
        Row: {
          audience: string;
          created_at: string;
          product_id: string;
        };
        Insert: {
          audience: string;
          created_at?: string;
          product_id: string;
        };
        Update: {
          audience?: string;
          created_at?: string;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_audience_memberships_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_image_publication_cutover_changes: {
        Row: {
          cover_changed: boolean;
          previous_cover_image_url: string | null;
          previous_status: Database["public"]["Enums"]["product_status"];
          product_draft_id: string;
          recorded_at: string;
          status_changed: boolean;
        };
        Insert: {
          cover_changed: boolean;
          previous_cover_image_url?: string | null;
          previous_status: Database["public"]["Enums"]["product_status"];
          product_draft_id: string;
          recorded_at?: string;
          status_changed: boolean;
        };
        Update: {
          cover_changed?: boolean;
          previous_cover_image_url?: string | null;
          previous_status?: Database["public"]["Enums"]["product_status"];
          product_draft_id?: string;
          recorded_at?: string;
          status_changed?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "product_image_publication_cutover_changes_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_image_publication_items: {
        Row: {
          attempt_token: string | null;
          created_at: string;
          destination_key: string;
          error_code: string | null;
          expected_content_type: string;
          expected_source_size_bytes: number;
          is_cover: boolean;
          object_created_by_attempt_token: string | null;
          product_draft_id: string;
          product_draft_image_id: string;
          public_etag: string | null;
          public_sha256: string | null;
          public_size_bytes: number | null;
          public_url: string | null;
          publication_order: number;
          source_bucket: string;
          source_object_key: string;
          source_position: number;
          source_sha256: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_token?: string | null;
          created_at?: string;
          destination_key: string;
          error_code?: string | null;
          expected_content_type: string;
          expected_source_size_bytes: number;
          is_cover: boolean;
          object_created_by_attempt_token?: string | null;
          product_draft_id: string;
          product_draft_image_id: string;
          public_etag?: string | null;
          public_sha256?: string | null;
          public_size_bytes?: number | null;
          public_url?: string | null;
          publication_order: number;
          source_bucket: string;
          source_object_key: string;
          source_position: number;
          source_sha256?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_token?: string | null;
          created_at?: string;
          destination_key?: string;
          error_code?: string | null;
          expected_content_type?: string;
          expected_source_size_bytes?: number;
          is_cover?: boolean;
          object_created_by_attempt_token?: string | null;
          product_draft_id?: string;
          product_draft_image_id?: string;
          public_etag?: string | null;
          public_sha256?: string | null;
          public_size_bytes?: number | null;
          public_url?: string | null;
          publication_order?: number;
          source_bucket?: string;
          source_object_key?: string;
          source_position?: number;
          source_sha256?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_image_publication_items_run_fkey";
            columns: ["product_draft_id"];
            isOneToOne: false;
            referencedRelation: "product_image_publication_runs";
            referencedColumns: ["product_draft_id"];
          },
          {
            foreignKeyName: "product_image_publication_items_source_fkey";
            columns: ["product_draft_id", "product_draft_image_id"];
            isOneToOne: true;
            referencedRelation: "product_draft_images";
            referencedColumns: ["product_draft_id", "id"];
          },
        ];
      };
      product_image_publication_runs: {
        Row: {
          attempt_count: number;
          attempt_token: string | null;
          claim_started_at: string | null;
          completed_at: string | null;
          created_at: string;
          delegated_action_request_fingerprint: string | null;
          delegated_action_request_id: string | null;
          error_code: string | null;
          product_draft_id: string;
          seller_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          delegated_action_request_fingerprint?: string | null;
          delegated_action_request_id?: string | null;
          error_code?: string | null;
          product_draft_id: string;
          seller_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          attempt_token?: string | null;
          claim_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          delegated_action_request_fingerprint?: string | null;
          delegated_action_request_id?: string | null;
          error_code?: string | null;
          product_draft_id?: string;
          seller_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_image_publication_runs_delegated_action_fkey";
            columns: ["delegated_action_request_id"];
            isOneToOne: false;
            referencedRelation: "delegated_administrator_action_attempts";
            referencedColumns: ["request_id"];
          },
          {
            foreignKeyName: "product_image_publication_runs_product_draft_id_fkey";
            columns: ["product_draft_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_image_publication_runs_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      product_images: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          sort_order: number;
          source_product_draft_image_id: string | null;
          url: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          sort_order?: number;
          source_product_draft_image_id?: string | null;
          url: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          sort_order?: number;
          source_product_draft_image_id?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_images_source_product_draft_image_id_fkey";
            columns: ["source_product_draft_image_id"];
            isOneToOne: true;
            referencedRelation: "product_draft_images";
            referencedColumns: ["id"];
          },
        ];
      };
      product_code_allocations: {
        Row: {
          allocated_at: string;
          catalog_category_code_snapshot: string;
          company_code_snapshot: string;
          product_category_code_snapshot: string;
          product_code: string;
          product_id: string;
          seller_id: string;
        };
        Insert: {
          allocated_at?: string;
          catalog_category_code_snapshot: string;
          company_code_snapshot: string;
          product_category_code_snapshot: string;
          product_code: string;
          product_id: string;
          seller_id: string;
        };
        Update: {
          allocated_at?: string;
          catalog_category_code_snapshot?: string;
          company_code_snapshot?: string;
          product_category_code_snapshot?: string;
          product_code?: string;
          product_id?: string;
          seller_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_code_allocations_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          category_id: string | null;
          classifier_group_id: string | null;
          classifier_organization_id: string | null;
          cover_image_id: string | null;
          cover_image_url: string | null;
          created_at: string;
          currency: string;
          description: string | null;
          id: string;
          image_gallery_revision: number;
          moq: number | null;
          pack_size: string | null;
          price: number | null;
          product_code: string | null;
          seller_id: string;
          status: Database["public"]["Enums"]["product_status"];
          stock: Database["public"]["Enums"]["stock_status"];
          title: string;
          title_source: string | null;
          trending: boolean;
          updated_at: string;
        };
        Insert: {
          category_id?: string | null;
          classifier_group_id?: string | null;
          classifier_organization_id?: string | null;
          cover_image_id?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          image_gallery_revision?: number;
          moq?: number | null;
          pack_size?: string | null;
          price?: number | null;
          product_code?: string | null;
          seller_id: string;
          status?: Database["public"]["Enums"]["product_status"];
          stock?: Database["public"]["Enums"]["stock_status"];
          title: string;
          title_source?: string | null;
          trending?: boolean;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          classifier_group_id?: string | null;
          classifier_organization_id?: string | null;
          cover_image_id?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          id?: string;
          image_gallery_revision?: number;
          moq?: number | null;
          pack_size?: string | null;
          price?: number | null;
          product_code?: string | null;
          seller_id?: string;
          status?: Database["public"]["Enums"]["product_status"];
          stock?: Database["public"]["Enums"]["stock_status"];
          title?: string;
          title_source?: string | null;
          trending?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_cover_draft_image_fkey";
            columns: ["id", "cover_image_id"];
            isOneToOne: false;
            referencedRelation: "product_draft_images";
            referencedColumns: ["product_draft_id", "id"];
          },
          {
            foreignKeyName: "products_product_code_allocation_fkey";
            columns: ["product_code", "id", "seller_id"];
            isOneToOne: true;
            referencedRelation: "product_code_allocations";
            referencedColumns: ["product_code", "product_id", "seller_id"];
          },
          {
            foreignKeyName: "products_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      sellers: {
        Row: {
          about: string | null;
          city: string | null;
          company_code: string;
          company_code_locked_at: string | null;
          country: string | null;
          cover_image_url: string | null;
          created_at: string;
          email: string | null;
          established_year: number | null;
          id: string;
          logo_url: string | null;
          name: string;
          owner_id: string | null;
          primary_category_id: string | null;
          published: boolean;
          slug: string;
          updated_at: string;
          verified: boolean;
          whatsapp: string | null;
        };
        Insert: {
          about?: string | null;
          city?: string | null;
          company_code: string;
          company_code_locked_at?: string | null;
          country?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          email?: string | null;
          established_year?: number | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          owner_id?: string | null;
          primary_category_id?: string | null;
          published?: boolean;
          slug: string;
          updated_at?: string;
          verified?: boolean;
          whatsapp?: string | null;
        };
        Update: {
          about?: string | null;
          city?: string | null;
          company_code?: string;
          company_code_locked_at?: string | null;
          country?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          email?: string | null;
          established_year?: number | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          owner_id?: string | null;
          primary_category_id?: string | null;
          published?: boolean;
          slug?: string;
          updated_at?: string;
          verified?: boolean;
          whatsapp?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sellers_primary_category_id_fkey";
            columns: ["primary_category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_classifier_batches: {
        Row: {
          classifier_batch_id: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string | null;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number | null;
          max_files: number | null;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        };
        Insert: {
          classifier_batch_id?: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at?: string;
          error_code?: string | null;
          group_count?: number;
          id?: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage?: string;
          max_file_size_bytes?: number | null;
          max_files?: number | null;
          original_file_count?: number;
          processed_file_count?: number;
          product_draft_count?: number;
          provisioning_status?: string;
          retryable?: boolean;
          seller_id: string;
          updated_at?: string;
        };
        Update: {
          classifier_batch_id?: string | null;
          classifier_organization_id?: string;
          client_request_id?: string;
          created_at?: string;
          error_code?: string | null;
          group_count?: number;
          id?: string;
          initiated_by_user_id?: string;
          initiator_kind?: string;
          last_known_stage?: string;
          max_file_size_bytes?: number | null;
          max_files?: number | null;
          original_file_count?: number;
          processed_file_count?: number;
          product_draft_count?: number;
          provisioning_status?: string;
          retryable?: boolean;
          seller_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_classifier_batches_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      begin_seller_product_draft_image_removal: {
        Args: {
          p_expected_gallery_revision: number;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      complete_seller_product_draft_image_removal: {
        Args: {
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      complete_seller_product_draft_image_upload_cleanup: {
        Args: {
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      fail_seller_product_draft_image_removal: {
        Args: {
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      fail_seller_product_draft_image_upload_cleanup: {
        Args: {
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      finalize_seller_product_draft_image_uploads: {
        Args: {
          p_product_draft_id: string;
          p_results: Json;
          p_seller_id: string;
        };
        Returns: Json;
      };
      prepare_seller_product_draft_image_uploads: {
        Args: {
          p_expected_gallery_revision: number;
          p_files: Json;
          p_product_draft_id: string;
          p_seller_id: string;
          p_verified_absent_image_ids?: string[];
        };
        Returns: Json;
      };
      product_draft_image_gallery_snapshot: {
        Args: { p_product_draft_id: string };
        Returns: Json;
      };
      update_seller_product_draft_image_gallery: {
        Args: {
          p_cover_image_id: string;
          p_expected_gallery_revision: number;
          p_ordered_available_image_ids: string[];
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: Json;
      };
      claim_delegated_administrator_action: {
        Args: {
          p_action_type: string;
          p_administrator_user_id: string;
          p_lease_timeout_seconds: number;
          p_request_fingerprint: string;
          p_request_id: string;
          p_target_id: string | null;
          p_workflow_id: string;
        };
        Returns: {
          attempt_count: number;
          attempt_token: string | null;
          error_code: string | null;
          operation_result: string;
          seller_id: string | null;
          status: string | null;
          target_id: string | null;
        }[];
      };
      finalize_delegated_administrator_action_failure: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_request_id: string;
        };
        Returns: boolean;
      };
      finalize_delegated_administrator_action_success: {
        Args: {
          p_attempt_token: string;
          p_request_id: string;
        };
        Returns: boolean;
      };
      begin_product_draft_image_storage_cutover_scan_phase: {
        Args: {
          p_attempt_token: string;
          p_expected_phase: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          p_next_phase: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          p_version: string;
        };
        Returns: boolean;
      };
      claim_next_product_draft_image_storage_reconciliation: {
        Args: {
          p_claim_timeout_seconds: number;
          p_cutover_attempt_token: string;
          p_version: string;
        };
        Returns: {
          attempt_count: number;
          attempt_token: string;
          classifier_batch_id: string | null;
          classifier_group_id: string | null;
          classifier_image_id: string | null;
          classifier_organization_id: string | null;
          content_type: string | null;
          destination_key: string;
          image_status: Database["public"]["Enums"]["product_draft_image_status"] | null;
          product_draft_image_id: string | null;
          public_object_state: Database["public"]["Enums"]["product_draft_image_public_object_state"];
          reconciliation_status: Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"];
          size_bytes: number | null;
          source_content_length: number | null;
          storage_bucket: string | null;
        }[];
      };
      claim_seller_classifier_batch_provisioning_retry: {
        Args: {
          p_seller_id: string;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string | null;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number | null;
          max_files: number | null;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      complete_seller_classifier_batch_provisioning: {
        Args: {
          p_classifier_batch_id: string;
          p_max_file_size_bytes: number;
          p_max_files: number;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string | null;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number | null;
          max_files: number | null;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      create_or_get_seller_classifier_batch: {
        Args: {
          p_classifier_organization_id: string;
          p_client_request_id: string;
          p_initiated_by_user_id: string;
          p_initiator_kind: string;
          p_seller_id: string;
        };
        Returns: {
          classifier_batch_id: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string | null;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number | null;
          max_files: number | null;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      create_seller_with_company_code: {
        Args: {
          p_city: string | null;
          p_country: string | null;
          p_name: string;
          p_owner_id: string;
          p_primary_category_id: string | null;
          p_slug_base: string;
          p_submitted_company_code: string;
          p_whatsapp: string | null;
        };
        Returns: Database["public"]["Tables"]["sellers"]["Row"][];
      };
      derive_company_code_base: {
        Args: { p_company_name: string };
        Returns: string | null;
      };
      fail_seller_classifier_batch_provisioning: {
        Args: {
          p_error_code: string;
          p_retryable: boolean;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string | null;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number | null;
          max_files: number | null;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      record_seller_classifier_batch_observation: {
        Args: {
          p_error_code: string | null;
          p_observation_kind: string;
          p_original_file_count: number;
          p_processed_file_count: number;
          p_retryable: boolean;
          p_seller_id: string;
          p_stage: string;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string | null;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number | null;
          max_files: number | null;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      record_seller_classifier_review_observation: {
        Args: {
          p_group_count: number;
          p_seller_id: string;
          p_stage: string;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string | null;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number | null;
          max_files: number | null;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      record_seller_classifier_batch_approved: {
        Args: {
          p_group_count: number;
          p_seller_id: string;
          p_workflow_id: string;
        };
        Returns: {
          classifier_batch_id: string | null;
          classifier_organization_id: string;
          client_request_id: string;
          created_at: string;
          error_code: string | null;
          group_count: number;
          id: string;
          initiated_by_user_id: string;
          initiator_kind: string;
          last_known_stage: string;
          max_file_size_bytes: number | null;
          max_files: number | null;
          operation_result: string;
          original_file_count: number;
          processed_file_count: number;
          product_draft_count: number;
          provisioning_status: string;
          retryable: boolean;
          seller_id: string;
          updated_at: string;
        }[];
      };
      get_public_product_description: {
        Args: {
          p_language: string;
          p_product_id: string;
        };
        Returns: {
          description_text: string;
          resolved_language: string;
        }[];
      };
      list_public_clothing_categories: {
        Args: {
          p_audience: string;
          p_limit?: number;
        };
        Returns: {
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        }[];
      };
      list_public_audience_sellers: {
        Args: {
          p_audience: string;
          p_limit?: number;
        };
        Returns: {
          id: string;
          logo_url: string | null;
          name: string;
          slug: string;
        }[];
      };
      list_public_trending_products: {
        Args: {
          p_audience: string;
          p_limit?: number;
        };
        Returns: {
          cover_image_url: string | null;
          created_at: string;
          currency: string;
          id: string;
          moq: number | null;
          pack_size: string | null;
          price: number | null;
          seller_id: string;
          stock: Database["public"]["Enums"]["stock_status"];
          title: string;
        }[];
      };
      list_public_featured_sellers: {
        Args: {
          p_audience: string;
          p_limit?: number;
        };
        Returns: {
          city: string | null;
          country: string | null;
          cover_image_url: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          primary_category_id: string | null;
          slug: string;
          verified: boolean;
        }[];
      };
      list_public_category_products: {
        Args: {
          p_audience: string;
          p_category_slug: string;
          p_limit?: number;
        };
        Returns: {
          cover_image_url: string | null;
          created_at: string;
          currency: string;
          id: string;
          moq: number | null;
          pack_size: string | null;
          price: number | null;
          seller_id: string;
          stock: Database["public"]["Enums"]["stock_status"];
          title: string;
        }[];
      };
      list_public_category_sellers: {
        Args: {
          p_audience: string;
          p_category_slug: string;
          p_limit?: number;
        };
        Returns: {
          city: string | null;
          country: string | null;
          cover_image_url: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          slug: string;
          verified: boolean;
        }[];
      };
      list_public_seller_products: {
        Args: {
          p_audience: string;
          p_limit?: number;
          p_seller_slug: string;
        };
        Returns: {
          category_id: string | null;
          category_name: string | null;
          category_slug: string | null;
          cover_image_url: string | null;
          created_at: string;
          currency: string;
          id: string;
          moq: number | null;
          pack_size: string | null;
          price: number | null;
          stock: Database["public"]["Enums"]["stock_status"];
          title: string;
        }[];
      };
      search_delegated_upload_sellers: {
        Args: {
          p_limit: number;
          p_query: string;
        };
        Returns: {
          name: string;
          published: boolean;
          seller_id: string;
          slug: string;
        }[];
      };
      update_unlocked_seller_company_code: {
        Args: { p_submitted_company_code: string };
        Returns: Database["public"]["Tables"]["sellers"]["Row"][];
      };
      claim_product_draft_image_storage_cutover: {
        Args: {
          p_claim_timeout_seconds: number;
          p_version: string;
        };
        Returns: Database["public"]["Tables"]["product_draft_image_storage_cutovers"]["Row"][];
      };
      complete_product_draft_image_storage_cutover: {
        Args: {
          p_attempt_token: string;
          p_version: string;
        };
        Returns: boolean;
      };
      fail_product_draft_image_storage_cutover: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_version: string;
        };
        Returns: boolean;
      };
      finalize_product_draft_image_storage_reconciliation: {
        Args: {
          p_cutover_attempt_token: string;
          p_destination_key: string;
          p_error_code: string | null;
          p_public_object_state: Database["public"]["Enums"]["product_draft_image_public_object_state"];
          p_reconciliation_attempt_token: string;
          p_release_blocking: boolean;
          p_retryable: boolean;
          p_set_private_bucket: boolean;
          p_status: Database["public"]["Enums"]["product_draft_image_storage_reconciliation_status"];
          p_version: string;
        };
        Returns: boolean;
      };
      heartbeat_product_draft_image_storage_cutover: {
        Args: {
          p_attempt_token: string;
          p_version: string;
        };
        Returns: boolean;
      };
      list_legacy_product_draft_public_object_keys: {
        Args: {
          p_cursor: string | null;
          p_limit: number;
        };
        Returns: {
          destination_key: string;
        }[];
      };
      record_product_draft_image_storage_scan_object: {
        Args: {
          p_cutover_attempt_token: string;
          p_destination_key: string;
          p_version: string;
        };
        Returns: string;
      };
      retry_product_draft_image_storage_reconciliation: {
        Args: {
          p_destination_key: string;
          p_version: string;
        };
        Returns: boolean;
      };
      set_product_draft_image_storage_cutover_scan_progress: {
        Args: {
          p_attempt_token: string;
          p_expected_cursor: string | null;
          p_next_cursor: string | null;
          p_scan_phase: Database["public"]["Enums"]["product_draft_image_storage_cutover_scan_phase"];
          p_version: string;
        };
        Returns: boolean;
      };
      verify_product_draft_image_storage_reconciliation_claim: {
        Args: {
          p_cutover_attempt_token: string;
          p_destination_key: string;
          p_reconciliation_attempt_token: string;
          p_version: string;
        };
        Returns: boolean;
      };
      apply_product_draft_facts_patch: {
        Args: {
          p_expected_seller_id?: string | null;
          p_normalized_patch: Json;
          p_product_draft_id: string;
        };
        Returns: {
          facts_json: Json | null;
          facts_revision: number | null;
          product_draft_id: string | null;
          product_status: Database["public"]["Enums"]["product_status"] | null;
          result: string;
          updated_at: string | null;
        }[];
      };
      apply_product_draft_description_patch: {
        Args: {
          p_de_description: string | null;
          p_de_patch_present: boolean;
          p_en_description: string | null;
          p_en_patch_present: boolean;
          p_pl_description: string | null;
          p_pl_patch_present: boolean;
          p_product_draft_id: string;
          p_vi_description: string | null;
          p_vi_patch_present: boolean;
        };
        Returns: {
          result: string;
          snapshot: Json | null;
        }[];
      };
      apply_scoped_product_draft_description_patch: {
        Args: {
          p_de_description: string | null;
          p_de_patch_present: boolean;
          p_en_description: string | null;
          p_en_patch_present: boolean;
          p_expected_seller_id: string | null;
          p_pl_description: string | null;
          p_pl_patch_present: boolean;
          p_product_draft_id: string;
          p_vi_description: string | null;
          p_vi_patch_present: boolean;
        };
        Returns: {
          result: string;
          snapshot: Json | null;
        }[];
      };
      claim_product_draft_description_generation: {
        Args: {
          p_expected_seller_id: string;
          p_product_draft_id: string;
        };
        Returns: {
          attempt_token: string | null;
          category_id: string | null;
          category_name: string | null;
          category_slug: string | null;
          cover_content_type: string | null;
          cover_image_id: string | null;
          cover_image_url: string | null;
          cover_object_key: string | null;
          cover_size_bytes: number | null;
          cover_source: string | null;
          cover_storage_bucket: string | null;
          facts_json: Json | null;
          facts_revision: number | null;
          human_languages: string[] | null;
          result: string;
          title_blank: boolean | null;
        }[];
      };
      finalize_product_draft_description_generation: {
        Args: {
          p_attempt_token: string;
          p_descriptions: Json;
          p_expected_category_id: string | null;
          p_expected_cover_content_type: string | null;
          p_expected_cover_image_id: string | null;
          p_expected_cover_image_url: string | null;
          p_expected_cover_object_key: string | null;
          p_expected_cover_size_bytes: number | null;
          p_expected_cover_source: string;
          p_expected_cover_storage_bucket: string | null;
          p_expected_facts_revision: number;
          p_expected_seller_id: string;
          p_generated_at: string;
          p_model: string;
          p_pipeline_version: string;
          p_product_draft_id: string;
          p_provider: string;
          p_title_proposal: string | null;
        };
        Returns: {
          description_snapshot: Json | null;
          result: string;
          title_snapshot: Json | null;
        }[];
      };
      fail_product_draft_description_generation: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_expected_seller_id: string;
          p_product_draft_id: string;
        };
        Returns: string;
      };
      archive_seller_product: {
        Args: {
          p_product_id: string;
          p_seller_id: string;
        };
        Returns: {
          product_id: string | null;
          product_status: Database["public"]["Enums"]["product_status"] | null;
          result: string;
        }[];
      };
      save_seller_product_with_description: {
        Args: {
          p_audiences: string[] | null;
          p_category_id: string | null;
          p_cover_image_url: string | null;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string | null;
          p_description_patch_present: boolean;
          p_moq: number | null;
          p_pack_size: string | null;
          p_price: number | null;
          p_product_draft_id: string | null;
          p_seller_id: string;
          p_status: Database["public"]["Enums"]["product_status"];
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string | null;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          english_description: string | null;
          product_draft_id: string | null;
          product_status: Database["public"]["Enums"]["product_status"] | null;
          result: string;
          title: string | null;
          title_source: string | null;
        }[];
      };
      create_seller_product_with_description: {
        Args: {
          p_category_id: string | null;
          p_cover_image_url: string | null;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string | null;
          p_description_patch_present: boolean;
          p_moq: number | null;
          p_pack_size: string | null;
          p_price: number | null;
          p_seller_id: string;
          p_status: Database["public"]["Enums"]["product_status"];
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string | null;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          english_description: string | null;
          product_code: string | null;
          product_draft_id: string | null;
          product_status: Database["public"]["Enums"]["product_status"] | null;
          result: string;
          title: string | null;
          title_source: string | null;
        }[];
      };
      reserve_product_code: {
        Args: {
          p_product_category_id: string;
          p_product_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      validate_product_publication_title: {
        Args: {
          p_title: string | null;
        };
        Returns: {
          normalized_title: string;
          result: string;
        }[];
      };
      authorize_seller_product_publication: {
        Args: {
          p_category_id: string | null;
          p_cover_image_url: string | null;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_description: string | null;
          p_description_patch_present: boolean;
          p_moq: number | null;
          p_pack_size: string | null;
          p_price: number | null;
          p_product_draft_id: string;
          p_seller_id: string;
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string | null;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          product_draft_id: string | null;
          publication_status: string | null;
          result: string;
        }[];
      };
      authorize_product_publication_with_correlation: {
        Args: {
          p_audiences: string[];
          p_category_id: string | null;
          p_cover_image_url: string | null;
          p_cover_image_url_patch_present: boolean;
          p_currency: string;
          p_delegated_action_request_fingerprint: string | null;
          p_delegated_action_request_id: string | null;
          p_description: string | null;
          p_description_patch_present: boolean;
          p_moq: number | null;
          p_pack_size: string | null;
          p_price: number | null;
          p_product_draft_id: string;
          p_seller_id: string;
          p_stock: Database["public"]["Enums"]["stock_status"];
          p_title: string | null;
          p_title_patch_present: boolean;
          p_trending: boolean;
        };
        Returns: {
          product_draft_id: string | null;
          publication_status: string | null;
          result: string;
        }[];
      };
      claim_product_image_publication: {
        Args: {
          p_claim_timeout_seconds: number;
          p_product_draft_id: string;
        };
        Returns: Database["public"]["Tables"]["product_image_publication_runs"]["Row"][];
      };
      clear_product_image_publication_object_ownership: {
        Args: {
          p_attempt_token: string;
          p_created_attempt_token: string;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
        };
        Returns: boolean;
      };
      complete_product_image_publication_cleanup: {
        Args: {
          p_created_attempt_token: string;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
        };
        Returns: boolean;
      };
      fail_product_image_publication_attempt: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
        };
        Returns: boolean;
      };
      fail_claimed_product_image_publication: {
        Args: {
          p_attempt_token: string;
          p_error_code: string;
          p_product_draft_id: string;
        };
        Returns: boolean;
      };
      finalize_product_image_publication_cleanup: {
        Args: {
          p_product_draft_id: string;
        };
        Returns: boolean;
      };
      finalize_seller_product_publication: {
        Args: {
          p_attempt_token: string;
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      mark_product_image_publication_dispatch_failed: {
        Args: {
          p_product_draft_id: string;
        };
        Returns: boolean;
      };
      record_product_image_publication_object_created: {
        Args: {
          p_attempt_token: string;
          p_public_url: string;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_source_sha256: string;
        };
        Returns: boolean;
      };
      retry_product_image_publication: {
        Args: {
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      retry_product_publication_with_correlation: {
        Args: {
          p_delegated_action_request_fingerprint: string | null;
          p_delegated_action_request_id: string | null;
          p_product_draft_id: string;
          p_seller_id: string;
        };
        Returns: string;
      };
      replace_product_audience_memberships: {
        Args: {
          p_audiences: string[];
          p_product_id: string;
          p_seller_id: string;
        };
        Returns: {
          audiences: string[] | null;
          result: string;
        }[];
      };
      validate_product_audience_release_preflight: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      verify_product_image_publication_item: {
        Args: {
          p_attempt_token: string;
          p_created_by_current_attempt: boolean;
          p_product_draft_id: string;
          p_product_draft_image_id: string;
          p_public_etag: string | null;
          p_public_sha256: string;
          p_public_size_bytes: number;
          p_public_url: string;
          p_source_sha256: string;
        };
        Returns: boolean;
      };
      claim_classifier_import_run: {
        Args: {
          p_import_id: string;
          p_lease_timeout_seconds: number;
        };
        Returns: Database["public"]["Tables"]["classifier_import_runs"]["Row"][];
      };
      create_or_get_owned_classifier_import: {
        Args: {
          p_classifier_batch_id: string;
          p_classifier_organization_id: string;
          p_requested_by_user_id: string;
          p_seller_id: string;
          p_workflow_id: string;
        };
        Returns: {
          attempt_count: number | null;
          attempt_token: string | null;
          claim_started_at: string | null;
          classifier_batch_id: string | null;
          classifier_organization_id: string | null;
          completed_at: string | null;
          created_at: string | null;
          error_code: string | null;
          id: string | null;
          last_heartbeat_at: string | null;
          operation_kind: Database["public"]["Enums"]["classifier_import_operation_kind"] | null;
          operation_result: string;
          pipeline_version: string | null;
          requested_by_user_id: string | null;
          retry_policy: Database["public"]["Enums"]["classifier_import_retry_policy"] | null;
          retryable: boolean | null;
          seller_classifier_workflow_id: string | null;
          seller_id: string | null;
          status: Database["public"]["Enums"]["classifier_import_status"] | null;
          updated_at: string | null;
        }[];
      };
      get_owned_seller_classifier_import: {
        Args: {
          p_seller_id: string;
          p_workflow_id: string;
        };
        Returns: Database["public"]["Tables"]["classifier_import_runs"]["Row"][];
      };
      list_owned_classifier_import_product_drafts: {
        Args: {
          p_import_ids: string[];
          p_seller_id: string;
        };
        Returns: {
          classifier_group_id: string;
          classifier_import_run_id: string;
          product_draft_id: string;
          product_status: Database["public"]["Enums"]["product_status"];
          seller_classifier_workflow_id: string;
          source_group_position: number | null;
          title: string;
        }[];
      };
      claim_next_classifier_import_run: {
        Args: {
          p_lease_timeout_seconds: number;
        };
        Returns: Database["public"]["Tables"]["classifier_import_runs"]["Row"][];
      };
      classifier_import_image_action_state: {
        Args: {
          p_import_id: string;
        };
        Returns: {
          has_any_failures: boolean;
          has_promoted_images: boolean;
          has_retryable_failures: boolean;
        }[];
      };
      classifier_import_reset_failed_promotions: {
        Args: {
          p_import_id: string;
          p_include_non_retryable: boolean;
        };
        Returns: string[];
      };
      claim_classifier_image_promotion: {
        Args: {
          p_claim_timeout_seconds: number;
          p_import_id: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
        };
        Returns: Database["public"]["Tables"]["product_draft_image_promotions"]["Row"][];
      };
      finalize_classifier_import_run: {
        Args: {
          p_attempt_token: string;
          p_error_code: string | null;
          p_import_id: string;
          p_retryable: boolean;
          p_status: Database["public"]["Enums"]["classifier_import_status"];
        };
        Returns: boolean;
      };
      finalize_classifier_image_promotion_failure: {
        Args: {
          p_error_code: string;
          p_import_id: string;
          p_promotion_attempt_token: string;
          p_promotion_id: string;
          p_retryable: boolean;
          p_run_attempt_token: string;
        };
        Returns: boolean;
      };
      finalize_classifier_image_promotion_success: {
        Args: {
          p_destination_size_bytes: number;
          p_import_id: string;
          p_promotion_attempt_token: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
        };
        Returns: boolean;
      };
      get_classifier_import_action_state: {
        Args: {
          p_import_id: string;
        };
        Returns: {
          can_reconcile: boolean;
          can_retry_all: boolean;
          can_retry_temporary: boolean;
        }[];
      };
      heartbeat_classifier_import_run: {
        Args: {
          p_attempt_token: string;
          p_import_id: string;
        };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      reconcile_classifier_import: {
        Args: {
          p_import_id: string;
        };
        Returns: string;
      };
      prepare_classifier_import_group: {
        Args: {
          p_approved_category_slug: string | null;
          p_attempt_token: string;
          p_classifier_group_id: string;
          p_import_id: string;
          p_source_cover_classifier_image_id: string;
        };
        Returns: {
          product_draft_id: string | null;
          result: string;
        }[];
      };
      prepare_classifier_import_group_at_position: {
        Args: {
          p_approved_category_slug: string | null;
          p_attempt_token: string;
          p_classifier_group_id: string;
          p_import_id: string;
          p_source_cover_classifier_image_id: string;
          p_source_group_position: number;
        };
        Returns: {
          product_draft_id: string | null;
          result: string;
        }[];
      };
      project_classifier_import_to_seller_workflow: {
        Args: {
          p_import_id: string;
        };
        Returns: boolean;
      };
      prepare_classifier_import_group_images: {
        Args: {
          p_classifier_group_id: string;
          p_cover_classifier_image_id: string;
          p_import_id: string;
          p_memberships: Json;
          p_run_attempt_token: string;
        };
        Returns: {
          product_draft_id: string | null;
          result: string;
        }[];
      };
      retry_classifier_import: {
        Args: {
          p_import_id: string;
          p_include_non_retryable: boolean;
        };
        Returns: string;
      };
      mark_classifier_image_promotion_conflict: {
        Args: {
          p_import_id: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
        };
        Returns: boolean;
      };
      reset_missing_classifier_image_promotion: {
        Args: {
          p_import_id: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
        };
        Returns: boolean;
      };
      set_classifier_import_group_result: {
        Args: {
          p_attempt_token: string;
          p_classifier_group_id: string;
          p_error_code: string | null;
          p_import_id: string;
          p_retryable: boolean;
          p_status: Database["public"]["Enums"]["classifier_import_group_status"];
        };
        Returns: boolean;
      };
      set_classifier_import_pipeline_version: {
        Args: {
          p_attempt_token: string;
          p_import_id: string;
          p_pipeline_version: string;
        };
        Returns: boolean;
      };
      set_classifier_image_promotion_source_length: {
        Args: {
          p_import_id: string;
          p_promotion_attempt_token: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
          p_source_content_length: number;
        };
        Returns: boolean;
      };
      verify_classifier_image_promotion_claim: {
        Args: {
          p_import_id: string;
          p_promotion_attempt_token: string;
          p_promotion_id: string;
          p_run_attempt_token: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "seller" | "admin";
      classifier_import_group_status: "pending" | "processing" | "complete" | "failed";
      classifier_import_operation_kind: "import" | "reconcile";
      classifier_import_retry_policy: "retryable_only" | "include_non_retryable";
      classifier_import_status:
        "pending" | "running" | "completed" | "completed_with_errors" | "failed";
      lead_source: "form" | "whatsapp";
      product_status: "draft" | "published" | "archived";
      product_draft_image_public_object_state: "unchecked" | "absent" | "deleted" | "unresolved";
      product_draft_image_promotion_status: "pending" | "started" | "promoted" | "failed";
      product_draft_image_status: "pending" | "available" | "failed" | "deleting";
      product_draft_image_storage_cutover_scan_phase: "reconciliation" | "discovery" | "confirming";
      product_draft_image_storage_cutover_status: "pending" | "running" | "completed" | "failed";
      product_draft_image_storage_reconciliation_status:
        "pending" | "started" | "completed" | "failed";
      stock_status: "in_stock" | "low_stock" | "out_of_stock" | "made_to_order";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["seller", "admin"],
      classifier_import_group_status: ["pending", "processing", "complete", "failed"],
      classifier_import_operation_kind: ["import", "reconcile"],
      classifier_import_retry_policy: ["retryable_only", "include_non_retryable"],
      classifier_import_status: [
        "pending",
        "running",
        "completed",
        "completed_with_errors",
        "failed",
      ],
      lead_source: ["form", "whatsapp"],
      product_status: ["draft", "published", "archived"],
      product_draft_image_promotion_status: ["pending", "started", "promoted", "failed"],
      product_draft_image_status: ["pending", "available", "failed", "deleting"],
      stock_status: ["in_stock", "low_stock", "out_of_stock", "made_to_order"],
    },
  },
} as const;
