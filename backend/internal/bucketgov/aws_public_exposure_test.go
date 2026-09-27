package bucketgov

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"

	"s3desk/internal/models"
)

type fakePublicAccessBlockClient struct {
	getOutput          *s3.GetPublicAccessBlockOutput
	getErr             error
	putInput           *s3.PutPublicAccessBlockInput
	putErr             error
	ownershipOutput    *s3.GetBucketOwnershipControlsOutput
	ownershipErr       error
	putOwnershipInput  *s3.PutBucketOwnershipControlsInput
	putOwnershipErr    error
	versioningOutput   *s3.GetBucketVersioningOutput
	versioningErr      error
	putVersioning      *s3.PutBucketVersioningInput
	putVersioningErr   error
	encryptionOutput   *s3.GetBucketEncryptionOutput
	encryptionErr      error
	putEncryption      *s3.PutBucketEncryptionInput
	putEncryptionErr   error
	lifecycleOutput    *s3.GetBucketLifecycleConfigurationOutput
	lifecycleErr       error
	putLifecycle       *s3.PutBucketLifecycleConfigurationInput
	putLifecycleErr    error
	deleteLifecycle    *s3.DeleteBucketLifecycleInput
	deleteLifecycleErr error
	getCalls           []string
}

func (f *fakePublicAccessBlockClient) GetPublicAccessBlock(_ context.Context, _ *s3.GetPublicAccessBlockInput, _ ...func(*s3.Options)) (*s3.GetPublicAccessBlockOutput, error) {
	f.getCalls = append(f.getCalls, "public_exposure")
	return f.getOutput, f.getErr
}

func (f *fakePublicAccessBlockClient) PutPublicAccessBlock(_ context.Context, input *s3.PutPublicAccessBlockInput, _ ...func(*s3.Options)) (*s3.PutPublicAccessBlockOutput, error) {
	f.putInput = input
	if f.putErr != nil {
		return nil, f.putErr
	}
	f.getOutput = &s3.GetPublicAccessBlockOutput{PublicAccessBlockConfiguration: input.PublicAccessBlockConfiguration}
	f.getErr = nil
	return &s3.PutPublicAccessBlockOutput{}, nil
}

func (f *fakePublicAccessBlockClient) GetBucketOwnershipControls(_ context.Context, _ *s3.GetBucketOwnershipControlsInput, _ ...func(*s3.Options)) (*s3.GetBucketOwnershipControlsOutput, error) {
	f.getCalls = append(f.getCalls, "access")
	return f.ownershipOutput, f.ownershipErr
}

func (f *fakePublicAccessBlockClient) PutBucketOwnershipControls(_ context.Context, input *s3.PutBucketOwnershipControlsInput, _ ...func(*s3.Options)) (*s3.PutBucketOwnershipControlsOutput, error) {
	f.putOwnershipInput = input
	if f.putOwnershipErr != nil {
		return nil, f.putOwnershipErr
	}
	return &s3.PutBucketOwnershipControlsOutput{}, nil
}

func (f *fakePublicAccessBlockClient) GetBucketVersioning(_ context.Context, _ *s3.GetBucketVersioningInput, _ ...func(*s3.Options)) (*s3.GetBucketVersioningOutput, error) {
	f.getCalls = append(f.getCalls, "versioning")
	return f.versioningOutput, f.versioningErr
}

func (f *fakePublicAccessBlockClient) PutBucketVersioning(_ context.Context, input *s3.PutBucketVersioningInput, _ ...func(*s3.Options)) (*s3.PutBucketVersioningOutput, error) {
	f.putVersioning = input
	if f.putVersioningErr != nil {
		return nil, f.putVersioningErr
	}
	return &s3.PutBucketVersioningOutput{}, nil
}

func (f *fakePublicAccessBlockClient) GetBucketEncryption(_ context.Context, _ *s3.GetBucketEncryptionInput, _ ...func(*s3.Options)) (*s3.GetBucketEncryptionOutput, error) {
	f.getCalls = append(f.getCalls, "encryption")
	if f.putEncryption != nil && f.putEncryptionErr == nil {
		return &s3.GetBucketEncryptionOutput{ServerSideEncryptionConfiguration: f.putEncryption.ServerSideEncryptionConfiguration}, nil
	}
	return f.encryptionOutput, f.encryptionErr
}

func (f *fakePublicAccessBlockClient) PutBucketEncryption(_ context.Context, input *s3.PutBucketEncryptionInput, _ ...func(*s3.Options)) (*s3.PutBucketEncryptionOutput, error) {
	f.putEncryption = input
	if f.putEncryptionErr != nil {
		return nil, f.putEncryptionErr
	}
	return &s3.PutBucketEncryptionOutput{}, nil
}

func (f *fakePublicAccessBlockClient) GetBucketLifecycleConfiguration(_ context.Context, _ *s3.GetBucketLifecycleConfigurationInput, _ ...func(*s3.Options)) (*s3.GetBucketLifecycleConfigurationOutput, error) {
	f.getCalls = append(f.getCalls, "lifecycle")
	return f.lifecycleOutput, f.lifecycleErr
}

func (f *fakePublicAccessBlockClient) PutBucketLifecycleConfiguration(_ context.Context, input *s3.PutBucketLifecycleConfigurationInput, _ ...func(*s3.Options)) (*s3.PutBucketLifecycleConfigurationOutput, error) {
	f.putLifecycle = input
	if f.putLifecycleErr != nil {
		return nil, f.putLifecycleErr
	}
	f.lifecycleOutput = &s3.GetBucketLifecycleConfigurationOutput{Rules: input.LifecycleConfiguration.Rules, TransitionDefaultMinimumObjectSize: input.TransitionDefaultMinimumObjectSize}
	f.lifecycleErr = nil
	return &s3.PutBucketLifecycleConfigurationOutput{}, nil
}

func (f *fakePublicAccessBlockClient) DeleteBucketLifecycle(_ context.Context, input *s3.DeleteBucketLifecycleInput, _ ...func(*s3.Options)) (*s3.DeleteBucketLifecycleOutput, error) {
	f.deleteLifecycle = input
	if f.deleteLifecycleErr != nil {
		return nil, f.deleteLifecycleErr
	}
	return &s3.DeleteBucketLifecycleOutput{}, nil
}

func stubAWSClient(client awsPublicAccessBlockClient) func(models.ProfileSecrets) (awsPublicAccessBlockClient, error) {
	return func(models.ProfileSecrets) (awsPublicAccessBlockClient, error) {
		return client, nil
	}
}

