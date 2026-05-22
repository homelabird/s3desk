import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { APIError } from "../../api/client";
import { TransfersContext } from "../../components/useTransfers";
import * as uploadUtils from "../../components/transfers/transfersUploadUtils";
import { failedToLoadBucketsTitle, goToBucketsLabel, noBucketsAvailableHint } from "../../lib/actionHints";
import * as deviceFs from "../../lib/deviceFs";
import { ensureDomShims } from "../../test/domShims";
import { transfersStub } from "../../test/transfersStub";
import { UploadsPage, UploadsPageLoadingFallback } from "../UploadsPage";
import { UploadsPageExperience } from "../uploads/UploadsPageExperience";

const uploadsPageApiMock = vi.hoisted(() => ({
  current: null as null | {
    server: unknown;
    profiles: unknown;
    buckets: unknown;
  },
}));

vi.mock("../../api/useAPIClient", async () => {
  const { APIClient } =
    await vi.importActual<typeof import("../../api/client")>(
      "../../api/client",
    );
  return {
    useAPIClient: () =>
      uploadsPageApiMock.current ?? new APIClient({ apiToken: "test-token" }),
  };
});

beforeAll(() => {
  ensureDomShims();
});

afterEach(() => {
  window.localStorage.clear();
  uploadsPageApiMock.current = null;
  vi.restoreAllMocks();
});

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function mockUploadsPageBase(args?: {
  buckets?: Array<{ name: string; createdAt?: string }>;
  bucketsError?: unknown;
  meta?: unknown;
  profile?: {
    id: string;
    name: string;
    provider:
      | "aws_s3"
      | "s3_compatible"
      | "gcp_gcs"
      | "azure_blob"
      | "oci_object_storage";
    endpoint?: string;
    region?: string;
    forcePathStyle?: boolean;
  };
}) {
  const profile = args?.profile ?? {
    id: "profile-1",
    name: "Primary Profile",
    provider: "s3_compatible" as const,
    endpoint: "http://127.0.0.1:9000",
    region: "us-east-1",
    forcePathStyle: false,
  };

  const meta =
    args?.meta ??
    ({
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
    } as never);
  const profiles = [
    {
      ...profile,
      preserveLeadingSlash: false,
      tlsInsecureSkipVerify: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
  ];
  const buckets = args?.buckets ?? [
    { name: "primary-bucket", createdAt: "2024-01-01T00:00:00Z" },
  ];
  const getMeta = async () => meta;
  const listProfiles = async () => profiles;
  const listBuckets = async () => {
    if (args?.bucketsError) throw args.bucketsError;
    return buckets;
  };

  uploadsPageApiMock.current = {
    server: { getMeta },
    profiles: { listProfiles },
    buckets: { listBuckets },
  };

  return { getMeta, listProfiles, listBuckets };
}

function renderUploadsPage(
  props?: {
    apiToken?: string;
    profileId?: string | null;
  },
  transfersOverride?: Partial<typeof transfersStub>,
) {
  const transfersValue = { ...transfersStub, ...transfersOverride };
  const apiToken =
    props && "apiToken" in props ? (props.apiToken ?? "") : "token";
  const profileId =
    props && "profileId" in props ? (props.profileId ?? null) : "profile-1";
  const pageElement = profileId ? (
    <UploadsPageExperience apiToken={apiToken} profileId={profileId} />
  ) : (
    <UploadsPage apiToken={apiToken} profileId={profileId} />
  );

  render(
    <QueryClientProvider client={createClient()}>
      <TransfersContext.Provider value={transfersValue}>
        <MemoryRouter initialEntries={["/uploads"]}>
          <Routes>
            <Route
              path="/uploads"
              element={pageElement}
            />
            <Route path="/profiles" element={<div>Profiles Route</div>} />
            <Route path="/buckets" element={<div>Buckets Route</div>} />
          </Routes>
        </MemoryRouter>
      </TransfersContext.Provider>
    </QueryClientProvider>,
  );

  return transfersValue;
}

describe("UploadsPage", () => {
  it("renders a non-empty loading status while the upload workspace chunk loads", () => {
    render(<UploadsPageLoadingFallback />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading uploads...");
  });

  it("navigates to profiles from the setup callout", () => {
    renderUploadsPage({ apiToken: "", profileId: null });

    expect(
      screen.getByText("Select a profile to upload files"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Setup" }));
    expect(screen.getByText("Profiles Route")).toBeInTheDocument();
  });

  it("shows the empty-bucket state and links to the buckets page", async () => {
    mockUploadsPageBase({ buckets: [] });

    renderUploadsPage();

    expect(await screen.findByText(noBucketsAvailableHint(), {}, { timeout: 5000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: goToBucketsLabel() }));
    expect(screen.getByText("Buckets Route")).toBeInTheDocument();
  });

  it("shows the bucket lookup error without the empty-bucket state", async () => {
    mockUploadsPageBase({
      bucketsError: new APIError({
        status: 400,
        code: "transfer_engine_missing",
        message: "rclone is required to list buckets",
      }),
    });

    renderUploadsPage();

    expect(await screen.findByText(failedToLoadBucketsTitle())).toBeInTheDocument();
    expect(screen.queryByText(noBucketsAvailableHint())).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Target & source" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Bucket")).toBeInTheDocument();
  });

  it("queues selected files and clears the staged selection", async () => {
    const files = [new File(["hello"], "demo.txt", { type: "text/plain" })];
    const queueUploadFiles = vi.fn();
    mockUploadsPageBase();
    vi.spyOn(deviceFs, "getDirectorySelectionSupport").mockReturnValue({
      ok: true,
    });
    vi.spyOn(uploadUtils, "promptForFiles").mockResolvedValue(files);

    renderUploadsPage(undefined, { queueUploadFiles });

    await waitFor(() =>
      expect(screen.getByLabelText("Bucket")).not.toBeDisabled(),
    );
    fireEvent.change(screen.getByLabelText("Bucket"), {
      target: { value: "primary-bucket" },
    });
    fireEvent.change(screen.getByLabelText("Upload prefix (optional)"), {
      target: { value: "photos/2024" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add from device/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Choose files/i }),
    );

    expect(await screen.findByText("demo.txt")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Queue upload (1)" }),
      ).not.toBeDisabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Queue upload (1)" }));

    await waitFor(() => {
      expect(queueUploadFiles).toHaveBeenCalledWith({
        profileId: "profile-1",
        bucket: "primary-bucket",
        prefix: "photos/2024",
        files,
      });
    });
    expect(
      screen.getByText("No files or folders selected."),
    ).toBeInTheDocument();
  });

  it("reads bucket and prefix from the active profile scope", async () => {
    mockUploadsPageBase({
      profile: {
        id: "profile-1",
        name: "Primary Profile",
        provider: "s3_compatible",
        endpoint: "http://127.0.0.1:9000",
        region: "us-east-1",
        forcePathStyle: false,
      },
    });
    window.localStorage.setItem(
      "uploads:profile-1:bucket",
      JSON.stringify("alpha-bucket"),
    );
    window.localStorage.setItem(
      "uploads:profile-1:prefix",
      JSON.stringify("alpha/"),
    );
    window.localStorage.setItem(
      "uploads:profile-2:bucket",
      JSON.stringify("beta-bucket"),
    );
    window.localStorage.setItem(
      "uploads:profile-2:prefix",
      JSON.stringify("beta/"),
    );

    const transfersValue = { ...transfersStub };
    const client = createClient();
    const view = render(
      <QueryClientProvider client={client}>
        <TransfersContext.Provider value={transfersValue}>
          <MemoryRouter initialEntries={["/uploads"]}>
            <Routes>
              <Route
                path="/uploads"
                element={
                  <UploadsPageExperience apiToken="token" profileId="profile-1" />
                }
              />
            </Routes>
          </MemoryRouter>
        </TransfersContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Bucket")).toHaveValue("alpha-bucket"),
    );
    expect(screen.getByLabelText("Upload prefix (optional)")).toHaveValue(
      "alpha/",
    );

    view.rerender(
      <QueryClientProvider client={client}>
        <TransfersContext.Provider value={transfersValue}>
          <MemoryRouter initialEntries={["/uploads"]}>
            <Routes>
              <Route
                path="/uploads"
                element={
                  <UploadsPageExperience apiToken="token" profileId="profile-2" />
                }
              />
            </Routes>
          </MemoryRouter>
        </TransfersContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Bucket")).toHaveValue("beta-bucket"),
    );
    expect(screen.getByLabelText("Upload prefix (optional)")).toHaveValue(
      "beta/",
    );
  });

  it("shows the provider-disabled state and disables upload actions", async () => {
    mockUploadsPageBase({
      meta: {
      version: "test",
      serverAddr: "127.0.0.1:8080",
      dataDir: "/data",
      staticDir: "/app/ui",
      apiTokenEnabled: true,
      encryptionEnabled: false,
      capabilities: {
        profileTls: { enabled: false, reason: "test" },
        providers: {
          s3_compatible: {
            bucketCrud: true,
            objectCrud: false,
            jobTransfer: false,
            bucketPolicy: true,
            gcsIamPolicy: false,
            azureContainerAccessPolicy: false,
            presignedUpload: true,
            presignedMultipartUpload: true,
            directUpload: false,
            reasons: {
              objectCrud: "Uploads are disabled by backend policy.",
              jobTransfer: "Transfer jobs are disabled by backend policy.",
            },
          },
        },
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
      } as never,
    });

    renderUploadsPage();

    expect(
      await screen.findByText("Uploads are not available for this provider"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Uploads are disabled by backend policy."),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /^Queue upload/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add from device/i }),
    ).toBeDisabled();
  });
});
