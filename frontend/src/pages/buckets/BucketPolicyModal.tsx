import { Grid, message } from "antd";
import { useMemo, useRef, useState } from "react";

import { APIClient, APIError } from "../../api/client";
import type {
  BucketPolicyPutRequest,
  BucketPolicyResponse,
  BucketPolicyValidateResponse,
  Profile,
} from "../../api/types";
import { hasPendingAction, runIfActionIdle } from "../../lib/pendingActionGuard";
import { BucketPolicyContentTabs } from "./BucketPolicyContentTabs";
import { BucketPolicyFooterActions } from "./BucketPolicyFooterActions";
import {
  getVisibleUnifiedDiff,
  getUnifiedDiffStats,
  hasUnifiedDiffChanges,
  unifiedDiff,
} from "./bucketPolicyDiff";
import {
  buildStructuredPolicyText,
  computeGcsPublicRead,
  getInitialStructuredState,
  parseStructuredStateFromText,
} from "./bucketPolicyStructuredState";
import {
  getLocalValidationErrors,
  getProviderErrorDetails,
  getProviderWarnings,
  getServerValidationMessages,
} from "./bucketPolicyValidation";
import { AzurePolicyStructuredEditor } from "./policy/azure-structured";
import { BucketPolicyDialogShell } from "./policy/DialogShell";
import { BucketPolicyModalShell } from "./BucketPolicyModalShell";
import { BucketPolicyWorkspaceHeader } from "./BucketPolicyWorkspaceHeader";
import { GcsPolicyStructuredEditor } from "./policy/gcs-structured";
import {
  getPolicyPresets,
  getPolicyTemplate,
  type PolicyKind,
} from "./policyPresets";
import { parsePolicyText } from "./policy/types";
import type {
  AzureStoredPolicyRow,
  GcsBindingRow,
} from "./policy/types";
import { useBucketPolicyQuery } from "./useBucketPolicyQuery";
import { useBucketPolicyMutations } from "./useBucketPolicyMutations";

export function BucketPolicyModal(props: {
  api: APIClient;
  apiToken: string;
  profileId: string;
  provider?: Profile["provider"];
  bucket: string | null;
  onClose: () => void;
  onOpenControls?: (bucket: string) => void;
}) {
  const open = !!props.bucket;
  const bucket = props.bucket ?? "";
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const policyQuery = useBucketPolicyQuery(
    props.api,
    props.profileId,
    bucket,
    props.apiToken,
    open && !!props.profileId && !!bucket,
  );

  const policyKind: PolicyKind = useMemo(() => {
    switch (props.provider) {
      case "gcp_gcs":
        return "gcs";
      case "azure_blob":
        return "azure";
      default:
        return "s3";
    }
  }, [props.provider]);

  if (!open) return null;

  return (
    <BucketPolicyModalShell
      bucket={bucket}
      mobile={isMobile}
      onClose={props.onClose}
      isError={policyQuery.isError}
      error={policyQuery.error}
      policyData={policyQuery.data}
    >
      {(policyData) => (
        <BucketPolicyEditor
          api={props.api}
          apiToken={props.apiToken}
          profileId={props.profileId}
          bucket={bucket}
          policyKind={policyKind}
          provider={props.provider}
          policyData={policyData}
          policyIsFetching={policyQuery.isFetching}
          mobile={isMobile}
          onClose={props.onClose}
          onOpenControls={props.onOpenControls}
        />
      )}
    </BucketPolicyModalShell>
  );
}