func TestAWSAdapterGetGovernanceReusesClient(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		getOutput:        &s3.GetPublicAccessBlockOutput{PublicAccessBlockConfiguration: &s3types.PublicAccessBlockConfiguration{BlockPublicAcls: boolPtr(false), IgnorePublicAcls: boolPtr(false), BlockPublicPolicy: boolPtr(false), RestrictPublicBuckets: boolPtr(false)}},
		ownershipOutput:  &s3.GetBucketOwnershipControlsOutput{OwnershipControls: &s3types.OwnershipControls{Rules: []s3types.OwnershipControlsRule{{ObjectOwnership: s3types.ObjectOwnershipBucketOwnerEnforced}}}},
		versioningOutput: &s3.GetBucketVersioningOutput{},
		encryptionErr:    &smithy.GenericAPIError{Code: "ServerSideEncryptionConfigurationNotFoundError"},
		lifecycleOutput:  &s3.GetBucketLifecycleConfigurationOutput{},
	}
	newClientCalls := 0
	adapter := &awsAdapter{
		newClient: func(models.ProfileSecrets) (awsPublicAccessBlockClient, error) {
			newClientCalls++
			return client, nil
		},
	}

	view, err := adapter.GetGovernance(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetGovernance err=%v", err)
	}
	if newClientCalls != 1 {
		t.Fatalf("newClient calls=%d, want 1", newClientCalls)
	}
	wantCalls := []string{"access", "public_exposure", "versioning", "encryption", "lifecycle"}
	if !reflect.DeepEqual(client.getCalls, wantCalls) {
		t.Fatalf("get calls=%v, want %v", client.getCalls, wantCalls)
	}
	if view.Access == nil || view.PublicExposure == nil || view.Versioning == nil || view.Encryption == nil || view.Lifecycle == nil {
		t.Fatalf("governance sections=%+v, want all AWS sections", view)
	}
}

func TestAWSAdapterGetPublicExposure(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		getOutput: &s3.GetPublicAccessBlockOutput{
			PublicAccessBlockConfiguration: &s3types.PublicAccessBlockConfiguration{
				BlockPublicAcls:       boolPtr(true),
				IgnorePublicAcls:      boolPtr(true),
				BlockPublicPolicy:     boolPtr(true),
				RestrictPublicBuckets: boolPtr(true),
			},
		},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	view, err := adapter.GetPublicExposure(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetPublicExposure err=%v", err)
	}
	if view.Provider != models.ProfileProviderAwsS3 {
		t.Fatalf("provider=%q, want %q", view.Provider, models.ProfileProviderAwsS3)
	}
	if view.Mode != models.BucketPublicExposureModePrivate {
		t.Fatalf("mode=%q, want private", view.Mode)
	}
	if view.BlockPublicAccess == nil || !view.BlockPublicAccess.BlockPublicAcls || !view.BlockPublicAccess.RestrictPublicBuckets {
		t.Fatalf("blockPublicAccess=%+v, want all true", view.BlockPublicAccess)
	}
}

func TestAWSAdapterGetPublicExposureWithoutConfig(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		getErr: &smithy.GenericAPIError{Code: "NoSuchPublicAccessBlockConfiguration", Message: "missing"},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	view, err := adapter.GetPublicExposure(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetPublicExposure err=%v", err)
	}
	if view.Mode != models.BucketPublicExposureModePublic {
		t.Fatalf("mode=%q, want public", view.Mode)
	}
	if view.BlockPublicAccess == nil {
		t.Fatal("expected blockPublicAccess")
	}
	if len(view.Warnings) == 0 {
		t.Fatal("expected warning when BPA is missing")
	}
}

func TestAWSAdapterPutPublicExposure(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{
		BlockPublicAccess: &models.BucketBlockPublicAccess{
			BlockPublicAcls:       true,
			IgnorePublicAcls:      false,
			BlockPublicPolicy:     true,
			RestrictPublicBuckets: false,
		},
	})
	if err != nil {
		t.Fatalf("PutPublicExposure err=%v", err)
	}
	if client.putInput == nil || client.putInput.PublicAccessBlockConfiguration == nil {
		t.Fatal("expected PutPublicAccessBlock input")
	}
	if !derefBool(client.putInput.PublicAccessBlockConfiguration.BlockPublicAcls) {
		t.Fatalf("putInput=%+v, want blockPublicAcls=true", client.putInput.PublicAccessBlockConfiguration)
	}
	if derefBool(client.putInput.PublicAccessBlockConfiguration.IgnorePublicAcls) {
		t.Fatalf("putInput=%+v, want ignorePublicAcls=false", client.putInput.PublicAccessBlockConfiguration)
	}
}

func TestAWSAdapterRejectsLoopbackEndpointWhenRemoteEnabled(t *testing.T) {
	t.Parallel()

	adapter := NewAWSAdapterWithOptions(AWSAdapterOptions{AllowRemote: true})
	_, err := adapter.(publicExposureSection).GetPublicExposure(context.Background(), models.ProfileSecrets{
		Provider:        models.ProfileProviderAwsS3,
		Endpoint:        "http://127.0.0.1:9000",
		Region:          "us-east-1",
		AccessKeyID:     "access",
		SecretAccessKey: "secret",
	}, "demo")
	var opErr *OperationError
	if ok := errorAs(err, &opErr); !ok {
		t.Fatalf("err=%T, want OperationError", err)
	}
	if opErr.Code != "bucket_governance_client_error" {
		t.Fatalf("code=%q, want bucket_governance_client_error", opErr.Code)
	}
	if got, _ := opErr.Details["error"].(string); !strings.Contains(got, "loopback or link-local") {
		t.Fatalf("details.error=%q, want loopback rejection", got)
	}
}

func TestMapAWSPublicExposureErrorNotFound(t *testing.T) {
	t.Parallel()

	err := mapAWSPublicExposureError(&smithy.GenericAPIError{Code: "NoSuchBucket", Message: "missing"}, "demo", "get")
	var opErr *OperationError
	if ok := errorAs(err, &opErr); !ok {
		t.Fatalf("err=%T, want OperationError", err)
	}
	if opErr.Status != http.StatusNotFound {
		t.Fatalf("status=%d, want %d", opErr.Status, http.StatusNotFound)
	}
}

func TestAWSAdapterGetAccess(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		ownershipOutput: &s3.GetBucketOwnershipControlsOutput{
			OwnershipControls: &s3types.OwnershipControls{
				Rules: []s3types.OwnershipControlsRule{
					{ObjectOwnership: s3types.ObjectOwnershipBucketOwnerPreferred},
				},
			},
		},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	view, err := adapter.GetAccess(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetAccess err=%v", err)
	}
	if view.ObjectOwnership == nil || view.ObjectOwnership.Mode != models.BucketObjectOwnershipBucketOwnerPreferred {
		t.Fatalf("objectOwnership=%+v, want bucket_owner_preferred", view.ObjectOwnership)
	}
	if view.Advanced == nil || !view.Advanced.RawPolicySupported {
		t.Fatalf("advanced=%+v, want raw policy support", view.Advanced)
	}
}

func TestAWSAdapterGetAccessPreservesMissingControls(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		ownershipErr: &smithy.GenericAPIError{Code: "OwnershipControlsNotFoundError", Message: "missing"},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	view, err := adapter.GetAccess(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetAccess err=%v", err)
	}
	if view.ObjectOwnership != nil || len(view.Warnings) == 0 {
		t.Fatalf("missing controls must not imply an enforced mode: %+v", view)
	}
}

