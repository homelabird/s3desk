import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TransfersContext } from "../../components/useTransfers";
import { ensureDomShims } from "../../test/domShims";
import { transfersStub } from "../../test/transfersStub";
import { JobsPage } from "../JobsPage";

beforeAll(() => {
  ensureDomShims();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JobsPage", () => {
  it("navigates to profiles from setup callout", () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={client}>
        <TransfersContext.Provider value={transfersStub}>
          <MemoryRouter initialEntries={["/jobs"]}>
            <Routes>
              <Route
                path="/jobs"
                element={<JobsPage apiToken="" profileId={null} />}
              />
              <Route path="/profiles" element={<div>Profiles Route</div>} />
            </Routes>
          </MemoryRouter>
        </TransfersContext.Provider>
      </QueryClientProvider>,
    );

    expect(
      screen.getByText("Select a profile to view jobs"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Setup" }));
    expect(screen.getByText("Profiles Route")).toBeInTheDocument();
  });
});
