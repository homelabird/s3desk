import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";

import { useGovernanceMutationScope } from "./mutationScope";

describe("useGovernanceMutationScope", () => {
  it("keeps the current request active when StrictMode replays effects", () => {
    const { result, unmount } = renderHook(
      () => useGovernanceMutationScope({
        apiToken: "token",
        profileId: "profile-1",
        provider: "aws_s3",
        bucket: "bucket-1",
      }),
      { wrapper: StrictMode },
    );
    const context = result.current.createContext(1);

    expect(result.current.isCurrentRequest(context, 1)).toBe(true);
    unmount();
    expect(result.current.isCurrentRequest(context, 1)).toBe(false);
  });
});