func TestAWSAdapterPutAccess(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{ownershipOutput: &s3.GetBucketOwnershipControlsOutput{OwnershipControls: &s3types.OwnershipControls{Rules: []s3types.OwnershipControlsRule{{ObjectOwnership: s3types.ObjectOwnershipObjectWriter}}}}}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	mode := models.BucketObjectOwnershipObjectWriter
	err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{
		ObjectOwnership: &mode,
	})
	if err != nil {
		t.Fatalf("PutAccess err=%v", err)
	}
	if client.putOwnershipInput == nil || client.putOwnershipInput.OwnershipControls == nil || len(client.putOwnershipInput.OwnershipControls.Rules) != 1 {
		t.Fatalf("putOwnershipInput=%+v, want one rule", client.putOwnershipInput)
	}
	if got := client.putOwnershipInput.OwnershipControls.Rules[0].ObjectOwnership; got != s3types.ObjectOwnershipObjectWriter {
		t.Fatalf("objectOwnership=%q, want %q", got, s3types.ObjectOwnershipObjectWriter)
	}
}

func TestAWSAdapterGetVersioning(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		versioningOutput: &s3.GetBucketVersioningOutput{
			Status:    s3types.BucketVersioningStatusEnabled,
			MFADelete: s3types.MFADeleteStatusEnabled,
		},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	view, err := adapter.GetVersioning(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetVersioning err=%v", err)
	}
	if view.Status != models.BucketVersioningStatusEnabled {
		t.Fatalf("status=%q, want %q", view.Status, models.BucketVersioningStatusEnabled)
	}
	if len(view.Warnings) != 1 {
		t.Fatalf("warnings=%v, want MFA warning", view.Warnings)
	}
}

func TestAWSAdapterGetVersioningDefaultsToDisabled(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		versioningOutput: &s3.GetBucketVersioningOutput{},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	view, err := adapter.GetVersioning(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetVersioning err=%v", err)
	}
	if view.Status != models.BucketVersioningStatusDisabled {
		t.Fatalf("status=%q, want %q", view.Status, models.BucketVersioningStatusDisabled)
	}
}

func TestAWSAdapterGetVersioningRejectsUnconfirmedState(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name string
		out  *s3.GetBucketVersioningOutput
	}{
		{name: "missing response"},
		{name: "unknown status", out: &s3.GetBucketVersioningOutput{Status: "FutureStatus"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &fakePublicAccessBlockClient{versioningOutput: tc.out}
			adapter := &awsAdapter{newClient: stubAWSClient(client)}
			view, err := adapter.GetVersioning(context.Background(), models.ProfileSecrets{}, "demo")
			if err == nil || view.Status != "" {
				t.Fatalf("GetVersioning returned confirmed state: view=%+v err=%v", view, err)
			}
		})
	}
}

func TestAWSAdapterPutVersioning(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	err := adapter.PutVersioning(context.Background(), models.ProfileSecrets{}, "demo", models.BucketVersioningPutRequest{
		Status: models.BucketVersioningStatusSuspended,
	})
	if err != nil {
		t.Fatalf("PutVersioning err=%v", err)
	}
	if client.putVersioning == nil || client.putVersioning.VersioningConfiguration == nil {
		t.Fatal("expected PutBucketVersioning input")
	}
	if got := client.putVersioning.VersioningConfiguration.Status; got != s3types.BucketVersioningStatusSuspended {
		t.Fatalf("status=%q, want %q", got, s3types.BucketVersioningStatusSuspended)
	}
}

func TestAWSAdapterGetEncryption(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		encryptionOutput: &s3.GetBucketEncryptionOutput{
			ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{
				Rules: []s3types.ServerSideEncryptionRule{
					{
						ApplyServerSideEncryptionByDefault: &s3types.ServerSideEncryptionByDefault{
							SSEAlgorithm:   s3types.ServerSideEncryptionAwsKms,
							KMSMasterKeyID: stringPtr("alias/demo"),
						},
						BucketKeyEnabled: boolPtr(true),
					},
				},
			},
		},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	view, err := adapter.GetEncryption(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetEncryption err=%v", err)
	}
	if view.Mode != models.BucketEncryptionModeSSEKMS {
		t.Fatalf("mode=%q, want %q", view.Mode, models.BucketEncryptionModeSSEKMS)
	}
	if view.KMSKeyID != "alias/demo" {
		t.Fatalf("kmsKeyId=%q, want alias/demo", view.KMSKeyID)
	}
	if len(view.Warnings) != 1 {
		t.Fatalf("warnings=%v, want bucket key warning", view.Warnings)
	}
}

func TestAWSAdapterGetEncryptionImplicitSSES3(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		encryptionErr: &smithy.GenericAPIError{Code: "ServerSideEncryptionConfigurationNotFoundError", Message: "missing"},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	view, err := adapter.GetEncryption(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetEncryption err=%v", err)
	}
	if view.Mode != models.BucketEncryptionModeSSES3 {
		t.Fatalf("mode=%q, want %q", view.Mode, models.BucketEncryptionModeSSES3)
	}
	if len(view.Warnings) == 0 {
		t.Fatal("expected implicit SSE-S3 warning")
	}
}

func TestAWSAdapterPutEncryption(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		encryptionOutput: &s3.GetBucketEncryptionOutput{
			ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{
				Rules: []s3types.ServerSideEncryptionRule{
					{
						ApplyServerSideEncryptionByDefault: &s3types.ServerSideEncryptionByDefault{
							SSEAlgorithm: s3types.ServerSideEncryptionAwsKms,
						},
						BucketKeyEnabled: boolPtr(true),
					},
				},
			},
		},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	err := adapter.PutEncryption(context.Background(), models.ProfileSecrets{}, "demo", models.BucketEncryptionPutRequest{
		Mode:     models.BucketEncryptionModeSSEKMS,
		KMSKeyID: "alias/next",
	})
	if err != nil {
		t.Fatalf("PutEncryption err=%v", err)
	}
	if client.putEncryption == nil || client.putEncryption.ServerSideEncryptionConfiguration == nil {
		t.Fatal("expected PutBucketEncryption input")
	}
	rule := client.putEncryption.ServerSideEncryptionConfiguration.Rules[0]
	if rule.ApplyServerSideEncryptionByDefault == nil || rule.ApplyServerSideEncryptionByDefault.SSEAlgorithm != s3types.ServerSideEncryptionAwsKms {
		t.Fatalf("rule=%+v, want aws:kms", rule)
	}
	if rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID == nil || *rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID != "alias/next" {
		t.Fatalf("kmsKeyId=%v, want alias/next", rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID)
	}
	if rule.BucketKeyEnabled == nil || !*rule.BucketKeyEnabled {
		t.Fatalf("bucketKeyEnabled=%v, want true", rule.BucketKeyEnabled)
	}
}

