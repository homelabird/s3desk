import { message } from "antd";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OCISharingCreatedRequests } from "./OCISharingCreatedRequests";

const clipboard = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  clipboardFailureHint: vi.fn(() => "Copy failed."),
}));

vi.mock("../../../lib/clipboard", () => clipboard);

describe("OCISharingCreatedRequests", () => {
  beforeEach(() => {
    clipboard.copyToClipboard.mockResolvedValue({ ok: true, method: "clipboard" });
  });

  it("copies the URL returned when a PAR is created", async () => {
    const success = vi
      .spyOn(message, "success")
      .mockImplementation(() => undefined as never);
    const accessUri = "https://objectstorage.example/par-token";

    render(
      <OCISharingCreatedRequests
        requests={[{
          id: "par-1",
          name: "Read link",
          accessType: "AnyObjectRead",
          bucketListingAction: "Deny",
          objectName: "",
          timeCreated: "2026-08-12T00:00:00Z",
          timeExpires: "2026-08-13T00:00:00Z",
          accessUri,
        }]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Copy PAR URL for Read link" }),
    );

    await waitFor(() =>
      expect(clipboard.copyToClipboard).toHaveBeenCalledWith(accessUri),
    );
    expect(success).toHaveBeenCalledWith("PAR URL copied.");
  });
});
