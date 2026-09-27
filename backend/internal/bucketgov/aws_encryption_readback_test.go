package bucketgov

import (
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"s3desk/internal/models"
)

type encryptionReadbackClient struct {
	fakePublicAccessBlockClient
	reads, writes int
	observe       func(*s3.GetBucketEncryptionOutput) (*s3.GetBucketEncryptionOutput, error)
	cancel        context.CancelFunc
	t             *testing.T
}

func (c *encryptionReadbackClient) GetBucketEncryption(ctx context.Context, in *s3.GetBucketEncryptionInput, opts ...func(*s3.Options)) (*s3.GetBucketEncryptionOutput, error) {
	c.reads++
	if c.reads == 1 {
		return c.encryptionOutput, nil
	}
	if ctx.Err() != nil {
		c.t.Fatal("readback inherited cancellation")
	}
	if _, ok := ctx.Deadline(); !ok {
		c.t.Fatal("readback has no deadline")
	}
	rule := c.putEncryption.ServerSideEncryptionConfiguration.Rules[0]
	def := *rule.ApplyServerSideEncryptionByDefault
	rule.ApplyServerSideEncryptionByDefault = &def
	out := &s3.GetBucketEncryptionOutput{ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{Rules: []s3types.ServerSideEncryptionRule{rule}}}
	return c.observe(out)
}
func (c *encryptionReadbackClient) PutBucketEncryption(ctx context.Context, in *s3.PutBucketEncryptionInput, opts ...func(*s3.Options)) (*s3.PutBucketEncryptionOutput, error) {
	c.writes++
	c.cancel()
	return c.fakePublicAccessBlockClient.PutBucketEncryption(ctx, in, opts...)
}

func TestAWSEncryptionReadback(t *testing.T) {
	for _, name := range []string{"match", "algorithm", "key", "bucket key", "restriction", "missing", "read error", "write error"} {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			c := &encryptionReadbackClient{t: t, cancel: cancel}
			c.encryptionOutput = &s3.GetBucketEncryptionOutput{ServerSideEncryptionConfiguration: &s3types.ServerSideEncryptionConfiguration{Rules: []s3types.ServerSideEncryptionRule{{
				ApplyServerSideEncryptionByDefault: &s3types.ServerSideEncryptionByDefault{SSEAlgorithm: s3types.ServerSideEncryptionAwsKmsDsse},
				BucketKeyEnabled:                   boolPtr(true),
				BlockedEncryptionTypes:             &s3types.BlockedEncryptionTypes{EncryptionType: []s3types.EncryptionType{"SSE-C"}},
			}}}}
			c.observe = func(out *s3.GetBucketEncryptionOutput) (*s3.GetBucketEncryptionOutput, error) {
				rule := &out.ServerSideEncryptionConfiguration.Rules[0]
				switch name {
				case "algorithm":
					rule.ApplyServerSideEncryptionByDefault.SSEAlgorithm = s3types.ServerSideEncryptionAwsKms
				case "key":
					rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID = nil
				case "bucket key":
					rule.BucketKeyEnabled = boolPtr(false)
				case "restriction":
					rule.BlockedEncryptionTypes = nil
				case "missing":
					return nil, nil
				case "read error", "write error":
					return nil, errors.New("read failed")
				}
				return out, nil
			}
			if name == "write error" {
				c.putEncryptionErr = errors.New("write failed")
			}
			adapter := &awsAdapter{newClient: stubAWSClient(c)}
			err := adapter.PutEncryption(ctx, models.ProfileSecrets{}, "demo", models.BucketEncryptionPutRequest{Mode: models.BucketEncryptionModeSSEKMS, KMSKeyID: "alias/next"})
			if name == "match" {
				if err != nil {
					t.Fatal(err)
				}
			} else {
				want := "bucket_encryption_unconfirmed"
				if name == "write error" {
					want = "bucket_encryption_error"
				}
				var op *OperationError
				if !errors.As(err, &op) || op.Code != want {
					t.Fatalf("err=%v want=%s", err, want)
				}
			}
			if c.reads != 2 || c.writes != 1 {
				t.Fatalf("reads=%d writes=%d", c.reads, c.writes)
			}
		})
	}
}

func TestAWSEncryptionReadbackOmittedBucketKey(t *testing.T) {
	want := s3types.ServerSideEncryptionRule{ApplyServerSideEncryptionByDefault: &s3types.ServerSideEncryptionByDefault{SSEAlgorithm: s3types.ServerSideEncryptionAes256}}
	got := want
	got.BucketKeyEnabled = boolPtr(false)
	if !sameAWSEncryptionRule(want, got) {
		t.Fatal("omitted and false Bucket Key flags differ")
	}
}