func TestAWSAdapterGetLifecycle(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		lifecycleOutput: &s3.GetBucketLifecycleConfigurationOutput{
			Rules: []s3types.LifecycleRule{
				{
					ID:     stringPtr("expire-logs"),
					Status: s3types.ExpirationStatusEnabled,
					Filter: &s3types.LifecycleRuleFilter{Prefix: stringPtr("logs/")},
					Expiration: &s3types.LifecycleExpiration{
						Days: int32Ptr(30),
					},
				},
			},
		},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	view, err := adapter.GetLifecycle(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetLifecycle err=%v", err)
	}
	if got := string(view.Rules); got != `[{"id":"expire-logs","status":"enabled","prefix":"logs/","expiration":{"days":30}}]` {
		t.Fatalf("rules=%s, want lifecycle JSON", got)
	}
}

func TestAWSAdapterGetLifecycleWithoutConfig(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		lifecycleErr: &smithy.GenericAPIError{Code: "NoSuchLifecycleConfiguration", Message: "missing"},
	}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	view, err := adapter.GetLifecycle(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetLifecycle err=%v", err)
	}
	if got := string(view.Rules); got != `[]` {
		t.Fatalf("rules=%s, want []", got)
	}
}

func TestAWSAdapterGetLifecycleRejectsMissingResponse(t *testing.T) {
	t.Parallel()
	adapter := &awsAdapter{newClient: stubAWSClient(&fakePublicAccessBlockClient{})}
	view, err := adapter.GetLifecycle(context.Background(), models.ProfileSecrets{}, "demo")
	var operationErr *OperationError
	if !errors.As(err, &operationErr) || operationErr.Code != "bucket_lifecycle_error" || view.Rules != nil {
		t.Fatalf("view=%+v err=%v", view, err)
	}
}

func TestAWSAdapterPutLifecycle(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{lifecycleErr: &smithy.GenericAPIError{Code: "NoSuchLifecycleConfiguration"}}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	err := adapter.PutLifecycle(context.Background(), models.ProfileSecrets{}, "demo", models.BucketLifecyclePutRequest{
		Rules: []byte(`[{"id":"expire-logs","status":"enabled","prefix":"logs/","expiration":{"days":30}}]`),
	})
	if err != nil {
		t.Fatalf("PutLifecycle err=%v", err)
	}
	if client.putLifecycle == nil || client.putLifecycle.LifecycleConfiguration == nil || len(client.putLifecycle.LifecycleConfiguration.Rules) != 1 {
		t.Fatalf("putLifecycle=%+v, want one rule", client.putLifecycle)
	}
	rule := client.putLifecycle.LifecycleConfiguration.Rules[0]
	if rule.ID == nil || *rule.ID != "expire-logs" {
		t.Fatalf("rule.ID=%v, want expire-logs", rule.ID)
	}
	if rule.Filter == nil || rule.Filter.Prefix == nil || *rule.Filter.Prefix != "logs/" {
		t.Fatalf("rule.Filter=%T %+v, want prefix logs/", rule.Filter, rule.Filter)
	}
	if rule.Expiration == nil || rule.Expiration.Days == nil || *rule.Expiration.Days != 30 {
		t.Fatalf("rule.Expiration=%+v, want days=30", rule.Expiration)
	}
}

func TestAWSAdapterPutLifecycleDeletesWhenRulesEmpty(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{lifecycleErr: &smithy.GenericAPIError{Code: "NoSuchLifecycleConfiguration"}}
	adapter := &awsAdapter{
		newClient: stubAWSClient(client),
	}

	err := adapter.PutLifecycle(context.Background(), models.ProfileSecrets{}, "demo", models.BucketLifecyclePutRequest{
		Rules: []byte(`[]`),
	})
	if err != nil {
		t.Fatalf("PutLifecycle err=%v", err)
	}
	if client.deleteLifecycle == nil {
		t.Fatal("expected DeleteBucketLifecycle input")
	}
	if client.putLifecycle != nil {
		t.Fatalf("putLifecycle=%+v, want nil when deleting", client.putLifecycle)
	}
}

func errorAs(err error, target **OperationError) bool {
	opErr, ok := err.(*OperationError)
	if !ok {
		return false
	}
	*target = opErr
	return true
}

func stringPtr(value string) *string {
	return &value
}

func int32Ptr(value int32) *int32 {
	return &value
}

func TestAWSAdapterGetAccessRejectsInvalidResponse(t *testing.T) {
	for _, out := range []*s3.GetBucketOwnershipControlsOutput{
		nil, {}, {OwnershipControls: &s3types.OwnershipControls{}},
		{OwnershipControls: &s3types.OwnershipControls{Rules: []s3types.OwnershipControlsRule{{ObjectOwnership: "unknown"}}}},
	} {
		adapter := &awsAdapter{newClient: stubAWSClient(&fakePublicAccessBlockClient{ownershipOutput: out})}
		if _, err := adapter.GetAccess(context.Background(), models.ProfileSecrets{}, "demo"); err == nil {
			t.Fatalf("invalid response accepted: %+v", out)
		}
	}
}

func TestAWSMissingEncryptionResponseBlocksReadAndKMSWrite(t *testing.T) {
	t.Parallel()
	for _, out := range []*s3.GetBucketEncryptionOutput{
		nil, {}, {ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{}},
		{ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{Rules: []s3types.ServerSideEncryptionRule{{}}}},
		{ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{Rules: []s3types.ServerSideEncryptionRule{{ApplyServerSideEncryptionByDefault: &s3types.ServerSideEncryptionByDefault{}}}}},
		{ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{Rules: []s3types.ServerSideEncryptionRule{{}, {}}}},
	} {
		client := &fakePublicAccessBlockClient{encryptionOutput: out}
		adapter := &awsAdapter{newClient: stubAWSClient(client)}
		if view, err := adapter.GetEncryption(context.Background(), models.ProfileSecrets{}, "demo"); err == nil || view.Mode != "" {
			t.Fatalf("view=%+v err=%v", view, err)
		}
		if err := adapter.PutEncryption(context.Background(), models.ProfileSecrets{}, "demo", models.BucketEncryptionPutRequest{Mode: models.BucketEncryptionModeSSEKMS}); err == nil {
			t.Fatal("unconfirmed configuration allowed KMS write")
		}
		if client.putEncryption != nil {
			t.Fatal("provider write occurred despite invalid read response")
		}
	}
}

