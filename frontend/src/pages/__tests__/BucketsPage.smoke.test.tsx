import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { message } from "antd";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { APIClient, APIError } from "../../api/client";
import { ensureDomShims } from "../../test/domShims";
import { BucketsPage } from "../BucketsPage";

vi.mock("../../api/useAPIClient", async () => {
  const { APIClient } = await import("../../api/client");
  return {
    useAPIClient: () => new APIClient({ apiToken: "test-token" }),
  };
});

const confirmDangerActionMock = vi.fn(
  (options: { onConfirm: () => Promise<void> | void }) => options.onConfirm(),
);

vi.mock("../../lib/confirmDangerAction", () => ({
  confirmDangerAction: (options: { onConfirm: () => Promise<void> | void }) =>
    confirmDangerActionMock(options),
}));

beforeAll(() => {
  ensureDomShims();
});

const SLOW_BUCKETS_TIMEOUT_MS = 15_000;

const originalMatchMedia = window.matchMedia;
const defaultMeta = {
  version: "test",
  serverAddr: "127.0.0.1:8080",
  dataDir: "/data",
  staticDir: "/app/ui",
  apiTokenEnabled: true,
  encryptionEnabled: false,
  capabilities: {
    profileTls: { enabled: false, reason: "test" },
    providers: {},
  },
  allowedLocalDirs: [],
  jobConcurrency: 1,
  uploadSessionTTLSeconds: 3600,
  uploadDirectStream: false,
  transferEngine: {
    name: "rclone",
    available: true,
    compatible: true,
    minVersion: "1.52.0",
    path: "/usr/bin/rclone",
    version: "v1.66.0",
  },
};
const defaultProfiles = [
  {
    id: "profile-1",
    name: "Primary Profile",
    provider: "s3_compatible",
    endpoint: "http://127.0.0.1:9000",
    region: "us-east-1",
    forcePathStyle: false,
    preserveLeadingSlash: false,
    tlsInsecureSkipVerify: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];
const defaultBuckets = [
  { name: "primary-bucket", createdAt: "2024-01-01T00:00:00Z" },
];

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mockServerApi(meta = defaultMeta) {
  const serverApi = {
    getMeta: vi.fn().mockResolvedValue(meta as never),
  };
  vi.spyOn(APIClient.prototype, "server", "get").mockReturnValue(
    serverApi as never,
  );
  return serverApi;
}

function mockProfilesApi(profiles = defaultProfiles as never) {
  const profilesApi = {
    listProfiles: vi.fn().mockResolvedValue(profiles),
  };
  vi.spyOn(APIClient.prototype, "profiles", "get").mockReturnValue(
    profilesApi as never,
  );
  return profilesApi;
}

function mockBucketsApi(
  overrides: Partial<{
    listBuckets: ReturnType<typeof vi.fn>;
    getBucketGovernance: ReturnType<typeof vi.fn>;
    getBucketPolicy: ReturnType<typeof vi.fn>;
    createBucket: ReturnType<typeof vi.fn>;
    deleteBucket: ReturnType<typeof vi.fn>;
  }> = {},
) {
  const bucketsApi = {
    listBuckets: vi.fn().mockResolvedValue(defaultBuckets as never),
    getBucketGovernance: vi.fn(),
    getBucketPolicy: vi.fn(),
    createBucket: vi.fn(),
    deleteBucket: vi.fn(),
    ...overrides,
  };
  vi.spyOn(APIClient.prototype, "buckets", "get").mockReturnValue(
    bucketsApi as never,
  );
  return bucketsApi;
}

function mockViewportWidth(width: number) {
  window.matchMedia = vi
    .fn()
    .mockImplementation((query: string): MediaQueryList => {
      const minMatch = query.match(/\(min-width:\s*(\d+)px\)/);
      const maxMatch = query.match(/\(max-width:\s*(\d+)px\)/);
      let matches = true;
      if (minMatch) matches &&= width >= Number(minMatch[1]);
      if (maxMatch) matches &&= width <= Number(maxMatch[1]);
      return {
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    });
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.matchMedia = originalMatchMedia;
  confirmDangerActionMock.mockClear();
  vi.restoreAllMocks();
});

function RouterStateProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="router-pathname">{location.pathname}</div>
      <div data-testid="router-state">
        {JSON.stringify(location.state ?? null)}
      </div>
    </>
  );
}

