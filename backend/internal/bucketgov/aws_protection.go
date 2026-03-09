package bucketgov

import (
	"context"

	"s3desk/internal/models"
)

func (a *awsAdapter) GetProtection(context.Context, models.ProfileSecrets, string) (models.BucketProtectionView, error) {
	return models.BucketProtectionView{}, UnsupportedOperationError{Provider: models.ProfileProviderAwsS3, Section: "protection"}
}

func (a *awsAdapter) PutProtection(context.Context, models.ProfileSecrets, string, models.BucketProtectionPutRequest) error {
	return UnsupportedOperationError{Provider: models.ProfileProviderAwsS3, Section: "protection"}
}