func TestAWSEncryptionUpdatePreservesUneditedRestrictions(t *testing.T) {
	t.Parallel()
	for _, mode := range []models.BucketEncryptionMode{models.BucketEncryptionModeSSES3, models.BucketEncryptionModeSSEKMS} {
		t.Run(string(mode), func(t *testing.T) {
			original := s3types.ServerSideEncryptionRule{
				ApplyServerSideEncryptionByDefault: &s3types.ServerSideEncryptionByDefault{SSEAlgorithm: s3types.ServerSideEncryptionAwsKms},
				BucketKeyEnabled:                   boolPtr(false),
				BlockedEncryptionTypes:             &s3types.BlockedEncryptionTypes{EncryptionType: []s3types.EncryptionType{"SSE-C"}},
			}
			client := &fakePublicAccessBlockClient{encryptionOutput: &s3.GetBucketEncryptionOutput{ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{Rules: []s3types.ServerSideEncryptionRule{original}}}}
			adapter := &awsAdapter{newClient: stubAWSClient(client)}
			if err := adapter.PutEncryption(context.Background(), models.ProfileSecrets{}, "demo", models.BucketEncryptionPutRequest{Mode: mode}); err != nil {
				t.Fatal(err)
			}
			rule := client.putEncryption.ServerSideEncryptionConfiguration.Rules[0]
			if !reflect.DeepEqual(rule.BlockedEncryptionTypes, original.BlockedEncryptionTypes) {
				t.Fatal("SSE-C restriction lost")
			}
			if mode == models.BucketEncryptionModeSSEKMS && (rule.BucketKeyEnabled == nil || *rule.BucketKeyEnabled) {
				t.Fatal("explicit bucket key false lost")
			}
			if mode == models.BucketEncryptionModeSSES3 && rule.BucketKeyEnabled != nil {
				t.Fatal("KMS-only bucket key sent for SSE-S3")
			}
			if client.encryptionOutput.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm != s3types.ServerSideEncryptionAwsKms {
				t.Fatal("source configuration mutated")
			}
		})
	}
}

func TestAWSDSSEEncryptionSurvivesKMSKeyEdit(t *testing.T) {
	t.Parallel()
	for _, mode := range []models.BucketEncryptionMode{models.BucketEncryptionModeSSEKMS, models.BucketEncryptionModeSSES3} {
		t.Run(string(mode), func(t *testing.T) {
			client := &fakePublicAccessBlockClient{encryptionOutput: &s3.GetBucketEncryptionOutput{ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{Rules: []s3types.ServerSideEncryptionRule{{ApplyServerSideEncryptionByDefault: &s3types.ServerSideEncryptionByDefault{SSEAlgorithm: s3types.ServerSideEncryptionAwsKmsDsse}}}}}}
			adapter := &awsAdapter{newClient: stubAWSClient(client)}
			view, err := adapter.GetEncryption(context.Background(), models.ProfileSecrets{}, "demo")
			if err != nil || view.Mode != models.BucketEncryptionModeSSEKMS || len(view.Warnings) == 0 {
				t.Fatalf("view=%+v err=%v", view, err)
			}
			req := models.BucketEncryptionPutRequest{Mode: mode}
			if mode == models.BucketEncryptionModeSSEKMS {
				req.KMSKeyID = "alias/next"
			}
			if err := adapter.PutEncryption(context.Background(), models.ProfileSecrets{}, "demo", req); err != nil {
				t.Fatal(err)
			}
			got := client.putEncryption.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault
			want := s3types.ServerSideEncryptionAwsKmsDsse
			if mode == models.BucketEncryptionModeSSES3 {
				want = s3types.ServerSideEncryptionAes256
			}
			if got.SSEAlgorithm != want {
				t.Fatalf("algorithm=%s want=%s", got.SSEAlgorithm, want)
			}
			if mode == models.BucketEncryptionModeSSEKMS && (got.KMSMasterKeyID == nil || *got.KMSMasterKeyID != req.KMSKeyID) {
				t.Fatal("key edit lost")
			}
		})
	}
}

func TestAWSUnknownEncryptionBlocksDirectUpdates(t *testing.T) {
	t.Parallel()
	for _, mode := range []models.BucketEncryptionMode{models.BucketEncryptionModeSSES3, models.BucketEncryptionModeSSEKMS} {
		t.Run(string(mode), func(t *testing.T) {
			client := &fakePublicAccessBlockClient{encryptionOutput: &s3.GetBucketEncryptionOutput{ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{Rules: []s3types.ServerSideEncryptionRule{{ApplyServerSideEncryptionByDefault: &s3types.ServerSideEncryptionByDefault{SSEAlgorithm: "future:algorithm"}}}}}}
			adapter := &awsAdapter{newClient: stubAWSClient(client)}
			err := adapter.PutEncryption(context.Background(), models.ProfileSecrets{}, "demo", models.BucketEncryptionPutRequest{Mode: mode})
			var operationErr *OperationError
			if !errors.As(err, &operationErr) || operationErr.Code != "bucket_encryption_unsupported_algorithm" {
				t.Fatalf("err=%v", err)
			}
			if client.putEncryption != nil {
				t.Fatal("unknown algorithm overwritten")
			}
		})
	}
}

func TestAWSLifecycleRejectsAmbiguousOrLossyInput(t *testing.T) {
	t.Parallel()
	for _, raw := range []string{
		`null`, `[] []`, `[null]`,
		`[{"status":"enabled","unknownAction":true}]`,
		`[{"status":"enabled","expiration":{"days":1,"unknownOption":true}}]`,
	} {
		t.Run(raw, func(t *testing.T) {
			client := &fakePublicAccessBlockClient{}
			adapter := &awsAdapter{newClient: stubAWSClient(client)}
			err := adapter.PutLifecycle(context.Background(), models.ProfileSecrets{}, "demo", models.BucketLifecyclePutRequest{Rules: json.RawMessage(raw)})
			if err == nil || client.putLifecycle != nil || client.deleteLifecycle != nil {
				t.Fatalf("err=%v put=%v delete=%v", err, client.putLifecycle, client.deleteLifecycle)
			}
		})
	}
}

func TestAWSLifecyclePreservesFilterText(t *testing.T) {
	t.Parallel()
	for _, prefix := range []string{" ", " reports/ ", "한글/+%2F "} {
		t.Run(prefix, func(t *testing.T) {
			for _, legacy := range []bool{false, true} {
				id := " rule "
				original := s3types.LifecycleRule{ID: &id, Status: s3types.ExpirationStatusEnabled, Expiration: &s3types.LifecycleExpiration{Days: int32Ptr(30)}}
				if legacy {
					//lint:ignore SA1019 Exercise legacy provider responses explicitly.
					original.Prefix = &prefix
				} else {
					original.Filter = &s3types.LifecycleRuleFilter{Prefix: &prefix}
				}
				raw, err := marshalAWSLifecycleRules([]s3types.LifecycleRule{original})
				if err != nil {
					t.Fatal(err)
				}
				rules, err := parseAWSLifecycleRulesJSON(raw)
				if err != nil {
					t.Fatal(err)
				}
				if rules[0].Filter == nil || rules[0].Filter.Prefix == nil || *rules[0].Filter.Prefix != prefix || *rules[0].ID != id {
					t.Fatalf("filter text changed: %s", raw)
				}
			}
		})
	}
	raw := json.RawMessage(`[{"status":"enabled","expiration":{"days":30},"filter":{"and":{"prefix":" ","tags":[{"key":" key ","value":" value "}]}}}]`)
	rules, err := parseAWSLifecycleRulesJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := marshalAWSLifecycleRules(rules)
	if err != nil {
		t.Fatal(err)
	}
	var before, after any
	if err := json.Unmarshal(raw, &before); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(encoded, &after); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatalf("filter changed: %s", encoded)
	}
}

