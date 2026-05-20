package api

import "s3desk/internal/profileendpoint"

func validateProfileTLSSkipVerifyEndpoint(field string, raw *string, allowRemote bool) error {
	return profileendpoint.ValidateTLSSkipVerifyEndpoint(field, raw, allowRemote)
}

func validateProfileEndpointURL(field string, raw *string, allowRemote bool) error {
	return profileendpoint.ValidateURL(field, raw, allowRemote)
}
