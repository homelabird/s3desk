import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fullAppError: null as Error | null,
  reloadPage: vi.fn(),
}));

vi.mock("../FullApp", () => ({
  default: function FullAppMock() {
    if (mocks.fullAppError) throw mocks.fullAppError;
    return <div data-testid="full-app-mock">full app</div>;
  },
}));

vi.mock("../lib/reloadPage", () => ({ reloadPage: mocks.reloadPage }));

import App from "../App";
import { AuthProvider } from "../auth/AuthProvider";

afterEach(() => {
  mocks.fullAppError = null;
  mocks.reloadPage.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

function renderApp() {
  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

describe("App bootstrap", () => {
  it("loads the lazy full app shell", async () => {
    renderApp();

    expect(await screen.findByTestId("full-app-mock")).toBeInTheDocument();
  });

  it("offers a reload when the app shell fails to render", () => {
    mocks.fullAppError = new Error("chunk unavailable");
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderApp();

    expect(screen.getByRole("alert")).toHaveTextContent("S3Desk failed to load");
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(mocks.reloadPage).toHaveBeenCalledOnce();
  });
});