func TestAWSLifecycleSchedulingBoundaries(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		action string
		valid  bool
	}{
		{`"expiration":{"days":0}`, false},
		{`"transitions":[{"days":0,"storageClass":"GLACIER"}]`, true},
		{`"transitions":[{"days":-1,"storageClass":"GLACIER"}]`, false},
		{`"expiration":{"date":"2030-01-01T00:00:00Z"}`, true},
		{`"expiration":{"date":"2030-01-01T09:00:00+09:00"}`, true},
		{`"expiration":{"date":"2030-01-01T00:00:01Z"}`, false},
		{`"transitions":[{"date":"2030-01-01T00:00:00.001Z","storageClass":"GLACIER"}]`, false},
		{`"transitions":[{"date":"2030-01-01T00:00:00Z","storageClass":"GLACIER"}]`, true},
	} {
		t.Run(tc.action, func(t *testing.T) {
			_, err := parseAWSLifecycleRulesJSON(json.RawMessage(`[{"status":"enabled",` + tc.action + `}]`))
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v err=%v", tc.valid, err)
			}
		})
	}
}

func TestAWSLifecycleRejectsConflictingActionCombinations(t *testing.T) {
	t.Parallel()
	for _, fields := range []string{
		`"expiration":{"days":1,"date":"2030-01-01T00:00:00Z"}`,
		`"expiration":{"days":30},"transitions":[{"date":"2030-01-01T00:00:00Z","storageClass":"GLACIER"}]`,
		`"transitions":[{"days":0,"storageClass":"GLACIER"},{"date":"2030-01-01T00:00:00Z","storageClass":"DEEP_ARCHIVE"}]`,
		`"filter":{"tag":{"key":"a","value":"b"}},"abortIncompleteMultipartUpload":{"daysAfterInitiation":1}`,
		`"filter":{"and":{"prefix":"logs/","tags":[{"key":"a","value":"b"}]}},"expiration":{"expiredObjectDeleteMarker":true}`,
	} {
		t.Run(fields, func(t *testing.T) {
			client := &fakePublicAccessBlockClient{}
			adapter := &awsAdapter{newClient: stubAWSClient(client)}
			err := adapter.PutLifecycle(context.Background(), models.ProfileSecrets{}, "demo", models.BucketLifecyclePutRequest{Rules: json.RawMessage(`[{"status":"enabled",` + fields + `}]`)})
			if err == nil || client.putLifecycle != nil || client.deleteLifecycle != nil {
				t.Fatalf("invalid combination reached provider: %v", err)
			}
		})
	}
}

func TestAWSLifecyclePreservesTransitionDefault(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name    string
		out     *s3.GetBucketLifecycleConfigurationOutput
		err     error
		blocked bool
	}{
		{name: "legacy default", out: &s3.GetBucketLifecycleConfigurationOutput{TransitionDefaultMinimumObjectSize: "varies_by_storage_class"}},
		{name: "modern default", out: &s3.GetBucketLifecycleConfigurationOutput{TransitionDefaultMinimumObjectSize: "all_storage_classes_128K"}},
		{name: "missing response", blocked: true},
		{name: "denied", err: &smithy.GenericAPIError{Code: "AccessDenied"}, blocked: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &fakePublicAccessBlockClient{lifecycleOutput: tc.out, lifecycleErr: tc.err}
			adapter := &awsAdapter{newClient: stubAWSClient(client)}
			err := adapter.PutLifecycle(context.Background(), models.ProfileSecrets{}, "demo", models.BucketLifecyclePutRequest{Rules: json.RawMessage(`[{"status":"enabled","expiration":{"days":30}}]`)})
			if (err != nil) != tc.blocked {
				t.Fatalf("err=%v", err)
			}
			if tc.blocked {
				if client.putLifecycle != nil || client.deleteLifecycle != nil {
					t.Fatal("mutation after failed prerequisite read")
				}
			} else if client.putLifecycle == nil || client.putLifecycle.TransitionDefaultMinimumObjectSize != tc.out.TransitionDefaultMinimumObjectSize {
				t.Fatal("transition default lost")
			}
		})
	}
}

func TestAWSLifecycleFilterSizeBounds(t *testing.T) {
	for _, tc := range []struct {
		filter string
		valid  bool
	}{
		{`{"objectSizeGreaterThan":-1}`, false}, {`{"objectSizeLessThan":-1}`, false},
		{`{"objectSizeGreaterThan":0}`, true},
		{`{"and":{"objectSizeGreaterThan":10,"objectSizeLessThan":10}}`, false},
		{`{"and":{"objectSizeGreaterThan":11,"objectSizeLessThan":10}}`, false},
		{`{"and":{"objectSizeGreaterThan":0,"objectSizeLessThan":10}}`, true},
		{`{"and":{"prefix":"logs/"}}`, false},
		{`{"and":{"prefix":"logs/","objectSizeGreaterThan":0}}`, true},
	} {
		t.Run(tc.filter, func(t *testing.T) {
			_, err := parseAWSLifecycleRulesJSON(json.RawMessage(`[{"status":"enabled","expiration":{"days":30},"filter":` + tc.filter + `}]`))
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v err=%v", tc.valid, err)
			}
		})
	}
}

func TestAWSLifecycleTagValueAndUniqueness(t *testing.T) {
	for _, raw := range []string{
		`[{"status":"enabled","expiration":{"days":30},"filter":{"tag":{"key":"empty"}}}]`,
		`[{"status":"enabled","expiration":{"days":30},"filter":{"tag":{"key":"empty","value":""}}}]`,
	} {
		rules, err := parseAWSLifecycleRulesJSON(json.RawMessage(raw))
		if err != nil {
			t.Fatal(err)
		}
		encoded, err := marshalAWSLifecycleRules(rules)
		if err != nil {
			t.Fatal(err)
		}
		var before, after any
		if err := json.Unmarshal([]byte(raw), &before); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(encoded, &after); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(before, after) {
			t.Fatalf("tag value changed: %s", encoded)
		}
	}
	for _, tc := range []struct {
		second string
		valid  bool
	}{{"key", false}, {"Key", true}, {" key", true}} {
		raw := `[{"status":"enabled","expiration":{"days":30},"filter":{"and":{"tags":[{"key":"key"},{"key":"` + tc.second + `"}]}}}]`
		_, err := parseAWSLifecycleRulesJSON(json.RawMessage(raw))
		if (err == nil) != tc.valid {
			t.Fatalf("key=%q err=%v", tc.second, err)
		}
	}
}

func TestAWSLifecycleNoncurrentRetentionBounds(t *testing.T) {
	for _, versions := range []int32{-1, 0, 1, 99, 100, 101} {
		expiration := awsNoncurrentVersionExpirationPayload{NoncurrentDays: int32Ptr(1), NewerNoncurrentVersions: &versions}
		_, err := expiration.toS3(0)
		if (err != nil) != (versions < 1 || versions > 100) {
			t.Fatalf("expiration versions=%d err=%v", versions, err)
		}
		transition := awsNoncurrentVersionTransitionPayload{NoncurrentDays: int32Ptr(1), NewerNoncurrentVersions: &versions, StorageClass: "GLACIER"}
		_, err = transition.toS3(0, 0)
		if (err != nil) != (versions < 1 || versions > 100) {
			t.Fatalf("transition versions=%d err=%v", versions, err)
		}
	}
}