function BucketPolicyEditor(props: {
  api: APIClient;
  apiToken: string;
  profileId: string;
  bucket: string;
  policyKind: PolicyKind;
  provider?: Profile["provider"];
  policyData: BucketPolicyResponse;
  policyIsFetching: boolean;
  mobile: boolean;
  onClose: () => void;
  onOpenControls?: (bucket: string) => void;
}) {
  const { bucket, policyKind, policyData } = props;
  const useStructuredCards = props.mobile;

  const baseText = policyData.policy
    ? JSON.stringify(policyData.policy, null, 2)
    : "";
  const originalText = baseText;
  const initialPolicyText = policyData.exists
    ? baseText
    : getPolicyTemplate(policyKind);
  const exists = !!policyData.exists;

  const [policyText, setPolicyText] = useState(initialPolicyText);
  const [activeTab, setActiveTab] = useState<"validate" | "preview" | "diff">(
    "validate",
  );
  const [lastProviderError, setLastProviderError] = useState<APIError | null>(
    null,
  );
  const [showDiffContext, setShowDiffContext] = useState(false);

  // Editor mode: S3 stays JSON-only for now. GCS/Azure default to Form.
  const [editorMode, setEditorMode] = useState<"form" | "json">(
    policyKind === "s3" ? "json" : "form",
  );

  const [serverValidation, setServerValidation] =
    useState<BucketPolicyValidateResponse | null>(null);
  const [serverValidationError, setServerValidationError] = useState<
    string | null
  >(null);
  const [selectedPresetKey, setSelectedPresetKey] = useState<
    string | undefined
  >(undefined);

  const keyCounter = useRef(0);
  const nextKey = () => {
    keyCounter.current += 1;
    return `k-${keyCounter.current}`;
  };
  const { initialGcsState, initialAzureState } = useMemo(
    () => getInitialStructuredState(policyKind, initialPolicyText),
    [policyKind, initialPolicyText],
  );

  const [gcsVersion, setGcsVersion] = useState<number>(initialGcsState.version);
  const [gcsEtag, setGcsEtag] = useState<string>(initialGcsState.etag);
  const [gcsBindings, setGcsBindings] = useState<GcsBindingRow[]>(
    initialGcsState.bindings,
  );

  const [azurePublicAccess, setAzurePublicAccess] = useState<
    "private" | "blob" | "container"
  >(initialAzureState.publicAccess);
  const [azureStoredPolicies, setAzureStoredPolicies] = useState<
    AzureStoredPolicyRow[]
  >(initialAzureState.policies);

  const formPolicyText = useMemo(
    () =>
      buildStructuredPolicyText({
        policyKind,
        policyText,
        gcsVersion,
        gcsEtag,
        gcsBindings,
        azurePublicAccess,
        azureStoredPolicies,
      }),
    [
      policyKind,
      policyText,
      gcsVersion,
      gcsEtag,
      gcsBindings,
      azurePublicAccess,
      azureStoredPolicies,
    ],
  );

  const effectivePolicyText =
    editorMode === "form" && policyKind !== "s3" ? formPolicyText : policyText;
  const parsed = useMemo(
    () => parsePolicyText(effectivePolicyText),
    [effectivePolicyText],
  );

  const previewText = useMemo(() => {
    if (!parsed.ok) return "";
    try {
      return JSON.stringify(parsed.value, null, 2);
    } catch {
      return "";
    }
  }, [parsed]);

  const normalizedPolicyText = previewText || effectivePolicyText;

  const providerWarnings = useMemo(
    () => getProviderWarnings(parsed, policyKind),
    [parsed, policyKind],
  );

  const localValidationErrors = useMemo(
    () => getLocalValidationErrors(parsed, policyKind),
    [parsed, policyKind],
  );
  const hasBlockingValidationIssues = localValidationErrors.length > 0;

  const diffText = useMemo(
    () =>
      unifiedDiff(
        (originalText ?? "").trimEnd(),
        normalizedPolicyText.trimEnd(),
      ),
    [originalText, normalizedPolicyText],
  );

  const hasPolicyChanges = useMemo(
    () =>
      hasUnifiedDiffChanges(
        (originalText ?? "").trimEnd(),
        normalizedPolicyText.trimEnd(),
      ),
    [originalText, normalizedPolicyText],
  );

  const diffStats = useMemo(() => getUnifiedDiffStats(diffText), [diffText]);
  const visibleDiffText = useMemo(
    () => getVisibleUnifiedDiff(diffText, showDiffContext),
    [diffText, showDiffContext],
  );
  const canSave =
    parsed.ok &&
    !props.policyIsFetching &&
    hasPolicyChanges &&
    !hasBlockingValidationIssues;

  const { putMutation, deleteMutation, validateMutation } =
    useBucketPolicyMutations({
      api: props.api,
      profileId: props.profileId,
      bucket,
      provider: props.provider,
      onClose: props.onClose,
      setActiveTab,
      setLastProviderError,
      setServerValidation,
      setServerValidationError,
      buildValidationRequest: () => {
        if (!parsed.ok) throw new Error(parsed.error ?? "Invalid policy JSON");
        if (hasBlockingValidationIssues)
          throw new Error(
            localValidationErrors[0] ?? "Fix local validation issues first",
          );
        return { policy: parsed.value } as BucketPolicyPutRequest;
      },
    });
  const isBusy = hasPendingAction(
    props.policyIsFetching,
    putMutation.isPending,
    deleteMutation.isPending,
    validateMutation.isPending,
  );

  const titleSuffix = useMemo(() => {
    if (policyKind === "gcs") return " (GCS IAM)";
    if (policyKind === "azure") return " (Azure container ACL)";
    return "";
  }, [policyKind]);
  const controlsShortcut = useMemo(() => {
    if (!props.onOpenControls) return null;
    if (props.provider === "aws_s3") {
      return {
        title: "Prefer Controls for operational S3 settings",
        description:
          "Use Controls for Block Public Access, Object Ownership, Versioning, Encryption, and Lifecycle. Keep raw policy editing here for advanced statements and cross-account access.",
      };
    }
    if (props.provider === "gcp_gcs") {
      return {
        title: "Prefer Controls for routine GCS exposure changes",
        description:
          "Use Controls for public/private exposure and common IAM binding edits. Stay here when you need the full IAM policy document, etag handling, or preset-based policy composition.",
      };
    }
    if (props.provider === "azure_blob") {
      return {
        title: "Prefer Controls for routine Azure access changes",
        description:
          "Use Controls for anonymous access visibility and stored access policy maintenance. Stay here when you want the full container ACL JSON, presets, or validation in one place.",
      };
    }
    return null;
  }, [props.onOpenControls, props.provider]);

  const deleteLabel = useMemo(() => {
    if (policyKind === "azure") return "Reset policy";
    return "Delete policy";
  }, [policyKind]);

  const deleteHelp = useMemo(() => {
    if (policyKind === "azure")
      return "This resets public access to private and removes all stored access policies.";
    return "This removes the policy document from the bucket.";
  }, [policyKind]);

  const canDelete = useMemo(() => {
    if (policyKind === "gcs") return false;
    if (policyKind === "azure") return true;
    return exists;
  }, [policyKind, exists]);
  const deleteDisabledReason = useMemo(() => {
    if (policyKind === "gcs")
      return "GCS IAM policy cannot be deleted. Update bindings instead.";
    if (props.policyIsFetching) return "Policy is still loading.";
    if (!canDelete) return "No policy to delete.";
    return "";
  }, [canDelete, policyKind, props.policyIsFetching]);

  const providerValidationHint = useMemo(() => {
    if (policyKind === "gcs")
      return "Provider-side validation happens on save (GCS IAM policy update).";
    if (policyKind === "azure")
      return "Provider-side validation happens on save (Azure Set Container ACL).";
    return "Provider-side validation happens on save (S3 PutBucketPolicy).";
  }, [policyKind]);

  const editorPlaceholder = getPolicyTemplate(policyKind);
  const policyPresets = useMemo(
    () => getPolicyPresets(policyKind, bucket),
    [bucket, policyKind],
  );
  const selectedPresetDescription = useMemo(
    () =>
      policyPresets.find((item) => item.key === selectedPresetKey)
        ?.description ?? null,
    [policyPresets, selectedPresetKey],
  );

  const gcsPublicRead = useMemo(
    () => computeGcsPublicRead(gcsBindings),
    [gcsBindings],
  );

  const updateStructuredStateFromText = (text: string) => {
    const nextState = parseStructuredStateFromText(policyKind, text, nextKey);
    if (!nextState) return;
    if (nextState.gcsState) {
      setGcsVersion(nextState.gcsState.version);
      setGcsEtag(nextState.gcsState.etag);
      setGcsBindings(nextState.gcsState.bindings);
    }
    if (nextState.azureState) {
      setAzurePublicAccess(nextState.azureState.publicAccess);
      setAzureStoredPolicies(nextState.azureState.policies);
    }
  };

  const applyPolicyPreset = (key: string) => {
    const preset = policyPresets.find((item) => item.key === key);
    if (!preset) return;
    const nextText = JSON.stringify(preset.value, null, 2);
    setSelectedPresetKey(key);
    setPolicyText(nextText);
    updateStructuredStateFromText(nextText);
    if (policyKind === "s3") {
      setEditorMode("json");
    }
    setLastProviderError(null);
    setServerValidation(null);
    setServerValidationError(null);
  };

  const renderStructuredEditor = () => {
    if (policyKind === "gcs") {
      return (
        <GcsPolicyStructuredEditor
          useStructuredCards={useStructuredCards}
          gcsPublicRead={gcsPublicRead}
          gcsEtag={gcsEtag}
          gcsBindings={gcsBindings}
          nextKey={nextKey}
          setGcsBindings={setGcsBindings}
        />
      );
    }

    if (policyKind === "azure") {
      return (
        <AzurePolicyStructuredEditor
          useStructuredCards={useStructuredCards}
          azurePublicAccess={azurePublicAccess}
          azureStoredPolicies={azureStoredPolicies}
          nextKey={nextKey}
          setAzurePublicAccess={setAzurePublicAccess}
          setAzureStoredPolicies={setAzureStoredPolicies}
        />
      );
    }

    return null;
  };

  const title = `Policy: ${bucket}${titleSuffix}`;
  const { cause: providerCause, providerError } =
    getProviderErrorDetails(lastProviderError);
  const serverValidationMessages = getServerValidationMessages(serverValidation);

  const handleSave = () => {
    if (isBusy) return;
    if (!parsed.ok) {
      message.error(parsed.error ?? "Invalid policy JSON");
      return;
    }
    if (hasBlockingValidationIssues) {
      message.error(
        localValidationErrors[0] ?? "Fix local validation issues first",
      );
      setActiveTab("validate");
      return;
    }
    putMutation.mutate({ policy: parsed.value } as BucketPolicyPutRequest);
  };

  const handleClose = () => {
    runIfActionIdle(isBusy, props.onClose);
  };

  const footerContent = (
    <BucketPolicyFooterActions
      policyKind={policyKind}
      deleteDisabledReason={deleteDisabledReason}
      canDelete={canDelete}
      isBusy={isBusy}
      deleteLoading={deleteMutation.isPending}
      saveLoading={putMutation.isPending}
      deleteLabel={deleteLabel}
      deleteHelp={deleteHelp}
      canSave={canSave}
      onCancel={handleClose}
      onSave={handleSave}
      onDelete={() => deleteMutation.mutateAsync()}
    />
  );

  return (
    <BucketPolicyDialogShell
      mobile={props.mobile}
      title={title}
      onClose={handleClose}
      footer={footerContent}
    >
      <BucketPolicyWorkspaceHeader
        policyKind={policyKind}
        controlsShortcut={controlsShortcut}
        bucket={bucket}
        onOpenControls={props.onOpenControls}
      />
      <BucketPolicyContentTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        parsed={parsed}
        editorMode={editorMode}
        setEditorMode={setEditorMode}
        policyKind={policyKind}
        selectedPresetKey={selectedPresetKey}
        setSelectedPresetKey={setSelectedPresetKey}
        selectedPresetDescription={selectedPresetDescription}
        policyPresets={policyPresets.map((item) => ({ key: item.key, label: item.label }))}
        applyPolicyPreset={applyPolicyPreset}
        updateStructuredStateFromText={updateStructuredStateFromText}
        resetServerValidationState={() => {
          setServerValidation(null);
          setServerValidationError(null);
        }}
        policyText={policyText}
        setPolicyText={setPolicyText}
        formPolicyText={formPolicyText}
        editorPlaceholder={editorPlaceholder}
        structuredEditor={renderStructuredEditor()}
        providerWarnings={providerWarnings}
        hasBlockingValidationIssues={hasBlockingValidationIssues}
        localValidationErrors={localValidationErrors}
        providerValidationHint={providerValidationHint}
        hasPolicyChanges={hasPolicyChanges}
        diffStats={diffStats}
        isBusy={isBusy}
        onValidate={() => {
          if (isBusy) return;
          if (!parsed.ok) {
            message.error(parsed.error ?? "Invalid JSON policy");
            return;
          }
          if (hasBlockingValidationIssues) {
            message.error(localValidationErrors[0] ?? "Fix local validation issues first");
            return;
          }
          validateMutation.mutate();
        }}
        validateLoading={validateMutation.isPending}
        serverValidation={serverValidation}
        serverValidationMessages={serverValidationMessages}
        serverValidationError={serverValidationError}
        lastProviderError={lastProviderError}
        providerCause={providerCause}
        providerError={providerError}
        previewText={previewText}
        effectivePolicyText={effectivePolicyText}
        showDiffContext={showDiffContext}
        setShowDiffContext={setShowDiffContext}
        visibleDiffText={visibleDiffText}
      />
    </BucketPolicyDialogShell>
  );
}
