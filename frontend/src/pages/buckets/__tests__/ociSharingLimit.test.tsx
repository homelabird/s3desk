import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OCIPreauthenticatedRequestsActions } from "../governance/OCIControlBodies";
import type { BucketGovernanceView } from "../../../api/types";
import { buildOCISharingDraft } from "../governance/utils";
import { OCIPreauthenticatedRequestEditorCard } from "../governance/OCIPreauthenticatedRequestEditorCard";
import { buildCreatedOCIPreauthenticatedRequests, buildOCISharingRequest } from "../governance/requestBuilders";
import type { OCIPreauthenticatedRequestDraft } from "../governance/types";

describe("OCI sharing limits", () => {
  it("allows adding a PAR beyond one hundred existing requests", () => {
    const requests = Array.from({ length: 100 }, (_, index) => ({ id: `id-${index}` }) as OCIPreauthenticatedRequestDraft);
    const update = vi.fn();
    render(<OCIPreauthenticatedRequestsActions preauthenticatedRequests={requests} setPreauthenticatedRequests={update} />);
    const add = screen.getByRole("button", { name: "Add PAR" });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    const result = update.mock.calls[0][0](requests);
    expect(result).toHaveLength(101);
    expect(result[100].id).toBe("");
  });
});

it.each(["", " ", " 보고서/ ", "docs/+%2F\t"])("preserves exact OCI PAR target %j", (objectName) => {
  const request = buildOCISharingRequest([{ id: "", name: "link", accessType: "AnyObjectRead", bucketListingAction: "Deny", objectName, timeExpires: "2030-01-01T00:00:00Z" } as OCIPreauthenticatedRequestDraft]);
  expect(request.preauthenticatedRequests?.[0].objectName).toBe(objectName || undefined);
});

it.each(["ObjectRead", "ObjectWrite", "ObjectReadWrite", "FutureProviderType"])("preserves existing OCI access type %s", (accessType) => {
  const item = { id: "existing", name: "keep", accessType, bucketListingAction: "Deny", objectName: " one object ", timeExpires: "2030-01-01T00:00:00Z", accessUri: "/fixture-link" };
  const governance = { provider: "oci_object_storage", bucket: "demo", sharing: { provider: "oci_object_storage", bucket: "demo", preauthenticatedRequests: [item] } } as BucketGovernanceView;
  const draft = buildOCISharingDraft(governance);
  expect(buildOCISharingRequest(draft).preauthenticatedRequests?.[0]).toMatchObject({ id: item.id, accessType, objectName: item.objectName });
  expect(buildCreatedOCIPreauthenticatedRequests({ preauthenticatedRequests: draft }, [])[0].accessType).toBe(accessType);
  render(<OCIPreauthenticatedRequestEditorCard request={draft[0]} index={0} setPreauthenticatedRequests={vi.fn()} />);
  const select = screen.getByRole("combobox", { name: "OCI PAR access type 1" });
  expect(select).toHaveValue(accessType);
  expect(select).toBeDisabled();
});

it("clears listing when choosing a new write-only PAR", () => {
  const update = vi.fn();
  const draft = { id: "", name: "new", accessType: "AnyObjectRead", bucketListingAction: "ListObjects", objectName: "", timeCreated: "", timeExpires: "", accessUri: "" };
  const view = render(<OCIPreauthenticatedRequestEditorCard request={draft} index={0} setPreauthenticatedRequests={update} />);
  fireEvent.change(screen.getByRole("combobox", { name: "OCI PAR access type 1" }), { target: { value: "AnyObjectWrite" } });
  const next = update.mock.calls[0][0]([draft])[0];
  expect(next).toMatchObject({ accessType: "AnyObjectWrite", bucketListingAction: "Deny" });
  view.rerender(<OCIPreauthenticatedRequestEditorCard request={next} index={0} setPreauthenticatedRequests={update} />);
  expect(screen.getByRole("combobox", { name: "OCI PAR bucket listing 1" })).toBeDisabled();
});