describe("BucketsPage", () => {
  it("navigates to setup from setup callout", () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="" profileId={null} />}
            />
            <Route path="/profiles" element={<div>Profiles Route</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      screen.getByText("Select a profile to view buckets"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Setup" }));
    expect(screen.getByText("Profiles Route")).toBeInTheDocument();
  });

  it("disables bucket operations for gcs profiles missing project number", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockServerApi({
      ...defaultMeta,
      capabilities: {
        ...defaultMeta.capabilities,
        providers: {
          gcp_gcs: {
            bucketCrud: true,
            objectCrud: true,
            jobTransfer: true,
            bucketPolicy: false,
            gcsIamPolicy: true,
            azureContainerAccessPolicy: false,
            presignedUpload: false,
            presignedMultipartUpload: false,
            directUpload: false,
            reasons: {},
          },
        },
      },
    });
    mockProfilesApi([
      {
        id: "profile-1",
        name: "GCS Profile",
        provider: "gcp_gcs",
        anonymous: false,
        preserveLeadingSlash: false,
        tlsInsecureSkipVerify: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ] as never);
    const bucketsApi = mockBucketsApi({
      listBuckets: vi.fn().mockResolvedValue([] as never),
    });
    const { listBuckets } = bucketsApi;

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Bucket operations unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Bucket" })).toBeDisabled();
    await waitFor(() => expect(listBuckets).not.toHaveBeenCalled());
  });

  it("renders compact bucket cards on tablet widths", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockViewportWidth(820);
    mockServerApi();
    mockProfilesApi();
    mockBucketsApi();

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByTestId("buckets-list-compact"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("buckets-table-desktop"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Policy/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete/ })).toBeInTheDocument();
  });

  it("renders the full bucket table on desktop widths", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockViewportWidth(1200);
    mockServerApi();
    mockProfilesApi();
    mockBucketsApi();

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByTestId("buckets-table-desktop"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("buckets-list-compact"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("primary-bucket")).toBeInTheDocument();
  });

  it(
    "shows controls for aws buckets and opens the controls modal",
    async () => {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
        },
      });

      mockViewportWidth(1200);
      mockServerApi();
      mockProfilesApi([
        {
          id: "profile-1",
          name: "AWS Profile",
          provider: "aws_s3",
          region: "ap-northeast-2",
          preserveLeadingSlash: false,
          tlsInsecureSkipVerify: false,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ] as never);
      const bucketsApi = mockBucketsApi({
        getBucketGovernance: vi.fn().mockResolvedValue({
          provider: "aws_s3",
          bucket: "primary-bucket",
          capabilities: {},
          publicExposure: {
            provider: "aws_s3",
            bucket: "primary-bucket",
            mode: "private",
            blockPublicAccess: {
              blockPublicAcls: true,
              ignorePublicAcls: true,
              blockPublicPolicy: true,
              restrictPublicBuckets: true,
            },
          },
          access: {
            provider: "aws_s3",
            bucket: "primary-bucket",
            objectOwnership: { supported: true, mode: "bucket_owner_enforced" },
          },
          versioning: {
            provider: "aws_s3",
            bucket: "primary-bucket",
            status: "enabled",
          },
          encryption: {
            provider: "aws_s3",
            bucket: "primary-bucket",
            mode: "sse_s3",
          },
          lifecycle: {
            provider: "aws_s3",
            bucket: "primary-bucket",
            rules: [],
          },
          advanced: {
            rawPolicySupported: true,
            rawPolicyEditable: true,
          },
        } as never),
        getBucketPolicy: vi.fn().mockResolvedValue({
          bucket: "primary-bucket",
          exists: false,
          policy: null,
        } as never),
      });
      const { getBucketGovernance, getBucketPolicy } = bucketsApi;

      render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={["/buckets"]}>
            <Routes>
              <Route
                path="/buckets"
                element={<BucketsPage apiToken="token" profileId="profile-1" />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const controlsButton = (
        await within(
          await screen.findByTestId("buckets-table-desktop"),
        ).findAllByRole("button", { name: /controls/i })
      )[0];
      await act(async () => {
        fireEvent.click(controlsButton);
      });

      expect(await screen.findByText("AWS Controls")).toBeInTheDocument();
      await waitFor(() =>
        expect(getBucketGovernance).toHaveBeenCalledWith(
          "profile-1",
          "primary-bucket",
        ),
      );

      const advancedPolicySection = await screen.findByTestId(
        "bucket-governance-advanced-policy",
      );
      await act(async () => {
        fireEvent.click(
          within(advancedPolicySection).getByRole("button", {
            name: "Open Policy",
          }),
        );
      });
      await waitFor(() =>
        expect(getBucketPolicy).toHaveBeenCalledWith(
          "profile-1",
          "primary-bucket",
        ),
      );
      expect(
        await screen.findByTestId("bucket-policy-desktop-shell"),
      ).toBeInTheDocument();
    },
    SLOW_BUCKETS_TIMEOUT_MS,
  );

  it("shows controls for gcs buckets and opens the provider-aware controls modal", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockViewportWidth(1200);
    mockServerApi();
    mockProfilesApi([
      {
        id: "profile-1",
        name: "GCS Profile",
        provider: "gcp_gcs",
        projectNumber: "1234567890",
        preserveLeadingSlash: false,
        tlsInsecureSkipVerify: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ] as never);
    const bucketsApi = mockBucketsApi({
      getBucketGovernance: vi.fn().mockResolvedValue({
        provider: "gcp_gcs",
        bucket: "primary-bucket",
        capabilities: {
          bucket_access_bindings: { enabled: true },
          bucket_access_public_toggle: { enabled: true },
        },
        publicExposure: {
          provider: "gcp_gcs",
          bucket: "primary-bucket",
          mode: "private",
        },
        access: {
          provider: "gcp_gcs",
          bucket: "primary-bucket",
          etag: "BwWWja0YfJA=",
          bindings: [],
        },
      } as never),
    });
    const { getBucketGovernance } = bucketsApi;

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const controlsButton = (
      await within(
        await screen.findByTestId("buckets-table-desktop"),
      ).findAllByRole("button", { name: /controls/i })
    )[0];
    fireEvent.click(controlsButton);

    expect(await screen.findByText("GCS Controls")).toBeInTheDocument();
    await waitFor(() =>
      expect(getBucketGovernance).toHaveBeenCalledWith(
        "profile-1",
        "primary-bucket",
      ),
    );
  });

  it("warns and closes the create modal when bucket defaults fail after creation", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockViewportWidth(1200);
    mockServerApi();
    mockProfilesApi([
      {
        id: "profile-1",
        name: "AWS Profile",
        provider: "aws_s3",
        region: "ap-northeast-2",
        preserveLeadingSlash: false,
        tlsInsecureSkipVerify: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ] as never);
    const bucketsApi = mockBucketsApi({
      listBuckets: vi.fn().mockResolvedValue([] as never),
      createBucket: vi.fn().mockRejectedValue(
        new APIError({
          status: 403,
          code: "bucket_defaults_apply_failed",
          message: "bucket was created but failed to apply secure defaults",
          normalizedError: { code: "access_denied", retryable: false },
          details: {
            bucketCreated: true,
            bucket: "media-prod",
            applySection: "encryption",
          },
        }),
      ),
    });
    const { createBucket } = bucketsApi;
    const warningSpy = vi
      .spyOn(message, "warning")
      .mockImplementation(() => undefined as never);

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "New Bucket" }));
    fireEvent.change(
      await screen.findByRole("textbox", { name: /bucket name/i }),
      { target: { value: "media-prod" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createBucket).toHaveBeenCalled());
    await waitFor(() =>
      expect(warningSpy).toHaveBeenCalledWith(
        "Bucket created, but secure defaults failed while applying encryption.",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("ignores stale delete confirmations after the profile changes", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockViewportWidth(1200);
    mockServerApi();
    mockProfilesApi([
      ...defaultProfiles,
      {
        id: "profile-2",
        name: "Secondary Profile",
        provider: "s3_compatible",
        endpoint: "http://127.0.0.1:9001",
        region: "us-west-2",
        forcePathStyle: false,
        preserveLeadingSlash: false,
        tlsInsecureSkipVerify: false,
        createdAt: "2024-01-02T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      },
    ] as never);
    const deleteBucket = vi.fn().mockResolvedValue(undefined);
    mockBucketsApi({
      deleteBucket,
    });

    let pendingConfirm: { onConfirm: () => Promise<void> | void } | undefined;
    confirmDangerActionMock.mockImplementationOnce((options) => {
      pendingConfirm = options;
      return undefined;
    });

    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const deleteButton = (
      await within(
        await screen.findByTestId("buckets-table-desktop"),
      ).findAllByRole("button", { name: /delete/i })
    )[0];
    fireEvent.click(deleteButton);

    expect(pendingConfirm).toBeDefined();
    expect(deleteBucket).not.toHaveBeenCalled();

    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-2" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await act(async () => {
      await pendingConfirm?.onConfirm();
    });

    expect(deleteBucket).not.toHaveBeenCalled();
  });

  it("ignores stale create responses after the profile changes", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    mockViewportWidth(1200);
    mockServerApi();
    mockProfilesApi([
      ...defaultProfiles,
      {
        id: "profile-2",
        name: "Secondary Profile",
        provider: "aws_s3",
        region: "ap-northeast-2",
        preserveLeadingSlash: false,
        tlsInsecureSkipVerify: false,
        createdAt: "2024-01-02T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      },
    ] as never);
    const createBucketRequest = deferred<void>();
    const createBucket = vi.fn().mockReturnValue(createBucketRequest.promise);
    mockBucketsApi({
      listBuckets: vi.fn().mockResolvedValue([] as never),
      createBucket,
    });
    const successSpy = vi
      .spyOn(message, "success")
      .mockImplementation(() => undefined as never);

    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "New Bucket" }));
    fireEvent.change(
      await screen.findByRole("textbox", { name: /bucket name/i }),
      { target: { value: "stale-create-bucket" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createBucket).toHaveBeenCalledTimes(1));

    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-2" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await act(async () => {
      createBucketRequest.resolve();
      await Promise.resolve();
    });

    expect(successSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["buckets", "profile-1", "token"],
      exact: true,
    });
  });

  it("routes to Objects with bucket context when deleting a non-empty bucket", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockViewportWidth(1200);
    mockServerApi();
    mockProfilesApi();
    mockBucketsApi({
      deleteBucket: vi.fn().mockRejectedValue(
        new APIError({
          status: 409,
          code: "bucket_not_empty",
          message: "bucket contains objects",
        }),
      ),
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <RouterStateProbe />
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-1" />}
            />
            <Route path="/objects" element={<div>Objects Route</div>} />
            <Route path="/jobs" element={<div>Jobs Route</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const deleteButton = (
      await within(
        await screen.findByTestId("buckets-table-desktop"),
      ).findAllByRole("button", { name: /delete/i })
    )[0];
    fireEvent.click(deleteButton);

    expect(confirmDangerActionMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Bucket "primary-bucket" isn’t empty'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Objects" }));

    await waitFor(() =>
      expect(screen.getByTestId("router-pathname")).toHaveTextContent(
        "/objects",
      ),
    );
    expect(screen.getByText("Objects Route")).toBeInTheDocument();
    expect(screen.getByTestId("router-state").textContent).toBe(
      JSON.stringify({
        openBucket: true,
        bucket: "primary-bucket",
        prefix: "",
      }),
    );
  });

  it("routes to Jobs with delete-all state when deleting a non-empty bucket", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockViewportWidth(1200);
    mockServerApi();
    mockProfilesApi();
    mockBucketsApi({
      deleteBucket: vi.fn().mockRejectedValue(
        new APIError({
          status: 409,
          code: "bucket_not_empty",
          message: "bucket contains objects",
        }),
      ),
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <RouterStateProbe />
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token" profileId="profile-1" />}
            />
            <Route path="/objects" element={<div>Objects Route</div>} />
            <Route path="/jobs" element={<div>Jobs Route</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const deleteButton = (
      await within(
        await screen.findByTestId("buckets-table-desktop"),
      ).findAllByRole("button", { name: /delete/i })
    )[0];
    fireEvent.click(deleteButton);

    expect(
      await screen.findByText('Bucket "primary-bucket" isn’t empty'),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Delete all objects (job)" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("router-pathname")).toHaveTextContent("/jobs"),
    );
    expect(screen.getByText("Jobs Route")).toBeInTheDocument();
    expect(screen.getByTestId("router-state").textContent).toBe(
      JSON.stringify({
        openDeleteJob: true,
        bucket: "primary-bucket",
        deleteAll: true,
      }),
    );
  });

  it("hides the non-empty bucket dialog when the api token changes", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockViewportWidth(1200);
    mockServerApi();
    mockProfilesApi();
    mockBucketsApi({
      deleteBucket: vi.fn().mockRejectedValue(
        new APIError({
          status: 409,
          code: "bucket_not_empty",
          message: "bucket contains objects",
        }),
      ),
    });

    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <RouterStateProbe />
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token-a" profileId="profile-1" />}
            />
            <Route path="/objects" element={<div>Objects Route</div>} />
            <Route path="/jobs" element={<div>Jobs Route</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const deleteButton = (
      await within(
        await screen.findByTestId("buckets-table-desktop"),
      ).findAllByRole("button", { name: /delete/i })
    )[0];
    fireEvent.click(deleteButton);

    expect(
      await screen.findByText('Bucket "primary-bucket" isn’t empty'),
    ).toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/buckets"]}>
          <RouterStateProbe />
          <Routes>
            <Route
              path="/buckets"
              element={<BucketsPage apiToken="token-b" profileId="profile-1" />}
            />
            <Route path="/objects" element={<div>Objects Route</div>} />
            <Route path="/jobs" element={<div>Jobs Route</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        screen.queryByText('Bucket "primary-bucket" isn’t empty'),
      ).not.toBeInTheDocument(),
    );
  });
});
