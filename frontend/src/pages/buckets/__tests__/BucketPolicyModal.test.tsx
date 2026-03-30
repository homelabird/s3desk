import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { message } from "antd";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { APIError } from "../../../api/client";
import { ensureDomShims } from "../../../test/domShims";
import { createMockApiClient } from "../../../test/mockApiClient";
import { BucketPolicyModal } from "../BucketPolicyModal";

const confirmDangerActionMock = vi.fn();
const originalGetComputedStyle = window.getComputedStyle;
const originalMatchMedia = window.matchMedia;
const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  "scrollHeight",
);

vi.mock("../../../lib/confirmDangerAction", () => ({
  confirmDangerAction: (options: {
    onConfirm: () => Promise<void> | void;
  }) => confirmDangerActionMock(options),
}));

beforeAll(() => {
  ensureDomShims();
  window.getComputedStyle = ((element: Element, pseudoElt?: string) => {
    const style = originalGetComputedStyle(
      element,
      pseudoElt ? undefined : pseudoElt,
    );
    const fallbackValues: Record<string, string> = {
      lineHeight: "20px",
      paddingTop: "0px",
      paddingBottom: "0px",
      paddingLeft: "0px",
      paddingRight: "0px",
      fontSize: "14px",
      borderTopWidth: "0px",
      borderBottomWidth: "0px",
    };
    const fallbackProps: Record<string, string> = {
      "line-height": "20px",
      "padding-top": "0px",
      "padding-bottom": "0px",
      "padding-left": "0px",
      "padding-right": "0px",
      "font-size": "14px",
      "border-top-width": "0px",
      "border-bottom-width": "0px",
    };
    return new Proxy(style, {
      get(target, prop, receiver) {
        if (prop === "getPropertyValue") {
          return (name: string) => {
            const value = target.getPropertyValue(name);
            if (value) return value;
            return fallbackProps[name] ?? "";
          };
        }
        if (typeof prop === "string") {
          const value = Reflect.get(target, prop, receiver);
          if (typeof value === "string" && value) return value;
          if (prop in fallbackValues) return fallbackValues[prop];
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }) as typeof window.getComputedStyle;
  Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => 24,
  });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  confirmDangerActionMock.mockReset();
  vi.restoreAllMocks();
});

afterAll(() => {
  window.getComputedStyle = originalGetComputedStyle;
  if (scrollHeightDescriptor) {
    Object.defineProperty(
      HTMLTextAreaElement.prototype,
      "scrollHeight",
      scrollHeightDescriptor,
    );
  } else {
    delete (HTMLTextAreaElement.prototype as { scrollHeight?: number })
      .scrollHeight;
  }
});

function createApi(overrides: Record<string, unknown> = {}) {
  return createMockApiClient({
    buckets: {
      getBucketPolicy: vi
        .fn()
        .mockResolvedValue({ bucket: "demo-bucket", exists: true, policy: {} }),
      validateBucketPolicy: vi.fn(),
      putBucketPolicy: vi.fn(),
      deleteBucketPolicy: vi.fn(),
      ...overrides,
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

function renderModal(
  api: ReturnType<typeof createApi>,
  options: {
    provider?: "aws_s3" | "gcp_gcs" | "azure_blob";
    onOpenControls?: (bucket: string) => void;
    onClose?: () => void;
    profileId?: string;
    apiToken?: string;
    bucket?: string | null;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const view = render(
    <QueryClientProvider client={client}>
      <BucketPolicyModal
        api={api as never}
        apiToken={options.apiToken ?? "token"}
        profileId={options.profileId ?? "profile-1"}
        provider={options.provider ?? "aws_s3"}
        bucket={options.bucket === undefined ? "demo-bucket" : options.bucket}
        onClose={options.onClose ?? vi.fn()}
        onOpenControls={options.onOpenControls}
      />
    </QueryClientProvider>,
  );

  return { client, ...view };
}

describe("BucketPolicyModal", () => {
  it("renders the desktop modal shell by default", async () => {
    mockViewportWidth(1280);
    const api = createApi();

    renderModal(api);

    expect(
      await screen.findByTestId("bucket-policy-desktop-shell"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("bucket-policy-mobile-shell"),
    ).not.toBeInTheDocument();
  });

  it("renders GCS bindings as mobile cards on narrow screens", async () => {
    mockViewportWidth(390);
    const api = createApi({
      getBucketPolicy: vi.fn().mockResolvedValue({
        bucket: "demo-bucket",
        exists: true,
        policy: {
          version: 3,
          etag: "etag-123",
          bindings: [
            {
              role: "roles/storage.objectViewer",
              members: ["allUsers"],
            },
          ],
        },
      }),
    });

    renderModal(api, { provider: "gcp_gcs" });

    expect(
      await screen.findByTestId("bucket-policy-mobile-shell"),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("bucket-policy-gcs-mobile-bindings"),
    ).toBeInTheDocument();
    expect(screen.getByText("Binding 1")).toBeInTheDocument();
  });

  it("renders Azure stored access policies as mobile cards on narrow screens", async () => {
    mockViewportWidth(390);
    const api = createApi({
      getBucketPolicy: vi.fn().mockResolvedValue({
        bucket: "demo-bucket",
        exists: true,
        policy: {
          publicAccess: "blob",
          storedAccessPolicies: [
            {
              id: "reader",
              start: "2024-01-01T00:00:00Z",
              expiry: "2024-02-01T00:00:00Z",
              permission: "rl",
            },
          ],
        },
      }),
    });

    renderModal(api, { provider: "azure_blob" });

    expect(
      await screen.findByTestId("bucket-policy-mobile-shell"),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("bucket-policy-azure-mobile-policies"),
    ).toBeInTheDocument();
    expect(screen.getByText("Stored access policy 1")).toBeInTheDocument();
  });

  it("shows validation warning details for ok=false provider responses", async () => {
    mockViewportWidth(1280);
    const api = createApi({
      validateBucketPolicy: vi.fn().mockResolvedValue({
        ok: false,
        provider: "aws_s3",
        errors: ["Missing Principal"],
        warnings: ["Statement will be ignored"],
      }),
    });
    const warningSpy = vi
      .spyOn(message, "warning")
      .mockImplementation(() => undefined as never);

    renderModal(api);

    const validateButton = await screen.findByRole("button", {
      name: "Validate with provider",
    });
    await act(async () => {
      fireEvent.click(validateButton);
    });

    await waitFor(() => expect(api.buckets.validateBucketPolicy).toHaveBeenCalled());
    await waitFor(() => {
      expect(warningSpy).toHaveBeenCalledWith(
        "Validation found issues (1 error(s) · 1 warning(s) · Missing Principal)",
        8,
      );
    });
  });

  it("shows unavailable validation errors for API failures", async () => {
    mockViewportWidth(1280);
    const api = createApi({
      validateBucketPolicy: vi.fn().mockRejectedValue(
        new APIError({
          status: 400,
          code: "transfer_engine_missing",
          message:
            "rclone is required to validate bucket policies (install it or set RCLONE_PATH)",
        }),
      ),
    });
    const errorSpy = vi
      .spyOn(message, "error")
      .mockImplementation(() => undefined as never);

    renderModal(api);

    const validateButton = await screen.findByRole("button", {
      name: "Validate with provider",
    });
    await act(async () => {
      fireEvent.click(validateButton);
    });

    await waitFor(() => expect(api.buckets.validateBucketPolicy).toHaveBeenCalled());
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Policy validation unavailable: transfer_engine_missing: rclone is required to validate bucket policies (install it or set RCLONE_PATH) · Recommended action: Transfer engine (rclone) not found. Install rclone or set RCLONE_PATH on the server.",
        8,
      );
    });
    expect(
      await screen.findByText(/Policy validation unavailable:/),
    ).toBeInTheDocument();
  });

  it("shows an AWS controls shortcut and opens the controls surface", async () => {
    mockViewportWidth(1280);
    const api = createApi();
    const onOpenControls = vi.fn();

    renderModal(api, { provider: "aws_s3", onOpenControls });

    const shortcut = await screen.findByTestId(
      "bucket-policy-controls-shortcut",
    );
    expect(shortcut).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Controls" }));

    expect(onOpenControls).toHaveBeenCalledWith("demo-bucket");
  });

  it("shows a GCS controls shortcut and invalidates governance after save", async () => {
    mockViewportWidth(1280);
    const api = createApi({
      getBucketPolicy: vi.fn().mockResolvedValue({
        bucket: "demo-bucket",
        exists: true,
        policy: {
          version: 1,
          etag: "etag-123",
          bindings: [],
        },
      }),
      putBucketPolicy: vi.fn().mockResolvedValue(undefined),
    });
    const onOpenControls = vi.fn();

    const { client } = renderModal(api, {
      provider: "gcp_gcs",
      onOpenControls,
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const shortcut = await screen.findByTestId(
      "bucket-policy-controls-shortcut",
    );
    expect(shortcut).toBeInTheDocument();
    expect(
      await screen.findByText(/prefer controls for routine gcs exposure changes/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Controls" }));
    expect(onOpenControls).toHaveBeenCalledWith("demo-bucket");

    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Public read access" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.buckets.putBucketPolicy).toHaveBeenCalled());
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["bucketGovernance", "profile-1", "demo-bucket", "token"],
        exact: true,
      }),
    );
  });

  it("shows an Azure controls shortcut", async () => {
    mockViewportWidth(1280);
    const api = createApi({
      getBucketPolicy: vi.fn().mockResolvedValue({
        bucket: "demo-bucket",
        exists: true,
        policy: {
          publicAccess: "private",
          storedAccessPolicies: [],
        },
      }),
    });
    const onOpenControls = vi.fn();

    renderModal(api, { provider: "azure_blob", onOpenControls });

    const shortcut = await screen.findByTestId(
      "bucket-policy-controls-shortcut",
    );
    expect(shortcut).toBeInTheDocument();
    expect(
      await screen.findByText(/prefer controls for routine azure access changes/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Controls" }));
    expect(onOpenControls).toHaveBeenCalledWith("demo-bucket");
  });

  it("resets unsaved policy edits when the profile context changes", async () => {
    mockViewportWidth(1280);
    const api = createApi({
      getBucketPolicy: vi
        .fn()
        .mockResolvedValueOnce({
          bucket: "demo-bucket",
          exists: true,
          policy: {
            Version: "2012-10-17",
            Statement: [{ Sid: "ProfileOne" }],
          },
        })
        .mockResolvedValueOnce({
          bucket: "demo-bucket",
          exists: true,
          policy: {
            Version: "2012-10-17",
            Statement: [{ Sid: "ProfileTwo" }],
          },
        }),
    });

    const view = renderModal(api);

    const editor = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    expect(editor.value).toContain("ProfileOne");

    fireEvent.change(editor, {
      target: {
        value: JSON.stringify(
          {
            Version: "2012-10-17",
            Statement: [{ Sid: "EditedDraft" }],
          },
          null,
          2,
        ),
      },
    });
    expect(editor.value).toContain("EditedDraft");

    view.rerender(
      <QueryClientProvider client={view.client}>
        <BucketPolicyModal
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
      expect(api.buckets.getBucketPolicy).toHaveBeenCalledWith(
        "profile-2",
        "demo-bucket",
      ),
    );
    await waitFor(() => {
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain(
        "ProfileTwo",
      );
    });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).not.toContain(
      "EditedDraft",
    );
  });

  it("ignores stale save responses after closing and reopening the modal", async () => {
    mockViewportWidth(1280);
    const putRequest = deferred<void>();
    const api = createApi({
      putBucketPolicy: vi.fn().mockReturnValue(putRequest.promise),
    });
    const firstOnClose = vi.fn();
    const secondOnClose = vi.fn();
    const successSpy = vi
      .spyOn(message, "success")
      .mockImplementation(() => undefined as never);

    const view = renderModal(api, { onClose: firstOnClose });

    const editor = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: {
        value: JSON.stringify(
          {
            Version: "2012-10-17",
            Statement: [{ Sid: "SaveStale" }],
          },
          null,
          2,
        ),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.buckets.putBucketPolicy).toHaveBeenCalled());

    view.rerender(
      <QueryClientProvider client={view.client}>
        <BucketPolicyModal
          api={api as never}
          apiToken="token"
          profileId="profile-1"
          provider="aws_s3"
          bucket={null}
          onClose={firstOnClose}
        />
      </QueryClientProvider>,
    );

    view.rerender(
      <QueryClientProvider client={view.client}>
        <BucketPolicyModal
          api={api as never}
          apiToken="token"
          profileId="profile-1"
          provider="aws_s3"
          bucket="demo-bucket"
          onClose={secondOnClose}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      putRequest.resolve();
      await Promise.resolve();
    });

    expect(firstOnClose).not.toHaveBeenCalled();
    expect(secondOnClose).not.toHaveBeenCalled();
    expect(successSpy).not.toHaveBeenCalled();
  });

  it("ignores stale delete confirmations after closing and reopening the modal", async () => {
    mockViewportWidth(1280);
    const api = createApi({
      deleteBucketPolicy: vi.fn().mockResolvedValue(undefined),
    });
    const firstOnClose = vi.fn();
    const secondOnClose = vi.fn();

    const view = renderModal(api, { onClose: firstOnClose });

    fireEvent.click(await screen.findByRole("button", { name: "Delete policy" }));

    const confirmCall = confirmDangerActionMock.mock.calls.at(-1)?.[0] as
      | { onConfirm: () => Promise<void> | void }
      | undefined;
    expect(confirmCall).toBeDefined();

    view.rerender(
      <QueryClientProvider client={view.client}>
        <BucketPolicyModal
          api={api as never}
          apiToken="token"
          profileId="profile-1"
          provider="aws_s3"
          bucket={null}
          onClose={firstOnClose}
        />
      </QueryClientProvider>,
    );

    view.rerender(
      <QueryClientProvider client={view.client}>
        <BucketPolicyModal
          api={api as never}
          apiToken="token"
          profileId="profile-1"
          provider="aws_s3"
          bucket="demo-bucket"
          onClose={secondOnClose}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      await confirmCall?.onConfirm();
    });

    expect(api.buckets.deleteBucketPolicy).not.toHaveBeenCalled();
    expect(firstOnClose).not.toHaveBeenCalled();
    expect(secondOnClose).not.toHaveBeenCalled();
  });

  it("ignores stale validation responses after closing and reopening the modal", async () => {
    mockViewportWidth(1280);
    const validateRequest = deferred<{
      ok: boolean;
      provider: string;
      errors: string[];
      warnings: string[];
    }>();
    const api = createApi({
      validateBucketPolicy: vi.fn().mockReturnValue(validateRequest.promise),
    });
    const warningSpy = vi
      .spyOn(message, "warning")
      .mockImplementation(() => undefined as never);
    const successSpy = vi
      .spyOn(message, "success")
      .mockImplementation(() => undefined as never);

    const view = renderModal(api);

    const validateButton = await screen.findByRole("button", {
      name: "Validate with provider",
    });
    await act(async () => {
      fireEvent.click(validateButton);
    });

    await waitFor(() => expect(api.buckets.validateBucketPolicy).toHaveBeenCalled());

    view.rerender(
      <QueryClientProvider client={view.client}>
        <BucketPolicyModal
          api={api as never}
          apiToken="token"
          profileId="profile-1"
          provider="aws_s3"
          bucket={null}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    view.rerender(
      <QueryClientProvider client={view.client}>
        <BucketPolicyModal
          api={api as never}
          apiToken="token"
          profileId="profile-1"
          provider="aws_s3"
          bucket="demo-bucket"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await act(async () => {
      validateRequest.resolve({
        ok: false,
        provider: "aws_s3",
        errors: ["Stale validation"],
        warnings: [],
      });
      await Promise.resolve();
    });

    expect(warningSpy).not.toHaveBeenCalled();
    expect(successSpy).not.toHaveBeenCalled();
  });
});
