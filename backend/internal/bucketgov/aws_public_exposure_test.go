package bucketgov

import (
	"context"
	"net/http"
	"testing"

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
}

func (f *fakePublicAccessBlockClient) GetPublicAccessBlock(_ context.Context, _ *s3.GetPublicAccessBlockInput, _ ...func(*s3.Options)) (*s3.GetPublicAccessBlockOutput, error) {
	return f.getOutput, f.getErr
}

func (f *fakePublicAccessBlockClient) PutPublicAccessBlock(_ context.Context, input *s3.PutPublicAccessBlockInput, _ ...func(*s3.Options)) (*s3.PutPublicAccessBlockOutput, error) {
	f.putInput = input
	if f.putErr != nil {
		return nil, f.putErr
	}
	return &s3.PutPublicAccessBlockOutput{}, nil
}

func (f *fakePublicAccessBlockClient) GetBucketOwnershipControls(_ context.Context, _ *s3.GetBucketOwnershipControlsInput, _ ...func(*s3.Options)) (*s3.GetBucketOwnershipControlsOutput, error) {
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
	return f.lifecycleOutput, f.lifecycleErr
}

func (f *fakePublicAccessBlockClient) PutBucketLifecycleConfiguration(_ context.Context, input *s3.PutBucketLifecycleConfigurationInput, _ ...func(*s3.Options)) (*s3.PutBucketLifecycleConfigurationOutput, error) {
	f.putLifecycle = input
	if f.putLifecycleErr != nil {
		return nil, f.putLifecycleErr
	}
	return &s3.PutBucketLifecycleConfigurationOutput{}, nil
}

func (f *fakePublicAccessBlockClient) DeleteBucketLifecycle(_ context.Context, input *s3.DeleteBucketLifecycleInput, _ ...func(*s3.Options)) (*s3.DeleteBucketLifecycleOutput, error) {
	f.deleteLifecycle = input
	if f.deleteLifecycleErr != nil {
		return nil, f.deleteLifecycleErr
	}
	return &s3.DeleteBucketLifecycleOutput{}, nil
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
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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

func TestAWSAdapterGetAccessDefaultsToBucketOwnerEnforced(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{
		ownershipErr: &smithy.GenericAPIError{Code: "OwnershipControlsNotFoundError", Message: "missing"},
	}
	adapter := &awsAdapter{
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
	}

	view, err := adapter.GetAccess(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetAccess err=%v", err)
	}
	if view.ObjectOwnership == nil || view.ObjectOwnership.Mode != models.BucketObjectOwnershipBucketOwnerEnforced {
		t.Fatalf("objectOwnership=%+v, want bucket_owner_enforced", view.ObjectOwnership)
	}
}

func TestAWSAdapterPutAccess(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{}
	adapter := &awsAdapter{
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
	}

	view, err := adapter.GetVersioning(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetVersioning err=%v", err)
	}
	if view.Status != models.BucketVersioningStatusDisabled {
		t.Fatalf("status=%q, want %q", view.Status, models.BucketVersioningStatusDisabled)
	}
}

func TestAWSAdapterPutVersioning(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{}
	adapter := &awsAdapter{
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
					Prefix: stringPtr("logs/"),
					Expiration: &s3types.LifecycleExpiration{
						Days: int32Ptr(30),
					},
				},
			},
		},
	}
	adapter := &awsAdapter{
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
	}

	view, err := adapter.GetLifecycle(context.Background(), models.ProfileSecrets{}, "demo")
	if err != nil {
		t.Fatalf("GetLifecycle err=%v", err)
	}
	if got := string(view.Rules); got != `[]` {
		t.Fatalf("rules=%s, want []", got)
	}
}

func TestAWSAdapterPutLifecycle(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{}
	adapter := &awsAdapter{
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
	if rule.Prefix == nil || *rule.Prefix != "logs/" {
		t.Fatalf("rule.Prefix=%v, want logs/", rule.Prefix)
	}
	if rule.Expiration == nil || rule.Expiration.Days == nil || *rule.Expiration.Days != 30 {
		t.Fatalf("rule.Expiration=%+v, want days=30", rule.Expiration)
	}
}

func TestAWSAdapterPutLifecycleDeletesWhenRulesEmpty(t *testing.T) {
	t.Parallel()

	client := &fakePublicAccessBlockClient{}
	adapter := &awsAdapter{
		newClient: func(models.ProfileSecrets) awsPublicAccessBlockClient { return client },
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
