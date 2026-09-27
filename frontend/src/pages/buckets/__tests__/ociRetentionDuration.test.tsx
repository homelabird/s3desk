import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BucketGovernanceView } from "../../../api/types";
import { buildOCIDraft } from "../governance/utils";
import { buildOCIProtectionRequest } from "../governance/requestBuilders";
import { OCIRetentionRuleEditorCard } from "../governance/OCIRetentionRuleEditorCard";

function governance(rule: Record<string, unknown>) {
  return { provider: "oci_object_storage", bucket: "demo", capabilities: {}, protection: {
    provider: "oci_object_storage", bucket: "demo", retention: { enabled: true, rules: [{ id: "id", displayName: "rule", ...rule }] },
  } } as BucketGovernanceView;
}

describe("OCI native retention duration", () => {
  it("preserves years and indefinite rules without converting them into days", () => {
    for (const duration of [{ years: 2 }, { indefinite: true }, { days: 7 }]) {
      const draft = buildOCIDraft(governance(duration));
      const request = buildOCIProtectionRequest(draft.retentionRules);
      expect(request.retention?.rules?.[0]).toEqual(expect.objectContaining(duration));
      if (!("days" in duration)) expect(request.retention?.rules?.[0].days).toBeUndefined();
    }
  });
  it("edits the duration unit and sends an explicit indefinite request", () => {
    const submit = vi.fn();
    function Editor() {
      const [rules, setRules] = useState(buildOCIDraft(governance({ years: 2 })).retentionRules);
      return <><OCIRetentionRuleEditorCard rule={rules[0]} index={0} setRetentionRules={setRules} />
        <button onClick={() => submit(buildOCIProtectionRequest(rules))}>Submit</button></>;
    }
    render(<Editor />);
    expect(screen.getByRole("textbox", { name: "Retention years" })).toHaveValue("2");
    fireEvent.change(screen.getByRole("combobox", { name: "Retention duration unit for rule 1" }), { target: { value: "INDEFINITE" } });
    expect(screen.queryByRole("textbox", { name: /Retention years|Retention days/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    const rule = submit.mock.calls[0][0].retention.rules[0];
    expect(rule.indefinite).toBe(true);
    expect(rule.days).toBeUndefined();
    expect(rule.years).toBeUndefined();
  });
  it("keeps the original unit fixed for locked rules", () => {
    const rule = buildOCIDraft(governance({ years: 3, locked: true })).retentionRules[0];
    render(<OCIRetentionRuleEditorCard rule={rule} index={0} setRetentionRules={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Retention duration unit for rule 1" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Retention years" })).toBeEnabled();
  });
});
