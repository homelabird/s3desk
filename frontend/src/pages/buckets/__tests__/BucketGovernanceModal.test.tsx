import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { message } from "antd";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureDomShims } from "../../../test/domShims";
import { createMockApiClient } from "../../../test/mockApiClient";
import { BucketGovernanceModal } from "../BucketGovernanceModal";

beforeAll(() => {
  ensureDomShims();
});

const SLOW_GOVERNANCE_TIMEOUT_MS = 15_000;

beforeEach(() => {
  vi.spyOn(message, "success").mockImplementation(() => undefined as never);
  vi.spyOn(message, "error").mockImplementation(() => undefined as never);
  vi.spyOn(message, "warning").mockImplementation(() => undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createGovernance(provider: "aws_s3" | "gcp_gcs" | "azure_blob" | "oci_object_storage") {
  switch (provider) {
    case "gcp_gcs":
      return {
        provider,
        bucket: "demo-bucket",
        capabilities: {
          bucket_access_bindings: { enabled: true },
          bucket_access_public_toggle: { enabled: true },
          bucket_public_access_prevention: { enabled: true },
          bucket_uniform_access: { enabled: true },
          bucket_versioning: { enabled: true },
          bucket_retention: { enabled: true },
        },
        publicExposure: {
          provider,
          bucket: "demo-bucket",
          mode: "private",
          publicAccessPrevention: false,
        },
        access: {
          provider,
          bucket: "demo-bucket",
          etag: "BwWWja0YfJA=",
          bindings: [
            {
              role: "roles/storage.objectViewer",
              members: ["user:dev@example.com"],
            },
          ],
        },
        protection: {
          provider,
          bucket: "demo-bucket",
          uniformAccess: true,
          retention: {
            enabled: true,
            days: 30,
          },
        },
        versioning: {
          provider,
          bucket: "demo-bucket",
          status: "enabled",
        },
      };
    case "azure_blob":
      return {
        provider,
        bucket: "demo-bucket",
        capabilities: {
          bucket_access_public_toggle: { enabled: true },
          bucket_stored_access_policy: { enabled: true },
          bucket_versioning: { enabled: true },
          bucket_soft_delete: { enabled: true },
          bucket_immutability: { enabled: true },
        },
        publicExposure: {
          provider,
          bucket: "demo-bucket",
          mode: "private",
          visibility: "private",
        },
        access: {
          provider,
          bucket: "demo-bucket",
          storedAccessPolicies: [
            {
              id: "readonly",
              start: "2026-03-01T00:00:00Z",
              expiry: "2026-03-31T00:00:00Z",
              permission: "rl",
            },
          ],
        },
        protection: {
          provider,
          bucket: "demo-bucket",
          softDelete: {
            enabled: true,
            days: 7,
          },
          immutability: {
            enabled: true,
            days: 30,
            editable: true,
            until: "2026-04-01T00:00:00Z",
          },
        },
        versioning: {
          provider,
          bucket: "demo-bucket",
          status: "disabled",
        },
      };
    case "oci_object_storage":
      return {
        provider,
        bucket: "demo-bucket",
        capabilities: {
          bucket_access_public_toggle: { enabled: true },
          bucket_versioning: { enabled: true },
          bucket_retention: { enabled: true },
          bucket_par: { enabled: true },
        },
        publicExposure: {
          provider,
          bucket: "demo-bucket",
          mode: "private",
          visibility: "private",
        },
        protection: {
          provider,
          bucket: "demo-bucket",
          retention: {
            enabled: true,
            rules: [
              {
                id: "rule-1",
                displayName: "Retention Rule 1",
                days: 45,
                locked: false,
              },
            ],
          },
        },
        versioning: {
          provider,
          bucket: "demo-bucket",
          status: "disabled",
        },
        sharing: {
          provider,
          bucket: "demo-bucket",
          preauthenticatedSupport: true,
          preauthenticatedRequests: [
            {
              id: "par-1",
              name: "Read demo",
              accessType: "AnyObjectRead",
              bucketListingAction: "Deny",
              objectName: "",
              timeCreated: "2026-03-10T00:00:00Z",
              timeExpires: "2026-04-10T00:00:00Z",
            },
          ],
        },
      };
    case "aws_s3":
    default:
      return {
        provider,
        bucket: "demo-bucket",
        capabilities: {
          bucket_public_access_block: { enabled: true },
          bucket_object_ownership: { enabled: true },
          bucket_versioning: { enabled: true },
          bucket_default_encryption: { enabled: true },
          bucket_lifecycle: { enabled: true },
        },
        publicExposure: {
          provider,
          bucket: "demo-bucket",
          mode: "private",
          blockPublicAccess: {
            blockPublicAcls: true,
            ignorePublicAcls: true,
            blockPublicPolicy: true,
            restrictPublicBuckets: true,
          },
        },
        access: {
          provider,
          bucket: "demo-bucket",
          objectOwnership: {
            supported: true,
            mode: "bucket_owner_enforced",
          },
        },
        versioning: {
          provider,
          bucket: "demo-bucket",
          status: "enabled",
        },
        encryption: {
          provider,
          bucket: "demo-bucket",
          mode: "sse_s3",
        },
        lifecycle: {
          provider,
          bucket: "demo-bucket",
          rules: [],
        },
        advanced: {
          rawPolicySupported: true,
          rawPolicyEditable: true,
        },
      };
  }
}

function createApi(
  provider: "aws_s3" | "gcp_gcs" | "azure_blob" | "oci_object_storage" = "aws_s3",
  overrides: Record<string, unknown> = {},
) {
  return createMockApiClient({
    buckets: {
      getBucketGovernance: vi
        .fn()
        .mockResolvedValue(createGovernance(provider)),
      putBucketPublicExposure: vi.fn().mockResolvedValue(undefined),
      putBucketAccess: vi.fn().mockResolvedValue(undefined),
      putBucketProtection: vi.fn().mockResolvedValue(undefined),
      putBucketSharing: vi.fn().mockResolvedValue({
        provider,
        bucket: "demo-bucket",
        preauthenticatedSupport: true,
        preauthenticatedRequests: [],
      }),
      putBucketVersioning: vi.fn().mockResolvedValue(undefined),
      putBucketEncryption: vi.fn().mockResolvedValue(undefined),
      putBucketLifecycle: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  });
}

function renderModal(
  api: ReturnType<typeof createApi>,
  options: {
    provider?: "aws_s3" | "gcp_gcs" | "azure_blob" | "oci_object_storage";
    onOpenAdvancedPolicy?: (bucket: string) => void;
    onClose?: () => void;
    profileId?: string;
    apiToken?: string;
    bucket?: string;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const view = render(
    <QueryClientProvider client={client}>
      <BucketGovernanceModal
        api={api as never}
        apiToken={options.apiToken ?? "token"}
        profileId={options.profileId ?? "profile-1"}
        provider={options.provider ?? "aws_s3"}
        bucket={options.bucket ?? "demo-bucket"}
        onClose={options.onClose ?? vi.fn()}
        onOpenAdvancedPolicy={options.onOpenAdvancedPolicy}
      />
    </QueryClientProvider>,
  );

  return { client, ...view };
}

describe("BucketGovernanceModal", () => {
  it("renders AWS controls summary and updates public exposure", async () => {
    const api = createApi("aws_s3");

    renderModal(api);

    expect(
      await screen.findByText("Controls: demo-bucket"),
    ).toBeInTheDocument();
    const publicExposureSection = await screen.findByTestId(
      "bucket-governance-public-exposure",
    );
    fireEvent.click(
      within(publicExposureSection).getByRole("switch", {
        name: "Block public bucket policies",
      }),
    );
    fireEvent.click(
      within(publicExposureSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketPublicExposure).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          blockPublicAccess: {
            blockPublicAcls: true,
            ignorePublicAcls: true,
            blockPublicPolicy: false,
            restrictPublicBuckets: true,
          },
        },
      ),
    );
  }, SLOW_GOVERNANCE_TIMEOUT_MS);

  it("resets unsaved controls state when the profile context changes", async () => {
    const firstGovernance = createGovernance("aws_s3");
    const secondGovernance = {
      ...createGovernance("aws_s3"),
      access: {
        provider: "aws_s3" as const,
        bucket: "demo-bucket",
        objectOwnership: {
          supported: true,
          mode: "bucket_owner_enforced" as const,
        },
      },
      publicExposure: {
        provider: "aws_s3" as const,
        bucket: "demo-bucket",
        mode: "private" as const,
        blockPublicAccess: {
          blockPublicAcls: true,
          ignorePublicAcls: true,
          blockPublicPolicy: true,
          restrictPublicBuckets: true,
        },
      },
    };
    const api = createApi("aws_s3", {
      getBucketGovernance: vi
        .fn()
        .mockResolvedValueOnce(firstGovernance)
        .mockResolvedValueOnce(secondGovernance),
    });

    const view = renderModal(api, { provider: "aws_s3" });

    const publicExposureSection = await screen.findByTestId(
      "bucket-governance-public-exposure",
    );
    const blockPublicPolicySwitch = within(publicExposureSection).getByRole(
      "switch",
      {
        name: "Block public bucket policies",
      },
    );
    expect(blockPublicPolicySwitch).toHaveAttribute("aria-checked", "true");

    fireEvent.click(blockPublicPolicySwitch);
    expect(blockPublicPolicySwitch).toHaveAttribute("aria-checked", "false");

    view.rerender(
      <QueryClientProvider client={view.client}>
        <BucketGovernanceModal
          api={api as never}
          apiToken="token"
          profileId="profile-2"
          provider="aws_s3"
          bucket="demo-bucket"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(api.buckets.getBucketGovernance).toHaveBeenCalledWith(
        "profile-2",
        "demo-bucket",
      ),
    );

    await waitFor(() => {
      expect(
        within(
          screen.getByTestId("bucket-governance-public-exposure"),
        ).getByRole("switch", { name: "Block public bucket policies" }),
      ).toHaveAttribute("aria-checked", "true");
    });
  }, SLOW_GOVERNANCE_TIMEOUT_MS);

  it("updates encryption with sse_kms and kms key", async () => {
    const api = createApi("aws_s3");

    renderModal(api);

    expect(
      await screen.findByTestId("bucket-governance-encryption"),
    ).toBeInTheDocument();
    const encryptionSection = screen.getByTestId(
      "bucket-governance-encryption",
    );
    fireEvent.change(
      within(encryptionSection).getByRole("combobox", {
        name: "Encryption mode",
      }),
      {
        target: { value: "sse_kms" },
      },
    );
    fireEvent.change(
      await within(encryptionSection).findByRole("textbox", {
        name: /kms key id/i,
      }),
      {
        target: { value: "alias/demo-bucket" },
      },
    );
    fireEvent.click(
      within(encryptionSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketEncryption).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          mode: "sse_kms",
          kmsKeyId: "alias/demo-bucket",
        },
      ),
    );
  });

  it("updates lifecycle rules from JSON", async () => {
    const api = createApi("aws_s3");

    renderModal(api);

    const lifecycleSection = await screen.findByTestId(
      "bucket-governance-lifecycle",
    );
    fireEvent.change(
      within(lifecycleSection).getByRole("textbox", {
        name: /lifecycle rules json/i,
      }),
      {
        target: {
          value: JSON.stringify(
            [
              {
                id: "expire-logs",
                status: "Enabled",
                filter: { prefix: "logs/" },
                expiration: { days: 30 },
              },
            ],
            null,
            2,
          ),
        },
      },
    );
    fireEvent.click(
      within(lifecycleSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketLifecycle).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          rules: [
            {
              id: "expire-logs",
              status: "Enabled",
              filter: { prefix: "logs/" },
              expiration: { days: 30 },
            },
          ],
        },
      ),
    );
  });

  it.each([
    "aws_s3",
    "gcp_gcs",
    "azure_blob",
    "oci_object_storage",
  ] as const)(
    "blocks closing the %s controls modal while a save is pending",
    async (provider) => {
      const pendingSave = new Promise<void>(() => {});
      const api = createApi(provider, {
        putBucketPublicExposure: vi.fn().mockReturnValue(pendingSave),
      });
      const onClose = vi.fn();

      renderModal(api, { provider, onClose });

      const publicExposureSection = await screen.findByTestId(
        "bucket-governance-public-exposure",
      );
      fireEvent.click(
        within(publicExposureSection).getByRole("button", { name: "Save" }),
      );

      await waitFor(() =>
        expect(api.buckets.putBucketPublicExposure).toHaveBeenCalledTimes(1),
      );

      const closeButtons = screen.getAllByRole("button", {
        name: "Close",
      }) as HTMLButtonElement[];
      const footerCloseButton = closeButtons.find((button) => button.disabled);

      expect(footerCloseButton).toBeDefined();
      expect(footerCloseButton).toBeDisabled();
      closeButtons.forEach((button) => {
        fireEvent.click(button);
      });
      expect(onClose).not.toHaveBeenCalled();
    },
    SLOW_GOVERNANCE_TIMEOUT_MS,
  );

  it.each([
    "aws_s3",
    "gcp_gcs",
    "azure_blob",
    "oci_object_storage",
  ] as const)(
    "ignores stale %s public exposure responses after the modal context changes",
    async (provider) => {
      const pendingSave = deferred<void>();
      const api = createApi(provider, {
        putBucketPublicExposure: vi.fn().mockReturnValue(pendingSave.promise),
      });
      const { client, rerender } = renderModal(api, {
        provider,
        profileId: "profile-1",
        apiToken: "token-a",
      });
      const invalidateSpy = vi.spyOn(client, "invalidateQueries");

      const publicExposureSection = await screen.findByTestId(
        "bucket-governance-public-exposure",
      );
      fireEvent.click(
        within(publicExposureSection).getByRole("button", { name: "Save" }),
      );

      await waitFor(() =>
        expect(api.buckets.putBucketPublicExposure).toHaveBeenCalledTimes(1),
      );

      rerender(
        <QueryClientProvider client={client}>
          <BucketGovernanceModal
            api={api as never}
            apiToken="token-b"
            profileId="profile-2"
            provider={provider}
            bucket="demo-bucket"
            onClose={vi.fn()}
          />
        </QueryClientProvider>,
      );

      await waitFor(() =>
        expect(api.buckets.getBucketGovernance).toHaveBeenCalledWith(
          "profile-2",
          "demo-bucket",
        ),
      );

      await act(async () => {
        pendingSave.resolve(undefined);
        await Promise.resolve();
      });

      expect(message.success).not.toHaveBeenCalled();
      expect(message.error).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
    },
    SLOW_GOVERNANCE_TIMEOUT_MS,
  );

  it("opens advanced policy from the AWS controls surface", async () => {
    const api = createApi("aws_s3");
    const onOpenAdvancedPolicy = vi.fn();

    renderModal(api, { onOpenAdvancedPolicy });

    const advancedPolicySection = await screen.findByTestId(
      "bucket-governance-advanced-policy",
    );
    fireEvent.click(
      within(advancedPolicySection).getByRole("button", {
        name: "Open Policy",
      }),
    );

    expect(onOpenAdvancedPolicy).toHaveBeenCalledWith("demo-bucket");
  });

  it("renders GCS controls and updates bindings plus typed protection controls", async () => {
    const api = createApi("gcp_gcs");
    const { client } = renderModal(api, { provider: "gcp_gcs" });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    expect(await screen.findByText("GCS Controls")).toBeInTheDocument();

    const accessSection = await screen.findByTestId("bucket-governance-access");
    fireEvent.change(
      within(accessSection).getByRole("textbox", { name: /policy etag/i }),
      {
        target: { value: "etag-updated" },
      },
    );
    const gcsBindingCard = within(accessSection).getAllByTestId(
      "bucket-governance-gcs-binding-card",
    )[0];
    fireEvent.change(
      within(gcsBindingCard).getByRole("textbox", { name: "Role" }),
      {
        target: { value: "roles/storage.objectAdmin" },
      },
    );
    fireEvent.change(
      within(gcsBindingCard).getByRole("textbox", { name: "Members" }),
      {
        target: { value: "allUsers\nuser:ops@example.com" },
      },
    );
    fireEvent.click(
      within(gcsBindingCard).getByRole("switch", {
        name: "GCS binding condition 1",
      }),
    );
    fireEvent.change(
      within(gcsBindingCard).getByRole("textbox", {
        name: "Condition title",
      }),
      {
        target: { value: "Temporary access" },
      },
    );
    fireEvent.change(
      within(gcsBindingCard).getByRole("textbox", {
        name: "Condition expression",
      }),
      {
        target: {
          value: "request.time < timestamp('2026-12-31T00:00:00Z')",
        },
      },
    );
    fireEvent.click(
      within(accessSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketAccess).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          bindings: [
            {
              role: "roles/storage.objectAdmin",
              members: ["allUsers", "user:ops@example.com"],
              condition: {
                title: "Temporary access",
                expression:
                  "request.time < timestamp('2026-12-31T00:00:00Z')",
              },
            },
          ],
          etag: "etag-updated",
        },
      ),
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["bucketPolicy", "profile-1", "demo-bucket", "token"],
        exact: true,
      }),
    );

    const publicExposureSection = await screen.findByTestId(
      "bucket-governance-public-exposure",
    );
    fireEvent.change(
      within(publicExposureSection).getByRole("combobox", {
        name: "GCS public exposure mode",
      }),
      {
        target: { value: "public" },
      },
    );
    fireEvent.click(
      within(publicExposureSection).getByRole("switch", {
        name: "GCS public access prevention",
      }),
    );
    fireEvent.click(
      within(publicExposureSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketPublicExposure).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          mode: "public",
          publicAccessPrevention: true,
        },
      ),
    );

    const protectionSection = await screen.findByTestId(
      "bucket-governance-protection",
    );
    fireEvent.click(
      within(protectionSection).getByRole("switch", {
        name: "GCS uniform bucket-level access",
      }),
    );
    fireEvent.click(
      within(protectionSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketProtection).toHaveBeenNthCalledWith(
        1,
        "profile-1",
        "demo-bucket",
        {
          uniformAccess: false,
        },
      ),
    );

    const versioningSection = await screen.findByTestId(
      "bucket-governance-versioning",
    );
    fireEvent.change(
      within(versioningSection).getByRole("combobox", {
        name: "GCS versioning status",
      }),
      {
        target: { value: "disabled" },
      },
    );
    fireEvent.click(
      within(versioningSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketVersioning).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          status: "disabled",
        },
      ),
    );

    const retentionSection = await screen.findByTestId(
      "bucket-governance-retention",
    );
    fireEvent.change(
      within(retentionSection).getByRole("textbox", {
        name: /retention days/i,
      }),
      {
        target: { value: "90" },
      },
    );
    fireEvent.click(
      within(retentionSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketProtection).toHaveBeenNthCalledWith(
        2,
        "profile-1",
        "demo-bucket",
        {
          retention: {
            enabled: true,
            days: 90,
          },
        },
      ),
    );
  }, SLOW_GOVERNANCE_TIMEOUT_MS);

  it("renders Azure controls and updates visibility plus typed protection controls", async () => {
    const api = createApi("azure_blob");

    renderModal(api, { provider: "azure_blob" });

    expect(await screen.findByText("Azure Controls")).toBeInTheDocument();

    const publicExposureSection = await screen.findByTestId(
      "bucket-governance-public-exposure",
    );
    fireEvent.change(
      within(publicExposureSection).getByRole("combobox", {
        name: "Azure anonymous access visibility",
      }),
      {
        target: { value: "blob" },
      },
    );
    fireEvent.click(
      within(publicExposureSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketPublicExposure).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          mode: "blob",
          visibility: "blob",
        },
      ),
    );

    const accessSection = await screen.findByTestId("bucket-governance-access");
    const azurePolicyCard = within(accessSection).getAllByTestId(
      "bucket-governance-azure-stored-access-policy-card",
    )[0];
    fireEvent.change(
      within(azurePolicyCard).getByRole("textbox", { name: "Identifier" }),
      {
        target: { value: "upload" },
      },
    );
    fireEvent.change(
      within(azurePolicyCard).getByRole("textbox", {
        name: "Start (RFC3339)",
      }),
      {
        target: { value: "2026-03-10T00:00:00Z" },
      },
    );
    fireEvent.change(
      within(azurePolicyCard).getByRole("textbox", {
        name: "Expiry (RFC3339)",
      }),
      {
        target: { value: "2026-03-20T00:00:00Z" },
      },
    );
    fireEvent.click(within(azurePolicyCard).getByLabelText("Write"));
    fireEvent.click(within(azurePolicyCard).getByLabelText("Delete"));
    fireEvent.click(
      within(accessSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketAccess).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          storedAccessPolicies: [
            {
              id: "upload",
              start: "2026-03-10T00:00:00Z",
              expiry: "2026-03-20T00:00:00Z",
              permission: "rwdl",
            },
          ],
        },
      ),
    );

    const versioningSection = await screen.findByTestId(
      "bucket-governance-versioning",
    );
    fireEvent.change(
      within(versioningSection).getByRole("combobox", {
        name: "Azure versioning status",
      }),
      {
        target: { value: "enabled" },
      },
    );
    fireEvent.click(
      within(versioningSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketVersioning).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          status: "enabled",
        },
      ),
    );

    const protectionSection = await screen.findByTestId(
      "bucket-governance-protection",
    );
    expect(
      within(protectionSection).getByText("Container immutability"),
    ).toBeInTheDocument();
    fireEvent.change(
      within(protectionSection).getAllByRole("textbox", {
        name: /retention days/i,
      })[0],
      {
        target: { value: "14" },
      },
    );
    fireEvent.click(
      within(protectionSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketProtection).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          softDelete: {
            enabled: true,
            days: 14,
          },
          immutability: {
            enabled: true,
            days: 30,
            mode: "unlocked",
            etag: undefined,
            allowProtectedAppendWrites: false,
            allowProtectedAppendWritesAll: false,
          },
        },
      ),
    );
  }, SLOW_GOVERNANCE_TIMEOUT_MS);

  it("renders OCI controls and updates visibility, versioning, retention rules, and PAR sharing", async () => {
    const api = createApi("oci_object_storage");

    renderModal(api, { provider: "oci_object_storage" });

    expect(await screen.findByText("OCI Controls")).toBeInTheDocument();

    const publicExposureSection = await screen.findByTestId(
      "bucket-governance-public-exposure",
    );
    fireEvent.change(
      within(publicExposureSection).getByRole("combobox", {
        name: "OCI visibility",
      }),
      {
        target: { value: "object_read_without_list" },
      },
    );
    fireEvent.click(
      within(publicExposureSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketPublicExposure).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          visibility: "object_read_without_list",
        },
      ),
    );

    const versioningSection = await screen.findByTestId(
      "bucket-governance-versioning",
    );
    fireEvent.change(
      within(versioningSection).getByRole("combobox", {
        name: "OCI versioning status",
      }),
      {
        target: { value: "enabled" },
      },
    );
    fireEvent.click(
      within(versioningSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketVersioning).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          status: "enabled",
        },
      ),
    );

    const protectionSection = await screen.findByTestId(
      "bucket-governance-protection",
    );
    fireEvent.change(
      within(protectionSection).getByRole("textbox", {
        name: /retention days/i,
      }),
      {
        target: { value: "60" },
      },
    );
    fireEvent.click(
      within(protectionSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketProtection).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          retention: {
            enabled: true,
            rules: [
              {
                id: "rule-1",
                displayName: "Retention Rule 1",
                days: 60,
                locked: false,
              },
            ],
          },
        },
      ),
    );

    const sharingSection = await screen.findByTestId(
      "bucket-governance-sharing",
    );
    fireEvent.click(
      within(sharingSection).getByRole("button", { name: "Add PAR" }),
    );
    const nameInputs = within(sharingSection).getAllByRole("textbox", {
      name: "Name",
    });
    fireEvent.change(nameInputs[nameInputs.length - 1], {
      target: { value: "Upload link" },
    });
    fireEvent.change(
      within(sharingSection).getAllByRole("textbox", {
        name: "Expires at (RFC3339)",
      })[1],
      {
        target: { value: "2026-05-01T00:00:00Z" },
      },
    );
    fireEvent.click(
      within(sharingSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketSharing).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          preauthenticatedRequests: [
            {
              id: "par-1",
              name: "Read demo",
              accessType: "AnyObjectRead",
              bucketListingAction: "Deny",
              timeExpires: "2026-04-10T00:00:00Z",
            },
            {
              name: "Upload link",
              accessType: "AnyObjectRead",
              bucketListingAction: "Deny",
              timeExpires: "2026-05-01T00:00:00Z",
            },
          ],
        },
      ),
    );
  }, SLOW_GOVERNANCE_TIMEOUT_MS);

  it("ignores stale OCI sharing responses after the modal context changes", async () => {
    const pendingSharing = deferred<{
      provider: "oci_object_storage";
      bucket: string;
      preauthenticatedSupport: true;
      preauthenticatedRequests: Array<{
        id: string;
        name: string;
        accessType: string;
        bucketListingAction: string;
        objectName: string;
        timeCreated: string;
        timeExpires: string;
        accessUri: string;
      }>;
    }>();
    const api = createApi("oci_object_storage", {
      putBucketSharing: vi.fn().mockReturnValue(pendingSharing.promise),
    });
    const { client, rerender } = renderModal(api, {
      provider: "oci_object_storage",
      profileId: "profile-1",
      apiToken: "token-a",
    });

    const sharingSection = await screen.findByTestId(
      "bucket-governance-sharing",
    );
    fireEvent.click(
      within(sharingSection).getByRole("button", { name: "Save" }),
    );

    await waitFor(() =>
      expect(api.buckets.putBucketSharing).toHaveBeenCalledTimes(1),
    );

    rerender(
      <QueryClientProvider client={client}>
        <BucketGovernanceModal
          api={api as never}
          apiToken="token-b"
          profileId="profile-2"
          provider="oci_object_storage"
          bucket="demo-bucket"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(api.buckets.getBucketGovernance).toHaveBeenCalledWith(
        "profile-2",
        "demo-bucket",
      ),
    );

    await act(async () => {
      pendingSharing.resolve({
        provider: "oci_object_storage",
        bucket: "demo-bucket",
        preauthenticatedSupport: true,
        preauthenticatedRequests: [
          {
            id: "par-new",
            name: "New PAR",
            accessType: "AnyObjectRead",
            bucketListingAction: "Deny",
            objectName: "",
            timeCreated: "2026-03-10T00:00:00Z",
            timeExpires: "2026-05-01T00:00:00Z",
            accessUri: "https://example.com/par-new",
          },
        ],
      });
      await Promise.resolve();
    });

    expect(message.success).not.toHaveBeenCalled();
    expect(screen.queryByText("Created PAR: New PAR")).not.toBeInTheDocument();
    expect(screen.queryByText("https://example.com/par-new")).not.toBeInTheDocument();
  }, SLOW_GOVERNANCE_TIMEOUT_MS);
});
