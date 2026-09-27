import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
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

import { APIError } from "../../../api/errors";
import { queryKeys } from "../../../api/queryKeys";
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
            legalHold: false,
            legalHoldTags: [],
            legalHoldEditable: true,
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
  it("aborts the governance request when the modal closes", async () => {
    const getBucketGovernance = vi.fn(
      (_profileId: string, _bucket: string, signal?: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const api = createApi("aws_s3", { getBucketGovernance });
    const view = renderModal(api);

    await waitFor(() => expect(getBucketGovernance).toHaveBeenCalledOnce());
    const signal = getBucketGovernance.mock.calls[0]?.[2];

    view.rerender(
      <QueryClientProvider client={view.client}>
        <BucketGovernanceModal
          api={api as never}
          apiToken="token"
          profileId="profile-1"
          provider="aws_s3"
          bucket={null}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(true);
  });

  it("renders AWS controls summary and updates public exposure", async () => {
    const api = createApi("aws_s3");

    renderModal(api);

    expect(
      await screen.findByText("Controls: demo-bucket"),
    ).toBeInTheDocument();
    const decisionHeader = await screen.findByTestId(
      "bucket-governance-decision-header",
    );
    expect(
      within(decisionHeader).getByText("Recommended: Typed controls"),
    ).toBeInTheDocument();
    expect(
      within(decisionHeader).getByText("Policy editor: Raw policy"),
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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

  it("reports accepted but unverified changes when governance readback fails", async () => {
    const api = createApi("aws_s3", {
      getBucketGovernance: vi.fn().mockResolvedValueOnce(createGovernance("aws_s3"))
        .mockResolvedValueOnce(createGovernance("aws_s3"))
        .mockRejectedValue(new Error("read unavailable")),
    });
    renderModal(api, { provider: "aws_s3" });
    const section = await screen.findByTestId("bucket-governance-public-exposure");
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
    await waitFor(() => expect(message.error).toHaveBeenCalled());
    expect(JSON.stringify(vi.mocked(message.error).mock.calls)).toContain("Change request accepted, but current settings could not be read");
    expect(api.buckets.putBucketPublicExposure).toHaveBeenCalledTimes(1);
    expect(message.success).not.toHaveBeenCalled();
  });

  it("rejects stale governance before writing and retains the edited draft", async () => {
    const loaded = createGovernance("aws_s3");
    const changed = { ...loaded, encryption: { ...loaded.encryption, mode: "sse_kms", kmsKeyId: "changed-key" } };
    const api = createApi("aws_s3", {
      getBucketGovernance: vi.fn().mockResolvedValueOnce(loaded).mockResolvedValue(changed),
    });
    renderModal(api);
    const section = await screen.findByTestId("bucket-governance-public-exposure");
    const toggle = within(section).getByRole("switch", { name: "Block public bucket policies" });
    fireEvent.click(toggle);
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(expect.stringContaining("settings changed since")));
    expect(api.buckets.putBucketPublicExposure).not.toHaveBeenCalled();
    expect(toggle).not.toBeChecked();
    expect(api.buckets.getBucketGovernance).toHaveBeenCalledTimes(2);
    expect(message.success).not.toHaveBeenCalled();
  });

  it("does not write when the current settings cannot be checked", async () => {
    const api = createApi("aws_s3", {
      getBucketGovernance: vi.fn().mockResolvedValueOnce(createGovernance("aws_s3")).mockRejectedValue(new Error("read denied")),
    });
    renderModal(api);
    const section = await screen.findByTestId("bucket-governance-public-exposure");
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(expect.stringContaining("read denied")));
    expect(api.buckets.putBucketPublicExposure).not.toHaveBeenCalled();
    expect(api.buckets.getBucketGovernance).toHaveBeenCalledTimes(2);
  });

  it("does not write after controls close during the preflight read", async () => {
    const loaded = createGovernance("aws_s3");
    const pending = deferred<typeof loaded>();
    const api = createApi("aws_s3", {
      getBucketGovernance: vi.fn().mockResolvedValueOnce(loaded).mockImplementationOnce(() => pending.promise),
    });
    const view = renderModal(api);
    const section = await screen.findByTestId("bucket-governance-public-exposure");
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
    await waitFor(() => expect(api.buckets.getBucketGovernance).toHaveBeenCalledTimes(2));
    view.unmount();
    await act(async () => { pending.resolve(loaded); await pending.promise; });
    expect(api.buckets.putBucketPublicExposure).not.toHaveBeenCalled();
  });

  it("shows the exact target and proposed fields and cancels without saving", async () => {
    const api = createApi("aws_s3");
    renderModal(api);
    const section = await screen.findByTestId("bucket-governance-public-exposure");
    fireEvent.click(within(section).getByRole("switch", { name: "Block public bucket policies" }));
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog", { name: "Review bucket changes" });
    expect(within(dialog).getByText(/Profile: profile-1/)).toBeInTheDocument();
    expect(within(dialog).getByText("demo-bucket")).toBeInTheDocument();
    expect(within(dialog).getByText("Proposed")).toBeInTheDocument();
    expect(dialog.textContent).toContain('"blockPublicPolicy": false');
    expect(api.buckets.putBucketPublicExposure).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review bucket changes" })).not.toBeInTheDocument());
    expect(api.buckets.getBucketGovernance).toHaveBeenCalledTimes(1);
    expect(api.buckets.putBucketPublicExposure).not.toHaveBeenCalled();
    expect(message.error).not.toHaveBeenCalled();
  });

  it("submits the reviewed snapshot even if the underlying draft changes", async () => {
    const api = createApi("aws_s3");
    renderModal(api);
    const section = await screen.findByTestId("bucket-governance-public-exposure");
    const toggle = within(section).getByRole("switch", { name: "Block public bucket policies" });
    fireEvent.click(toggle);
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    const apply = await screen.findByRole("button", { name: "Apply changes" });
    fireEvent.click(toggle);
    fireEvent.click(apply);
    await waitFor(() => expect(api.buckets.putBucketPublicExposure).toHaveBeenCalledWith(
      "profile-1", "demo-bucket", expect.objectContaining({ blockPublicAccess: expect.objectContaining({ blockPublicPolicy: false }) }),
    ));
  });

  it.each([true, false])("shows ACL effects before setting GCS uniform access to %s", async (enabled) => {
    const api = createApi("gcp_gcs");
    renderModal(api, { provider: "gcp_gcs" });
    const section = await screen.findByTestId("bucket-governance-protection");
    if (!enabled) fireEvent.click(within(section).getByRole("switch", { name: "GCS uniform bucket-level access" }));
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog", { name: "Review bucket changes" });
    expect(within(dialog).getByText(enabled ? /revokes access granted only by object ACLs/ : /restores saved object ACLs/)).toBeInTheDocument();
    expect(api.buckets.putBucketProtection).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  });

  it("shows the account scope before approving Azure versioning", async () => {
    const api = createApi("azure_blob");
    renderModal(api, { provider: "azure_blob" });
    const section = await screen.findByTestId("bucket-governance-versioning");
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog", { name: "Review bucket changes" });
    expect(within(dialog).getByText(/Account scope:.*other containers/)).toBeInTheDocument();
    expect(api.buckets.putBucketVersioning).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  });

  it("requires an explicit ownership choice when AWS controls are unconfigured", async () => {
    const governance = createGovernance("aws_s3");
    const api = createApi("aws_s3", {
      getBucketGovernance: vi.fn().mockResolvedValue({ ...governance, access: {
        provider: "aws_s3", bucket: "demo-bucket", warnings: ["Ownership controls are not configured."],
      } }),
    });
    renderModal(api, { provider: "aws_s3" });
    const section = await screen.findByTestId("bucket-governance-access");
    const select = within(section).getByRole("combobox", { name: "Ownership mode" });
    const save = within(section).getByRole("button", { name: "Save" });
    expect(select).toHaveValue("");
    expect(save).toBeDisabled();
    expect(api.buckets.putBucketAccess).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: "bucket_owner_preferred" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
    await waitFor(() => expect(api.buckets.putBucketAccess).toHaveBeenCalledWith(
      "profile-1", "demo-bucket", { objectOwnership: "bucket_owner_preferred" },
    ));
  });

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
        expect.any(AbortSignal),
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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

  it("keeps unconfirmed lifecycle deletion as an error and refreshes without retry", async () => {
    const base = createGovernance("aws_s3");
    const governance = { ...base, lifecycle: { provider: "aws_s3", bucket: "demo-bucket",
      rules: [{ id: "existing", status: "enabled", expiration: { days: 30 } }] } };
    const errorMessage = "Lifecycle deletion was accepted but current state did not confirm removal; reload before retrying";
    const api = createApi("aws_s3", {
      getBucketGovernance: vi.fn().mockResolvedValue(governance),
      putBucketLifecycle: vi.fn().mockRejectedValue(new APIError({
        status: 502, code: "bucket_lifecycle_unconfirmed", message: errorMessage,
      })),
    });
    renderModal(api);
    const section = await screen.findByTestId("bucket-governance-lifecycle");
    fireEvent.change(within(section).getByRole("textbox", { name: /lifecycle rules json/i }), { target: { value: "[]" } });
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage)));
    await waitFor(() => expect(api.buckets.getBucketGovernance).toHaveBeenCalledTimes(3));
    expect(api.buckets.putBucketLifecycle).toHaveBeenCalledExactlyOnceWith("profile-1", "demo-bucket", { rules: [] });
    expect(message.success).not.toHaveBeenCalled();
    expect(screen.getByTestId("bucket-governance-lifecycle")).toBeInTheDocument();
  });

  it("updates lifecycle rules from JSON", async () => {
    const api = createApi("aws_s3");

    renderModal(api);

    const lifecycleSection = await screen.findByTestId(
      "bucket-governance-lifecycle",
    );
    const lifecycleEditor = within(lifecycleSection).getByRole("textbox", {
      name: /lifecycle rules json/i,
    });
    fireEvent.change(
      lifecycleEditor,
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
      within(lifecycleSection).getByRole("button", {
        name: /add 7-day cleanup rule/i,
      }),
    );
    expect(JSON.parse((lifecycleEditor as HTMLTextAreaElement).value)).toEqual([
      {
        id: "expire-logs",
        status: "Enabled",
        filter: { prefix: "logs/" },
        expiration: { days: 30 },
      },
      {
        id: "s3desk-abort-incomplete-uploads-7d",
        status: "Enabled",
        abortIncompleteMultipartUpload: { daysAfterInitiation: 7 },
      },
    ]);
    fireEvent.click(
      within(lifecycleSection).getByRole("button", { name: "Save" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
            {
              id: "s3desk-abort-incomplete-uploads-7d",
              status: "Enabled",
              abortIncompleteMultipartUpload: { daysAfterInitiation: 7 },
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
    "refreshes the original %s cache without updating the new modal after saving",
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
          expect.any(AbortSignal),
        ),
      );

      await act(async () => {
        pendingSave.resolve(undefined);
        await Promise.resolve();
      });

      expect(message.success).not.toHaveBeenCalled();
      expect(message.error).not.toHaveBeenCalled();
      const expectedKeys: QueryKey[] = [
        queryKeys.buckets.governance("profile-1", "demo-bucket", "token-a"),
      ];
      if (provider === "gcp_gcs" || provider === "azure_blob") {
        expectedKeys.push(queryKeys.buckets.policy("profile-1", "demo-bucket", "token-a"));
      }
      await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(expectedKeys.length));
      expect(invalidateSpy.mock.calls.map(([filters]) => filters)).toEqual(
        expectedKeys.map((queryKey) => ({ queryKey, exact: true })),
      );
    },
    SLOW_GOVERNANCE_TIMEOUT_MS,
  );

  it("reloads actual retention state after a partially applied OCI save fails", async () => {
    const rules = [
      { id: "rule-1", displayName: "Retention Rule 1", days: 45, locked: false },
      { id: "rule-2", displayName: "Retention Rule 2", days: 45, locked: false },
    ];
    const governance = {
      ...createGovernance("oci_object_storage"),
      protection: { provider: "oci_object_storage", bucket: "demo-bucket", retention: { enabled: true, rules } },
    };
    const refreshed = {
      ...governance,
      protection: {
        provider: "oci_object_storage", bucket: "demo-bucket",
        retention: { enabled: true, rules: [{ ...rules[0], days: 60 }, rules[1]] },
      },
    };
    const api = createApi("oci_object_storage", {
      getBucketGovernance: vi.fn().mockResolvedValueOnce(governance).mockResolvedValueOnce(governance).mockResolvedValue(refreshed),
      putBucketProtection: vi.fn().mockRejectedValue(new Error("second retention update failed")),
    });
    renderModal(api, { provider: "oci_object_storage" });
    const section = await screen.findByTestId("bucket-governance-protection");
    const days = within(section).getAllByRole("textbox", { name: /retention days/i });
    fireEvent.change(days[0], { target: { value: "60" } });
    fireEvent.change(days[1], { target: { value: "90" } });
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
    await waitFor(() => expect(api.buckets.putBucketProtection).toHaveBeenCalledOnce());
    await waitFor(() => expect(within(screen.getByTestId("bucket-governance-protection"))
      .getAllByRole("textbox", { name: /retention days/i })[1]).toHaveValue("45"));
    expect(within(screen.getByTestId("bucket-governance-protection"))
      .getAllByRole("textbox", { name: /retention days/i })[0]).toHaveValue("60");
    expect(message.error).toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
  });

  it("blocks GCS access save when the loaded ETag is cleared", async () => {
    const api = createApi("gcp_gcs");
    renderModal(api, { provider: "gcp_gcs" });
    const section = await screen.findByTestId("bucket-governance-access");
    fireEvent.change(within(section).getByRole("textbox", { name: "Policy ETag" }), { target: { value: "  " } });
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(expect.stringContaining("require the loaded policy ETag")));
    expect(api.buckets.putBucketAccess).not.toHaveBeenCalled();
    expect(message.success).not.toHaveBeenCalled();
  });

  it("reports partial GCS exposure changes and reloads without retrying", async () => {
    const governance = createGovernance("gcp_gcs");
    const refreshed = {
      ...governance,
      publicExposure: { ...governance.publicExposure, mode: "public", publicAccessPrevention: false },
    };
    const errorMessage = "GCS accepted the IAM policy update but public access prevention could not be confirmed; reload both settings before retrying";
    const api = createApi("gcp_gcs", {
      getBucketGovernance: vi.fn().mockResolvedValueOnce(governance).mockResolvedValueOnce(governance).mockResolvedValue(refreshed),
      putBucketPublicExposure: vi.fn().mockRejectedValue(new APIError({
        status: 502, code: "bucket_public_exposure_partial", message: errorMessage,
        details: { iamPolicyUpdateAccepted: true, publicAccessPreventionState: "unknown" },
      })),
    });
    renderModal(api, { provider: "gcp_gcs" });
    const section = await screen.findByTestId("bucket-governance-public-exposure");
    fireEvent.change(within(section).getByRole("combobox", { name: "GCS public exposure mode" }), { target: { value: "public" } });
    fireEvent.click(within(section).getByRole("switch", { name: "GCS public access prevention" }));
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(expect.stringContaining(errorMessage)));
    await waitFor(() => expect(api.buckets.getBucketGovernance).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(within(screen.getByTestId("bucket-governance-public-exposure"))
      .getByRole("switch", { name: "GCS public access prevention" })).not.toBeChecked());
    expect(within(screen.getByTestId("bucket-governance-public-exposure"))
      .getByRole("combobox", { name: "GCS public exposure mode" })).toHaveValue("public");
    expect(api.buckets.putBucketPublicExposure).toHaveBeenCalledOnce();
    expect(message.success).not.toHaveBeenCalled();
  });

  it("retries a failed controls load in the open dialog", async () => {
    const api = createApi("aws_s3", {
      getBucketGovernance: vi.fn().mockRejectedValueOnce(new Error("controls service unavailable"))
        .mockResolvedValue(createGovernance("aws_s3")),
    });
    const onClose = vi.fn();
    renderModal(api, { onClose });
    await screen.findByText("Failed to load controls");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading controls" }));
    await screen.findByTestId("bucket-governance-public-exposure");
    expect(api.buckets.getBucketGovernance).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps edited controls during a background read failure and retry", async () => {
    const loaded = createGovernance("aws_s3");
    const api = createApi("aws_s3", { getBucketGovernance: vi.fn().mockResolvedValueOnce(loaded)
      .mockRejectedValueOnce(new Error("refresh unavailable")).mockResolvedValue(loaded) });
    const { client } = renderModal(api);
    const toggle = await screen.findByRole("switch", { name: "Block public bucket policies" });
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.buckets.governance("profile-1", "demo-bucket", "token") }); });
    await screen.findByText(/refresh unavailable/);
    expect(screen.getByRole("switch", { name: "Block public bucket policies" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading controls" }));
    await waitFor(() => expect(api.buckets.getBucketGovernance).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByText("Could not refresh controls")).not.toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Block public bucket policies" })).not.toBeChecked();
  });

  it("opens the policy editor from the AWS controls surface", async () => {
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
        queryKey: queryKeys.buckets.policy("profile-1", "demo-bucket", "token"),
        exact: true,
      }, { throwOnError: true }),
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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

  it("does not show disabled as the versioning state when Azure ARM is unavailable", async () => {
    const base = createGovernance("azure_blob");
    const governance = { ...base, versioning: undefined, capabilities: {
      ...base.capabilities, bucket_versioning: { enabled: false, reason: "Azure versioning requires ARM profile configuration" },
    } };
    const api = createApi("azure_blob", { getBucketGovernance: vi.fn().mockResolvedValue(governance) });
    renderModal(api, { provider: "azure_blob" });
    const section = await screen.findByTestId("bucket-governance-versioning");
    expect(within(section).getByText("Versioning unavailable")).toBeInTheDocument();
    expect(within(section).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Versioning: unavailable")).toBeInTheDocument();
    expect(api.buckets.putBucketVersioning).not.toHaveBeenCalled();
  });

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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
        name: "Start (ISO 8601)",
      }),
      {
        target: { value: "2026-03-10" },
      },
    );
    fireEvent.change(
      within(azurePolicyCard).getByRole("textbox", {
        name: "Expiry (ISO 8601)",
      }),
      {
        target: { value: "2026-03-20T00:00Z" },
      },
    );
    fireEvent.click(within(azurePolicyCard).getByLabelText("Write"));
    fireEvent.click(within(azurePolicyCard).getByLabelText("Delete"));
    fireEvent.click(
      within(accessSection).getByRole("button", { name: "Save" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

    await waitFor(() =>
      expect(api.buckets.putBucketAccess).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          storedAccessPolicies: [
            {
              id: "upload",
              start: "2026-03-10",
              expiry: "2026-03-20T00:00Z",
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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

    const legalHoldSection = await screen.findByTestId(
      "bucket-governance-legal-hold",
    );
    fireEvent.change(
      within(legalHoldSection).getByRole("textbox", {
        name: "Azure legal hold tags",
      }),
      { target: { value: "case123, retention9" } },
    );
    fireEvent.click(
      within(legalHoldSection).getByRole("button", { name: "Save" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

    await waitFor(() =>
      expect(api.buckets.putBucketProtection).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        { legalHoldTags: ["case123", "retention9"] },
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
        target: { value: "suspended" },
      },
    );
    fireEvent.click(
      within(versioningSection).getByRole("button", { name: "Save" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

    await waitFor(() =>
      expect(api.buckets.putBucketVersioning).toHaveBeenCalledWith(
        "profile-1",
        "demo-bucket",
        {
          status: "suspended",
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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

  it("keeps newly created OCI sharing links available after the refreshed inventory arrives", async () => {
    const created = {
      id: "par-new",
      name: "New PAR",
      accessType: "AnyObjectRead",
      bucketListingAction: "Deny",
      objectName: "",
      timeCreated: "2026-03-10T00:00:00Z",
      timeExpires: "2026-10-01T00:00:00Z",
      accessUri: "https://example.com/new-test-par",
    };
    const governance = createGovernance("oci_object_storage");
    const refreshed = {
      ...governance,
      sharing: {
        ...governance.sharing,
        preauthenticatedRequests: [{ ...created, accessUri: undefined }],
      },
    };
    const api = createApi("oci_object_storage", {
      getBucketGovernance: vi.fn()
        .mockResolvedValueOnce(governance)
        .mockResolvedValueOnce(governance)
        .mockResolvedValue(refreshed),
      putBucketSharing: vi.fn().mockResolvedValue({
        ...refreshed.sharing,
        preauthenticatedRequests: [created],
      }),
    });
    const { client, rerender } = renderModal(api, { provider: "oci_object_storage" });
    const section = await screen.findByTestId("bucket-governance-sharing");
    fireEvent.click(within(section).getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
    await waitFor(() => expect(client.getQueryData(
      queryKeys.buckets.governance("profile-1", "demo-bucket", "token"),
    )).toEqual(refreshed));
    await waitFor(() => expect(screen.getByDisplayValue("New PAR")).toBeDisabled());
    expect(screen.getByText(created.accessUri)).toBeInTheDocument();

    vi.mocked(api.buckets.putBucketSharing).mockResolvedValueOnce({
      ...refreshed.sharing, provider: "oci_object_storage", bucket: "demo-bucket",
    });
    fireEvent.click(within(screen.getByTestId("bucket-governance-sharing")).getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));
    await waitFor(() => expect(api.buckets.putBucketSharing).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(message.success).toHaveBeenCalledTimes(2));
    expect(screen.getByText(created.accessUri)).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={client}>
        <BucketGovernanceModal api={api} apiToken="token" profileId="profile-2"
          provider="oci_object_storage" bucket="demo-bucket" onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByTestId("bucket-governance-sharing");
    expect(screen.queryByText(created.accessUri)).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: "Apply changes" }));

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
        expect.any(AbortSignal),
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