func TestAWSLifecycleRuleCountAndIDs(t *testing.T) {
	for _, n := range []int{1000, 1001} {
		rules := make([]awsLifecycleRulePayload, n)
		for i := range rules {
			rules[i] = awsLifecycleRulePayload{Status: "enabled", Expiration: &awsLifecycleExpirationPayload{Days: int32Ptr(1)}}
		}
		raw, err := json.Marshal(rules)
		if err != nil {
			t.Fatal(err)
		}
		_, err = parseAWSLifecycleRulesJSON(raw)
		if (err == nil) != (n == 1000) {
			t.Fatalf("count=%d err=%v", n, err)
		}
	}
	for _, n := range []int{255, 256} {
		id := ""
		for i := 0; i < n; i++ {
			id += "한"
		}
		_, err := (awsLifecycleRulePayload{ID: id, Status: "enabled", Expiration: &awsLifecycleExpirationPayload{Days: int32Ptr(30)}}).toS3(0)
		if (err == nil) != (n == 255) {
			t.Fatalf("ID length=%d err=%v", n, err)
		}
	}
	_, err := parseAWSLifecycleRulesJSON(json.RawMessage(`[{"id":"same","status":"enabled","expiration":{"days":30}},{"id":"same","status":"disabled","expiration":{"days":30}}]`))
	if err == nil {
		t.Fatal("duplicate IDs accepted")
	}
}

func TestAWSLifecycleDeleteRequiresReadback(t *testing.T) {
	for _, tc := range []struct {
		name               string
		out                *s3.GetBucketLifecycleConfigurationOutput
		readErr, deleteErr error
		wantCode           string
	}{
		{name: "empty", out: &s3.GetBucketLifecycleConfigurationOutput{}},
		{name: "remaining rules", out: &s3.GetBucketLifecycleConfigurationOutput{Rules: []s3types.LifecycleRule{{Status: s3types.ExpirationStatusEnabled}}}, wantCode: "bucket_lifecycle_unconfirmed"},
		{name: "missing response", wantCode: "bucket_lifecycle_unconfirmed"},
		{name: "read failure", readErr: errors.New("read failed"), wantCode: "bucket_lifecycle_unconfirmed"},
		{name: "write failure retained", deleteErr: errors.New("write failed"), readErr: &smithy.GenericAPIError{Code: "NoSuchLifecycleConfiguration"}, wantCode: "bucket_lifecycle_error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &fakePublicAccessBlockClient{lifecycleOutput: tc.out, lifecycleErr: tc.readErr, deleteLifecycleErr: tc.deleteErr}
			adapter := &awsAdapter{newClient: stubAWSClient(client)}
			err := adapter.PutLifecycle(context.Background(), models.ProfileSecrets{}, "demo", models.BucketLifecyclePutRequest{Rules: json.RawMessage(`[]`)})
			var opErr *OperationError
			if tc.wantCode == "" {
				if err != nil {
					t.Fatal(err)
				}
			} else if !errors.As(err, &opErr) || opErr.Code != tc.wantCode {
				t.Fatalf("err=%v want=%s", err, tc.wantCode)
			}
			if len(client.getCalls) != 1 || client.getCalls[0] != "lifecycle" || client.putLifecycle != nil {
				t.Fatalf("unexpected retry or read calls: %v", client.getCalls)
			}
		})
	}
}

func TestAWSLifecycleObservedRuleComparison(t *testing.T) {
	base := s3types.LifecycleRule{Status: s3types.ExpirationStatusEnabled, Filter: &s3types.LifecycleRuleFilter{Prefix: stringPtr("logs/")}, Expiration: &s3types.LifecycleExpiration{Days: int32Ptr(30)}}
	generated := base
	generated.ID = stringPtr("generated")
	explicit := base
	explicit.ID = stringPtr("explicit")
	changed := generated
	changed.Expiration = &s3types.LifecycleExpiration{Days: int32Ptr(31)}
	for _, tc := range []struct {
		name      string
		want, got []s3types.LifecycleRule
		match     bool
	}{
		{"generated ID", []s3types.LifecycleRule{base}, []s3types.LifecycleRule{generated}, true},
		{"order", []s3types.LifecycleRule{base, explicit}, []s3types.LifecycleRule{explicit, generated}, true},
		{"different ID", []s3types.LifecycleRule{explicit}, []s3types.LifecycleRule{generated}, false},
		{"changed action", []s3types.LifecycleRule{base}, []s3types.LifecycleRule{changed}, false},
		{"missing rule", []s3types.LifecycleRule{base}, nil, false},
		{"duplicate counts", []s3types.LifecycleRule{base, base}, []s3types.LifecycleRule{generated, changed}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := awsLifecycleRulesMatch(tc.want, tc.got); got != tc.match {
				t.Fatalf("match=%v want=%v", got, tc.match)
			}
		})
	}
}

type lifecycleReadbackClient struct {
	fakePublicAccessBlockClient
	observed          *s3.GetBucketLifecycleConfigurationOutput
	observeErr        error
	cancelWrite       context.CancelFunc
	readContextErr    error
	readDeadline      time.Time
	readbacks, writes int
}

