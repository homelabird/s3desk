import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../FullApp", () => ({
  default: function FullAppMock() {
    return <div data-testid="full-app-mock">full app</div>;
  },
}));

import App from "../App";
import { AuthProvider } from "../auth/AuthProvider";

afterEach(() => {
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
});