func (f *lifecycleReadbackClient) GetBucketLifecycleConfiguration(ctx context.Context, in *s3.GetBucketLifecycleConfigurationInput, opts ...func(*s3.Options)) (*s3.GetBucketLifecycleConfigurationOutput, error) {
	if f.putLifecycle != nil {
		f.readbacks++
		f.readContextErr = ctx.Err()
		f.readDeadline, _ = ctx.Deadline()
		return f.observed, f.observeErr
	}
	return f.fakePublicAccessBlockClient.GetBucketLifecycleConfiguration(ctx, in, opts...)
}
func TestAWSLifecycleReplacementUnconfirmed(t *testing.T) {
	for _, tc := range []struct {
		name string
		out  *s3.GetBucketLifecycleConfigurationOutput
		err  error
	}{
		{name: "missing"}, {name: "empty", out: &s3.GetBucketLifecycleConfigurationOutput{}}, {name: "read error", err: errors.New("read failure")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &lifecycleReadbackClient{fakePublicAccessBlockClient: fakePublicAccessBlockClient{lifecycleErr: &smithy.GenericAPIError{Code: "NoSuchLifecycleConfiguration"}}, observed: tc.out, observeErr: tc.err}
			adapter := &awsAdapter{newClient: stubAWSClient(client)}
			err := adapter.PutLifecycle(context.Background(), models.ProfileSecrets{}, "demo", models.BucketLifecyclePutRequest{Rules: json.RawMessage(`[{"status":"enabled","expiration":{"days":30}}]`)})
			var opErr *OperationError
			if !errors.As(err, &opErr) || opErr.Code != "bucket_lifecycle_unconfirmed" {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func (f *lifecycleReadbackClient) PutBucketLifecycleConfiguration(ctx context.Context, in *s3.PutBucketLifecycleConfigurationInput, opts ...func(*s3.Options)) (*s3.PutBucketLifecycleConfigurationOutput, error) {
	f.writes++
	if f.cancelWrite != nil {
		f.cancelWrite()
	}
	return f.fakePublicAccessBlockClient.PutBucketLifecycleConfiguration(ctx, in, opts...)
}
func TestAWSLifecycleWriteErrorStillObservesAfterCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	rules := []s3types.LifecycleRule{{Status: s3types.ExpirationStatusEnabled, Expiration: &s3types.LifecycleExpiration{Days: int32Ptr(30)}}}
	client := &lifecycleReadbackClient{
		fakePublicAccessBlockClient: fakePublicAccessBlockClient{lifecycleErr: &smithy.GenericAPIError{Code: "NoSuchLifecycleConfiguration"}, putLifecycleErr: context.Canceled},
		cancelWrite:                 cancel, observed: &s3.GetBucketLifecycleConfigurationOutput{Rules: rules},
	}
	adapter := &awsAdapter{newClient: stubAWSClient(client)}
	err := adapter.PutLifecycle(ctx, models.ProfileSecrets{}, "demo", models.BucketLifecyclePutRequest{Rules: json.RawMessage(`[{"status":"enabled","expiration":{"days":30}}]`)})
	var opErr *OperationError
	if !errors.As(err, &opErr) || opErr.Code != "bucket_lifecycle_error" {
		t.Fatalf("write error was not retained: %v", err)
	}
	if client.readbacks != 1 || client.writes != 1 || client.readContextErr != nil {
		t.Fatalf("reads=%d writes=%d readErr=%v", client.readbacks, client.writes, client.readContextErr)
	}
	if client.readDeadline.IsZero() || time.Until(client.readDeadline) <= 0 || time.Until(client.readDeadline) > 10*time.Second {
		t.Fatal("readback deadline missing or unbounded")
	}
}

func TestAWSOwnershipWriteRequiresObservedMode(t *testing.T) {
	for _, tc := range []struct {
		name    string
		mode    s3types.ObjectOwnership
		readErr error
	}{
		{name: "different", mode: s3types.ObjectOwnershipBucketOwnerEnforced},
		{name: "missing"}, {name: "read failure", readErr: errors.New("read failed")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &fakePublicAccessBlockClient{ownershipErr: tc.readErr}
			if tc.mode != "" {
				client.ownershipOutput = &s3.GetBucketOwnershipControlsOutput{OwnershipControls: &s3types.OwnershipControls{Rules: []s3types.OwnershipControlsRule{{ObjectOwnership: tc.mode}}}}
			}
			adapter := &awsAdapter{newClient: stubAWSClient(client)}
			mode := models.BucketObjectOwnershipObjectWriter
			err := adapter.PutAccess(context.Background(), models.ProfileSecrets{}, "demo", models.BucketAccessPutRequest{ObjectOwnership: &mode})
			var opErr *OperationError
			if !errors.As(err, &opErr) || opErr.Code != "bucket_access_unconfirmed" {
				t.Fatalf("err=%v", err)
			}
		})
	}
}

func TestAWSMissingPublicAccessBlockIsNotPublic(t *testing.T) {
	for _, out := range []*s3.GetPublicAccessBlockOutput{nil, {}} {
		adapter := &awsAdapter{newClient: stubAWSClient(&fakePublicAccessBlockClient{getOutput: out})}
		view, err := adapter.GetPublicExposure(context.Background(), models.ProfileSecrets{}, "demo")
		if err == nil || view.BlockPublicAccess != nil {
			t.Fatalf("view=%+v err=%v", view, err)
		}
	}
}

type mismatchedPublicAccessClient struct{ fakePublicAccessBlockClient }

func (f *mismatchedPublicAccessClient) GetPublicAccessBlock(context.Context, *s3.GetPublicAccessBlockInput, ...func(*s3.Options)) (*s3.GetPublicAccessBlockOutput, error) {
	return &s3.GetPublicAccessBlockOutput{PublicAccessBlockConfiguration: &s3types.PublicAccessBlockConfiguration{BlockPublicAcls: boolPtr(true), IgnorePublicAcls: boolPtr(true), BlockPublicPolicy: boolPtr(true), RestrictPublicBuckets: boolPtr(false)}}, nil
}
func TestAWSPublicAccessWriteRejectsPartialMatch(t *testing.T) {
	client := &mismatchedPublicAccessClient{}
	adapter := &awsAdapter{newClient: stubAWSClient(client)}
	err := adapter.PutPublicExposure(context.Background(), models.ProfileSecrets{}, "demo", models.BucketPublicExposurePutRequest{Mode: models.BucketPublicExposureModePrivate})
	var opErr *OperationError
	if !errors.As(err, &opErr) || opErr.Code != "bucket_public_exposure_unconfirmed" {
		t.Fatalf("err=%v", err)
	}
}

func TestAWSPublicAccessBlockMissingFlagIsUnknown(t *testing.T) {
	for missing := 0; missing < 4; missing++ {
		flags := []*bool{boolPtr(false), boolPtr(false), boolPtr(false), boolPtr(false)}
		flags[missing] = nil
		client := &fakePublicAccessBlockClient{getOutput: &s3.GetPublicAccessBlockOutput{PublicAccessBlockConfiguration: &s3types.PublicAccessBlockConfiguration{BlockPublicAcls: flags[0], IgnorePublicAcls: flags[1], BlockPublicPolicy: flags[2], RestrictPublicBuckets: flags[3]}}}
		adapter := &awsAdapter{newClient: stubAWSClient(client)}
		view, err := adapter.GetPublicExposure(context.Background(), models.ProfileSecrets{}, "demo")
		if err == nil || view.BlockPublicAccess != nil {
			t.Fatalf("missing flag=%d view=%+v err=%v", missing, view, err)
		}
	}
}

func TestAWSLifecycleRequiresActionAndPreservesNoncurrentFilter(t *testing.T) {
	for _, status := range []string{"enabled", "disabled"} {
		if _, err := parseAWSLifecycleRulesJSON(json.RawMessage(`[{"status":"` + status + `","transitions":[]}]`)); err == nil {
			t.Fatalf("actionless %s rule accepted", status)
		}
	}
	for _, action := range []string{
		`"expiration":{"days":1}`,
		`"transitions":[{"days":0,"storageClass":"STANDARD_IA"}]`,
		`"transitions":[{"days":0,"storageClass":"ONEZONE_IA"}]`,
		`"abortIncompleteMultipartUpload":{"daysAfterInitiation":1}`,
		`"noncurrentVersionExpiration":{"noncurrentDays":1,"newerNoncurrentVersions":1}`,
		`"noncurrentVersionTransitions":[{"noncurrentDays":1,"newerNoncurrentVersions":100,"storageClass":"GLACIER"}]`,
	} {
		rules, err := parseAWSLifecycleRulesJSON(json.RawMessage(`[{"status":"enabled",` + action + `}]`))
		if err != nil {
			t.Fatalf("%s: %v", action, err)
		}
		if rules[0].Filter == nil {
			t.Fatalf("required Filter missing: %s", action)
		}
	}
}
