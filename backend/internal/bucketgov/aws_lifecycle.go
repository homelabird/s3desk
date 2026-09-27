package bucketgov

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"

	"s3desk/internal/models"
)

var emptyLifecycleRulesJSON = json.RawMessage("[]")

type awsLifecycleRulePayload struct {
	ID                             string                                    `json:"id,omitempty"`
	Status                         string                                    `json:"status"`
	Filter                         *awsLifecycleFilterPayload                `json:"filter,omitempty"`
	Prefix                         string                                    `json:"prefix,omitempty"`
	Expiration                     *awsLifecycleExpirationPayload            `json:"expiration,omitempty"`
	Transitions                    []awsLifecycleTransitionPayload           `json:"transitions,omitempty"`
	AbortIncompleteMultipartUpload *awsAbortIncompleteMultipartUploadPayload `json:"abortIncompleteMultipartUpload,omitempty"`
	NoncurrentVersionExpiration    *awsNoncurrentVersionExpirationPayload    `json:"noncurrentVersionExpiration,omitempty"`
	NoncurrentVersionTransitions   []awsNoncurrentVersionTransitionPayload   `json:"noncurrentVersionTransitions,omitempty"`
}

type awsLifecycleFilterPayload struct {
	Prefix                string                  `json:"prefix,omitempty"`
	Tag                   *awsLifecycleTagPayload `json:"tag,omitempty"`
	And                   *awsLifecycleAndPayload `json:"and,omitempty"`
	ObjectSizeGreaterThan *int64                  `json:"objectSizeGreaterThan,omitempty"`
	ObjectSizeLessThan    *int64                  `json:"objectSizeLessThan,omitempty"`
}

type awsLifecycleAndPayload struct {
	Prefix                string                   `json:"prefix,omitempty"`
	Tags                  []awsLifecycleTagPayload `json:"tags,omitempty"`
	ObjectSizeGreaterThan *int64                   `json:"objectSizeGreaterThan,omitempty"`
	ObjectSizeLessThan    *int64                   `json:"objectSizeLessThan,omitempty"`
}

type awsLifecycleTagPayload struct {
	Key   string  `json:"key"`
	Value *string `json:"value,omitempty"`
}

type awsLifecycleExpirationPayload struct {
	Days                      *int32 `json:"days,omitempty"`
	Date                      string `json:"date,omitempty"`
	ExpiredObjectDeleteMarker *bool  `json:"expiredObjectDeleteMarker,omitempty"`
}

type awsLifecycleTransitionPayload struct {
	Days         *int32 `json:"days,omitempty"`
	Date         string `json:"date,omitempty"`
	StorageClass string `json:"storageClass"`
}

type awsAbortIncompleteMultipartUploadPayload struct {
	DaysAfterInitiation *int32 `json:"daysAfterInitiation,omitempty"`
}

type awsNoncurrentVersionExpirationPayload struct {
	NoncurrentDays          *int32 `json:"noncurrentDays,omitempty"`
	NewerNoncurrentVersions *int32 `json:"newerNoncurrentVersions,omitempty"`
}

type awsNoncurrentVersionTransitionPayload struct {
	NoncurrentDays          *int32 `json:"noncurrentDays,omitempty"`
	NewerNoncurrentVersions *int32 `json:"newerNoncurrentVersions,omitempty"`
	StorageClass            string `json:"storageClass"`
}

func (a *awsAdapter) GetLifecycle(ctx context.Context, profile models.ProfileSecrets, bucket string) (models.BucketLifecycleView, error) {
	client, err := a.clientFor(profile, bucket)
	if err != nil {
		return models.BucketLifecycleView{}, err
	}
	out, err := client.GetBucketLifecycleConfiguration(ctx, &s3.GetBucketLifecycleConfigurationInput{
		Bucket: &bucket,
	})
	if err != nil {
		if isAWSAPICode(err, "NoSuchLifecycleConfiguration") {
			return newAWSLifecycleView(bucket, emptyLifecycleRulesJSON), nil
		}
		return models.BucketLifecycleView{}, mapAWSLifecycleError(err, bucket, "get")
	}

	if out == nil {
		return models.BucketLifecycleView{}, mapAWSLifecycleError(errors.New("missing lifecycle response"), bucket, "get")
	}
	rulesJSON, err := marshalAWSLifecycleRules(out.Rules)
	if err != nil {
		return models.BucketLifecycleView{}, err
	}
	return newAWSLifecycleView(bucket, rulesJSON), nil
}

func (a *awsAdapter) PutLifecycle(ctx context.Context, profile models.ProfileSecrets, bucket string, req models.BucketLifecyclePutRequest) error {
	rules, err := parseAWSLifecycleRulesJSON(req.Rules)
	if err != nil {
		return err
	}

	client, err := a.clientFor(profile, bucket)
	if err != nil {
		return err
	}
	if len(rules) == 0 {
		_, deleteErr := client.DeleteBucketLifecycle(ctx, &s3.DeleteBucketLifecycleInput{
			Bucket: &bucket,
		})
		readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		observed, readErr := client.GetBucketLifecycleConfiguration(readCtx, &s3.GetBucketLifecycleConfigurationInput{Bucket: &bucket})
		if deleteErr != nil {
			return mapAWSLifecycleError(deleteErr, bucket, "delete")
		}
		if !isAWSAPICode(readErr, "NoSuchLifecycleConfiguration") && (readErr != nil || observed == nil || len(observed.Rules) != 0) {
			return &OperationError{
				Status: http.StatusBadGateway, Code: "bucket_lifecycle_unconfirmed",
				Message: "Lifecycle deletion was accepted but current state did not confirm removal; reload before retrying",
				Details: map[string]any{"bucket": bucket},
			}
		}
		return nil
	}

	current, readErr := client.GetBucketLifecycleConfiguration(ctx, &s3.GetBucketLifecycleConfigurationInput{Bucket: &bucket})
	var minimumSize s3types.TransitionDefaultMinimumObjectSize
	if readErr != nil {
		if !isAWSAPICode(readErr, "NoSuchLifecycleConfiguration") {
			return mapAWSLifecycleError(readErr, bucket, "get")
		}
	} else if current == nil {
		return mapAWSLifecycleError(errors.New("missing lifecycle response"), bucket, "get")
	} else {
		minimumSize = current.TransitionDefaultMinimumObjectSize
	}
	_, putErr := client.PutBucketLifecycleConfiguration(ctx, &s3.PutBucketLifecycleConfigurationInput{
		Bucket:                             &bucket,
		TransitionDefaultMinimumObjectSize: minimumSize,
		LifecycleConfiguration: &s3types.BucketLifecycleConfiguration{
			Rules: rules,
		},
	})
	readCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	observed, observeErr := client.GetBucketLifecycleConfiguration(readCtx, &s3.GetBucketLifecycleConfigurationInput{Bucket: &bucket})
	if putErr != nil {
		return mapAWSLifecycleError(putErr, bucket, "put")
	}
	if observeErr != nil || observed == nil || !awsLifecycleRulesMatch(rules, observed.Rules) || (minimumSize != "" && observed.TransitionDefaultMinimumObjectSize != minimumSize) {
		return &OperationError{Status: http.StatusBadGateway, Code: "bucket_lifecycle_unconfirmed", Message: "Lifecycle update was accepted but current state did not confirm the request; reload before retrying", Details: map[string]any{"bucket": bucket}}
	}
	return nil
}

func (a *awsAdapter) GetSharing(context.Context, models.ProfileSecrets, string) (models.BucketSharingView, error) {
	return models.BucketSharingView{}, UnsupportedOperationError{Provider: models.ProfileProviderAwsS3, Section: "sharing"}
}

func (a *awsAdapter) PutSharing(context.Context, models.ProfileSecrets, string, models.BucketSharingPutRequest) (models.BucketSharingView, error) {
	return models.BucketSharingView{}, UnsupportedOperationError{Provider: models.ProfileProviderAwsS3, Section: "sharing"}
}

func newAWSLifecycleView(bucket string, rules json.RawMessage) models.BucketLifecycleView {
	if len(bytes.TrimSpace(rules)) == 0 {
		rules = emptyLifecycleRulesJSON
	}
	return models.BucketLifecycleView{
		Provider: models.ProfileProviderAwsS3,
		Bucket:   strings.TrimSpace(bucket),
		Rules:    rules,
	}
}

func marshalAWSLifecycleRules(rules []s3types.LifecycleRule) (json.RawMessage, error) {
	if len(rules) == 0 {
		return emptyLifecycleRulesJSON, nil
	}
	payload := make([]awsLifecycleRulePayload, 0, len(rules))
	for idx, rule := range rules {
		item, err := awsLifecycleRuleFromS3(rule, idx)
		if err != nil {
			return nil, err
		}
		payload = append(payload, item)
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, &OperationError{
			Status:  http.StatusBadGateway,
			Code:    "bucket_lifecycle_marshal_error",
			Message: "failed to encode bucket lifecycle rules",
		}
	}
	return raw, nil
}

func parseAWSLifecycleRulesJSON(raw json.RawMessage) ([]s3types.LifecycleRule, error) {
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil, RequiredFieldError("rules", map[string]any{"section": "lifecycle"})
	}

	var payload []awsLifecycleRulePayload
	if !json.Valid(raw) {
		return nil, InvalidFieldError("rules", "rules must be a single valid JSON array", nil)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return nil, InvalidFieldError("rules", "rules must be a JSON array of AWS lifecycle rules", map[string]any{
			"section": "lifecycle",
			"error":   err.Error(),
		})
	}
	if payload == nil {
		return nil, InvalidFieldError("rules", "rules must be an array; use [] explicitly to delete lifecycle rules", nil)
	}

	if len(payload) > 1000 {
		return nil, InvalidFieldError("rules", "at most 1000 lifecycle rules are allowed", nil)
	}
	ids := make(map[string]struct{}, len(payload))
	rules := make([]s3types.LifecycleRule, 0, len(payload))
	for idx, item := range payload {
		if item.ID != "" {
			if _, exists := ids[item.ID]; exists {
				return nil, lifecycleFieldError(idx, "id", "rule IDs must be unique", nil)
			}
			ids[item.ID] = struct{}{}
		}
		rule, err := item.toS3(idx)
		if err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}
	return rules, nil
}

func (p awsLifecycleRulePayload) toS3(ruleIndex int) (s3types.LifecycleRule, error) {
	status, err := parseAWSLifecycleStatus(p.Status)
	if err != nil {
		return s3types.LifecycleRule{}, lifecycleFieldError(ruleIndex, "status", err.Error(), map[string]any{
			"allowed": []string{"enabled", "disabled"},
			"value":   strings.TrimSpace(p.Status),
		})
	}

	rule := s3types.LifecycleRule{Status: status}
	if utf8.RuneCountInString(p.ID) > 255 {
		return s3types.LifecycleRule{}, lifecycleFieldError(ruleIndex, "id", "rule ID must not exceed 255 characters", nil)
	}
	if id := p.ID; id != "" {
		rule.ID = &id
	}

	if p.Prefix != "" && p.Filter != nil {
		return s3types.LifecycleRule{}, lifecycleFieldError(ruleIndex, "filter", "filter cannot be used together with prefix", nil)
	}

	switch {
	case p.Filter != nil:
		filter, allObjects, err := p.Filter.toS3(ruleIndex)
		if err != nil {
			return s3types.LifecycleRule{}, err
		}
		if allObjects {
			emptyPrefix := ""
			rule.Filter = &s3types.LifecycleRuleFilter{Prefix: &emptyPrefix}
		} else {
			rule.Filter = filter
		}
	case p.Prefix != "":
		prefix := p.Prefix
		rule.Filter = &s3types.LifecycleRuleFilter{Prefix: &prefix}
	default:
		emptyPrefix := ""
		rule.Filter = &s3types.LifecycleRuleFilter{Prefix: &emptyPrefix}
	}

	if p.Expiration != nil {
		value, err := p.Expiration.toS3(ruleIndex)
		if err != nil {
			return s3types.LifecycleRule{}, err
		}
		rule.Expiration = value
	}

	if p.AbortIncompleteMultipartUpload != nil {
		value, err := p.AbortIncompleteMultipartUpload.toS3(ruleIndex)
		if err != nil {
			return s3types.LifecycleRule{}, err
		}
		rule.AbortIncompleteMultipartUpload = value
	}

	if p.NoncurrentVersionExpiration != nil {
		value, err := p.NoncurrentVersionExpiration.toS3(ruleIndex)
		if err != nil {
			return s3types.LifecycleRule{}, err
		}
		rule.NoncurrentVersionExpiration = value
	}

	if len(p.Transitions) > 0 {
		rule.Transitions = make([]s3types.Transition, 0, len(p.Transitions))
		for idx, item := range p.Transitions {
			value, err := item.toS3(ruleIndex, idx)
			if err != nil {
				return s3types.LifecycleRule{}, err
			}
			rule.Transitions = append(rule.Transitions, value)
		}
	}

	if len(p.NoncurrentVersionTransitions) > 0 {
		rule.NoncurrentVersionTransitions = make([]s3types.NoncurrentVersionTransition, 0, len(p.NoncurrentVersionTransitions))
		for idx, item := range p.NoncurrentVersionTransitions {
			value, err := item.toS3(ruleIndex, idx)
			if err != nil {
				return s3types.LifecycleRule{}, err
			}
			rule.NoncurrentVersionTransitions = append(rule.NoncurrentVersionTransitions, value)
		}
	}

	if rule.Expiration == nil && rule.AbortIncompleteMultipartUpload == nil && rule.NoncurrentVersionExpiration == nil && len(rule.Transitions) == 0 && len(rule.NoncurrentVersionTransitions) == 0 {
		return s3types.LifecycleRule{}, lifecycleFieldError(ruleIndex, "actions", "at least one lifecycle action is required", nil)
	}

	hasDays, hasDate := false, false
	if rule.Expiration != nil {
		hasDays = rule.Expiration.Days != nil
		hasDate = rule.Expiration.Date != nil
	}
	for _, transition := range rule.Transitions {
		hasDays = hasDays || transition.Days != nil
		hasDate = hasDate || transition.Date != nil
	}
	if hasDays && hasDate {
		return s3types.LifecycleRule{}, lifecycleFieldError(ruleIndex, "schedule", "date and days cannot be combined in the same rule", nil)
	}
	hasTags := rule.Filter != nil && (rule.Filter.Tag != nil || (rule.Filter.And != nil && len(rule.Filter.And.Tags) > 0))
	if hasTags && (rule.AbortIncompleteMultipartUpload != nil || (rule.Expiration != nil && rule.Expiration.ExpiredObjectDeleteMarker != nil)) {
		return s3types.LifecycleRule{}, lifecycleFieldError(ruleIndex, "filter", "tag filters cannot be combined with abortIncompleteMultipartUpload or expiredObjectDeleteMarker", nil)
	}
	return rule, nil
}

func awsLifecycleRuleFromS3(rule s3types.LifecycleRule, ruleIndex int) (awsLifecycleRulePayload, error) {
	payload := awsLifecycleRulePayload{
		Status: formatAWSLifecycleStatus(rule.Status),
	}
	if payload.Status == "" {
		return awsLifecycleRulePayload{}, lifecycleFieldError(ruleIndex, "status", "status is required", nil)
	}
	if rule.ID != nil {
		payload.ID = *rule.ID
	}
	//lint:ignore SA1019 Legacy S3 responses still use Prefix; preserve their scope on edits.
	if rule.Filter == nil && rule.Prefix != nil {
		//lint:ignore SA1019 Preserve legacy rule prefixes rather than widening their scope.
		payload.Prefix = *rule.Prefix
	}
	if rule.Filter != nil {
		if rule.Filter.Prefix != nil && *rule.Filter.Prefix != "" {
			prefix := *rule.Filter.Prefix
			payload.Prefix = prefix
		} else {
			filterPayload, err := awsLifecycleFilterFromS3(rule.Filter, ruleIndex)
			if err != nil {
				return awsLifecycleRulePayload{}, err
			}
			payload.Filter = filterPayload
		}
	}
	if rule.Expiration != nil {
		payload.Expiration = awsLifecycleExpirationFromS3(*rule.Expiration)
	}
	if rule.AbortIncompleteMultipartUpload != nil {
		payload.AbortIncompleteMultipartUpload = awsAbortIncompleteMultipartUploadFromS3(*rule.AbortIncompleteMultipartUpload)
	}
	if rule.NoncurrentVersionExpiration != nil {
		payload.NoncurrentVersionExpiration = awsNoncurrentVersionExpirationFromS3(*rule.NoncurrentVersionExpiration)
	}
	if len(rule.Transitions) > 0 {
		payload.Transitions = make([]awsLifecycleTransitionPayload, 0, len(rule.Transitions))
		for _, item := range rule.Transitions {
			payload.Transitions = append(payload.Transitions, awsLifecycleTransitionFromS3(item))
		}
	}
	if len(rule.NoncurrentVersionTransitions) > 0 {
		payload.NoncurrentVersionTransitions = make([]awsNoncurrentVersionTransitionPayload, 0, len(rule.NoncurrentVersionTransitions))
		for _, item := range rule.NoncurrentVersionTransitions {
			payload.NoncurrentVersionTransitions = append(payload.NoncurrentVersionTransitions, awsNoncurrentVersionTransitionFromS3(item))
		}
	}
	return payload, nil
}

func (p *awsLifecycleFilterPayload) toS3(ruleIndex int) (*s3types.LifecycleRuleFilter, bool, error) {
	if p == nil {
		return nil, true, nil
	}

	if err := validateLifecycleSizes(ruleIndex, "filter", p.ObjectSizeGreaterThan, p.ObjectSizeLessThan); err != nil {
		return nil, false, err
	}
	count := 0
	if p.Prefix != "" {
		count++
	}
	if p.Tag != nil {
		count++
	}
	if p.And != nil {
		count++
	}
	if p.ObjectSizeGreaterThan != nil {
		count++
	}
	if p.ObjectSizeLessThan != nil {
		count++
	}
	if count == 0 {
		return nil, true, nil
	}
	if count > 1 {
		return nil, false, lifecycleFieldError(ruleIndex, "filter", "filter must specify exactly one predicate", nil)
	}

	switch {
	case p.Prefix != "":
		prefix := p.Prefix
		return &s3types.LifecycleRuleFilter{Prefix: &prefix}, false, nil
	case p.Tag != nil:
		tag, err := p.Tag.toS3(ruleIndex, "filter.tag")
		if err != nil {
			return nil, false, err
		}
		return &s3types.LifecycleRuleFilter{Tag: &tag}, false, nil
	case p.And != nil:
		and, err := p.And.toS3(ruleIndex)
		if err != nil {
			return nil, false, err
		}
		return &s3types.LifecycleRuleFilter{And: &and}, false, nil
	case p.ObjectSizeGreaterThan != nil:
		return &s3types.LifecycleRuleFilter{ObjectSizeGreaterThan: p.ObjectSizeGreaterThan}, false, nil
	default:
		return &s3types.LifecycleRuleFilter{ObjectSizeLessThan: p.ObjectSizeLessThan}, false, nil
	}
}

func awsLifecycleFilterFromS3(filter *s3types.LifecycleRuleFilter, ruleIndex int) (*awsLifecycleFilterPayload, error) {
	if filter == nil || filter.Prefix != nil {
		return nil, nil
	}
	if filter.Tag != nil {
		tag := awsLifecycleTagFromS3(*filter.Tag)
		return &awsLifecycleFilterPayload{Tag: &tag}, nil
	}
	if filter.And != nil {
		and := awsLifecycleAndFromS3(*filter.And)
		return &awsLifecycleFilterPayload{And: &and}, nil
	}
	if filter.ObjectSizeGreaterThan != nil {
		size := *filter.ObjectSizeGreaterThan
		return &awsLifecycleFilterPayload{ObjectSizeGreaterThan: &size}, nil
	}
	if filter.ObjectSizeLessThan != nil {
		size := *filter.ObjectSizeLessThan
		return &awsLifecycleFilterPayload{ObjectSizeLessThan: &size}, nil
	}
	return nil, lifecycleFieldError(ruleIndex, "filter", "encountered an unsupported AWS lifecycle filter type", nil)
}

func (p *awsLifecycleAndPayload) toS3(ruleIndex int) (s3types.LifecycleRuleAndOperator, error) {
	if p == nil {
		return s3types.LifecycleRuleAndOperator{}, lifecycleFieldError(ruleIndex, "filter.and", "and filter is required", nil)
	}
	if err := validateLifecycleSizes(ruleIndex, "filter.and", p.ObjectSizeGreaterThan, p.ObjectSizeLessThan); err != nil {
		return s3types.LifecycleRuleAndOperator{}, err
	}
	operator := s3types.LifecycleRuleAndOperator{}
	if p.Prefix != "" {
		prefix := p.Prefix
		operator.Prefix = &prefix
	}
	if p.ObjectSizeGreaterThan != nil {
		operator.ObjectSizeGreaterThan = p.ObjectSizeGreaterThan
	}
	if p.ObjectSizeLessThan != nil {
		operator.ObjectSizeLessThan = p.ObjectSizeLessThan
	}
	if len(p.Tags) > 0 {
		operator.Tags = make([]s3types.Tag, 0, len(p.Tags))
		keys := make(map[string]struct{}, len(p.Tags))
		for idx, item := range p.Tags {
			if _, exists := keys[item.Key]; exists {
				return s3types.LifecycleRuleAndOperator{}, lifecycleFieldError(ruleIndex, "filter.and.tags["+itoa(idx)+"].key", "tag keys must be unique", nil)
			}
			keys[item.Key] = struct{}{}
			tag, err := item.toS3(ruleIndex, "filter.and.tags["+itoa(idx)+"]")
			if err != nil {
				return s3types.LifecycleRuleAndOperator{}, err
			}
			operator.Tags = append(operator.Tags, tag)
		}
	}
	count := len(operator.Tags)
	if operator.Prefix != nil {
		count++
	}
	if operator.ObjectSizeGreaterThan != nil {
		count++
	}
	if operator.ObjectSizeLessThan != nil {
		count++
	}
	if count < 2 {
		return s3types.LifecycleRuleAndOperator{}, lifecycleFieldError(ruleIndex, "filter.and", "and filter must define at least two predicates", nil)
	}
	return operator, nil
}

func awsLifecycleAndFromS3(value s3types.LifecycleRuleAndOperator) awsLifecycleAndPayload {
	out := awsLifecycleAndPayload{}
	if value.Prefix != nil {
		out.Prefix = *value.Prefix
	}
	if value.ObjectSizeGreaterThan != nil {
		size := *value.ObjectSizeGreaterThan
		out.ObjectSizeGreaterThan = &size
	}
	if value.ObjectSizeLessThan != nil {
		size := *value.ObjectSizeLessThan
		out.ObjectSizeLessThan = &size
	}
	if len(value.Tags) > 0 {
		out.Tags = make([]awsLifecycleTagPayload, 0, len(value.Tags))
		for _, item := range value.Tags {
			out.Tags = append(out.Tags, awsLifecycleTagFromS3(item))
		}
	}
	return out
}

func (p awsLifecycleTagPayload) toS3(ruleIndex int, field string) (s3types.Tag, error) {
	key := p.Key
	if key == "" {
		return s3types.Tag{}, lifecycleFieldError(ruleIndex, field+".key", "tag key is required", nil)
	}
	return s3types.Tag{
		Key:   &key,
		Value: p.Value,
	}, nil
}

func awsLifecycleTagFromS3(value s3types.Tag) awsLifecycleTagPayload {
	out := awsLifecycleTagPayload{}
	if value.Key != nil {
		out.Key = *value.Key
	}
	if value.Value != nil {
		out.Value = value.Value
	}
	return out
}

func (p *awsLifecycleExpirationPayload) toS3(ruleIndex int) (*s3types.LifecycleExpiration, error) {
	if p == nil {
		return nil, nil
	}
	out := &s3types.LifecycleExpiration{}
	if p.Days != nil {
		if *p.Days <= 0 {
			return nil, lifecycleFieldError(ruleIndex, "expiration.days", "expiration days must be greater than zero", nil)
		}
		out.Days = p.Days
	}
	if strings.TrimSpace(p.Date) != "" {
		date, err := parseRFC3339Field(p.Date)
		if err != nil || !date.Equal(date.Truncate(24*time.Hour)) {
			return nil, lifecycleFieldError(ruleIndex, "expiration.date", "expiration date must be a valid RFC3339 timestamp at midnight UTC", map[string]any{"value": p.Date})
		}
		out.Date = &date
	}
	if p.ExpiredObjectDeleteMarker != nil {
		out.ExpiredObjectDeleteMarker = p.ExpiredObjectDeleteMarker
	}
	if out.ExpiredObjectDeleteMarker != nil && (out.Days != nil || out.Date != nil) {
		return nil, lifecycleFieldError(ruleIndex, "expiration", "expiredObjectDeleteMarker cannot be combined with days or date", nil)
	}
	if out.Days == nil && out.Date == nil && out.ExpiredObjectDeleteMarker == nil {
		return nil, lifecycleFieldError(ruleIndex, "expiration", "expiration must define days, date, or expiredObjectDeleteMarker", nil)
	}
	return out, nil
}

func awsLifecycleExpirationFromS3(value s3types.LifecycleExpiration) *awsLifecycleExpirationPayload {
	out := &awsLifecycleExpirationPayload{
		Days:                      value.Days,
		ExpiredObjectDeleteMarker: value.ExpiredObjectDeleteMarker,
	}
	if value.Date != nil {
		out.Date = value.Date.UTC().Format(time.RFC3339)
	}
	return out
}

func (p *awsLifecycleTransitionPayload) toS3(ruleIndex int, transitionIndex int) (s3types.Transition, error) {
	if p == nil {
		return s3types.Transition{}, lifecycleFieldError(ruleIndex, "transitions", "transition is required", nil)
	}
	storageClass := strings.TrimSpace(p.StorageClass)
	if storageClass == "" {
		return s3types.Transition{}, lifecycleFieldError(ruleIndex, "transitions["+itoa(transitionIndex)+"].storageClass", "storageClass is required", nil)
	}
	if !isValidTransitionStorageClass(storageClass) {
		return s3types.Transition{}, lifecycleFieldError(ruleIndex, "transitions["+itoa(transitionIndex)+"].storageClass", "storageClass is not supported", map[string]any{"value": storageClass})
	}
	out := s3types.Transition{
		StorageClass: s3types.TransitionStorageClass(storageClass),
	}
	if p.Days != nil {
		if *p.Days < 0 {
			return s3types.Transition{}, lifecycleFieldError(ruleIndex, "transitions["+itoa(transitionIndex)+"].days", "days must be zero or greater", nil)
		}
		out.Days = p.Days
	}
	if strings.TrimSpace(p.Date) != "" {
		date, err := parseRFC3339Field(p.Date)
		if err != nil || !date.Equal(date.Truncate(24*time.Hour)) {
			return s3types.Transition{}, lifecycleFieldError(ruleIndex, "transitions["+itoa(transitionIndex)+"].date", "date must be a valid RFC3339 timestamp at midnight UTC", map[string]any{"value": p.Date})
		}
		out.Date = &date
	}
	if out.Days == nil && out.Date == nil {
		return s3types.Transition{}, lifecycleFieldError(ruleIndex, "transitions["+itoa(transitionIndex)+"]", "transition must define days or date", nil)
	}
	return out, nil
}

func awsLifecycleTransitionFromS3(value s3types.Transition) awsLifecycleTransitionPayload {
	out := awsLifecycleTransitionPayload{
		Days:         value.Days,
		StorageClass: string(value.StorageClass),
	}
	if value.Date != nil {
		out.Date = value.Date.UTC().Format(time.RFC3339)
	}
	return out
}

func (p *awsAbortIncompleteMultipartUploadPayload) toS3(ruleIndex int) (*s3types.AbortIncompleteMultipartUpload, error) {
	if p == nil {
		return nil, nil
	}
	if p.DaysAfterInitiation == nil || *p.DaysAfterInitiation <= 0 {
		return nil, lifecycleFieldError(ruleIndex, "abortIncompleteMultipartUpload.daysAfterInitiation", "daysAfterInitiation must be greater than zero", nil)
	}
	return &s3types.AbortIncompleteMultipartUpload{
		DaysAfterInitiation: p.DaysAfterInitiation,
	}, nil
}

func awsAbortIncompleteMultipartUploadFromS3(value s3types.AbortIncompleteMultipartUpload) *awsAbortIncompleteMultipartUploadPayload {
	return &awsAbortIncompleteMultipartUploadPayload{
		DaysAfterInitiation: value.DaysAfterInitiation,
	}
}

func (p *awsNoncurrentVersionExpirationPayload) toS3(ruleIndex int) (*s3types.NoncurrentVersionExpiration, error) {
	if p == nil {
		return nil, nil
	}
	if p.NoncurrentDays == nil && p.NewerNoncurrentVersions == nil {
		return nil, lifecycleFieldError(ruleIndex, "noncurrentVersionExpiration", "noncurrentVersionExpiration must define noncurrentDays or newerNoncurrentVersions", nil)
	}
	if p.NoncurrentDays != nil && *p.NoncurrentDays <= 0 {
		return nil, lifecycleFieldError(ruleIndex, "noncurrentVersionExpiration.noncurrentDays", "noncurrentDays must be greater than zero", nil)
	}
	if p.NewerNoncurrentVersions != nil && (*p.NewerNoncurrentVersions < 1 || *p.NewerNoncurrentVersions > 100) {
		return nil, lifecycleFieldError(ruleIndex, "noncurrentVersionExpiration.newerNoncurrentVersions", "newerNoncurrentVersions must be between 1 and 100", nil)
	}
	return &s3types.NoncurrentVersionExpiration{
		NoncurrentDays:          p.NoncurrentDays,
		NewerNoncurrentVersions: p.NewerNoncurrentVersions,
	}, nil
}

func awsNoncurrentVersionExpirationFromS3(value s3types.NoncurrentVersionExpiration) *awsNoncurrentVersionExpirationPayload {
	return &awsNoncurrentVersionExpirationPayload{
		NoncurrentDays:          value.NoncurrentDays,
		NewerNoncurrentVersions: value.NewerNoncurrentVersions,
	}
}

func (p *awsNoncurrentVersionTransitionPayload) toS3(ruleIndex int, transitionIndex int) (s3types.NoncurrentVersionTransition, error) {
	if p == nil {
		return s3types.NoncurrentVersionTransition{}, lifecycleFieldError(ruleIndex, "noncurrentVersionTransitions", "transition is required", nil)
	}
	storageClass := strings.TrimSpace(p.StorageClass)
	if storageClass == "" {
		return s3types.NoncurrentVersionTransition{}, lifecycleFieldError(ruleIndex, "noncurrentVersionTransitions["+itoa(transitionIndex)+"].storageClass", "storageClass is required", nil)
	}
	if !isValidTransitionStorageClass(storageClass) {
		return s3types.NoncurrentVersionTransition{}, lifecycleFieldError(ruleIndex, "noncurrentVersionTransitions["+itoa(transitionIndex)+"].storageClass", "storageClass is not supported", map[string]any{"value": storageClass})
	}
	if p.NoncurrentDays == nil && p.NewerNoncurrentVersions == nil {
		return s3types.NoncurrentVersionTransition{}, lifecycleFieldError(ruleIndex, "noncurrentVersionTransitions["+itoa(transitionIndex)+"]", "transition must define noncurrentDays or newerNoncurrentVersions", nil)
	}
	if p.NoncurrentDays != nil && *p.NoncurrentDays <= 0 {
		return s3types.NoncurrentVersionTransition{}, lifecycleFieldError(ruleIndex, "noncurrentVersionTransitions["+itoa(transitionIndex)+"].noncurrentDays", "noncurrentDays must be greater than zero", nil)
	}
	if p.NewerNoncurrentVersions != nil && (*p.NewerNoncurrentVersions < 1 || *p.NewerNoncurrentVersions > 100) {
		return s3types.NoncurrentVersionTransition{}, lifecycleFieldError(ruleIndex, "noncurrentVersionTransitions["+itoa(transitionIndex)+"].newerNoncurrentVersions", "newerNoncurrentVersions must be between 1 and 100", nil)
	}
	return s3types.NoncurrentVersionTransition{
		NoncurrentDays:          p.NoncurrentDays,
		NewerNoncurrentVersions: p.NewerNoncurrentVersions,
		StorageClass:            s3types.TransitionStorageClass(storageClass),
	}, nil
}

func awsNoncurrentVersionTransitionFromS3(value s3types.NoncurrentVersionTransition) awsNoncurrentVersionTransitionPayload {
	return awsNoncurrentVersionTransitionPayload{
		NoncurrentDays:          value.NoncurrentDays,
		NewerNoncurrentVersions: value.NewerNoncurrentVersions,
		StorageClass:            string(value.StorageClass),
	}
}

func parseAWSLifecycleStatus(value string) (s3types.ExpirationStatus, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "enabled":
		return s3types.ExpirationStatusEnabled, nil
	case "disabled":
		return s3types.ExpirationStatusDisabled, nil
	default:
		return "", InvalidEnumFieldError("status", value, "enabled", "disabled")
	}
}

func formatAWSLifecycleStatus(value s3types.ExpirationStatus) string {
	switch value {
	case s3types.ExpirationStatusEnabled:
		return "enabled"
	case s3types.ExpirationStatusDisabled:
		return "disabled"
	default:
		return ""
	}
}

func mapAWSLifecycleError(err error, bucket string, op string) error {
	if err == nil {
		return nil
	}
	if isAWSAPICode(err, "NoSuchBucket") {
		return BucketNotFoundError(bucket)
	}
	if isAWSAPICode(err, "AccessDenied") {
		return AccessDeniedError(bucket, op)
	}
	return UpstreamOperationError("bucket_lifecycle_error", "failed to "+op+" bucket lifecycle", bucket, err)
}

func lifecycleFieldError(ruleIndex int, field string, message string, details map[string]any) *OperationError {
	payload := map[string]any{
		"section":   "lifecycle",
		"ruleIndex": ruleIndex,
	}
	for key, value := range details {
		payload[key] = value
	}
	return InvalidFieldError("rules["+itoa(ruleIndex)+"]."+field, message, payload)
}

func parseRFC3339Field(value string) (time.Time, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return time.Time{}, nil
	}
	parsed, err := time.Parse(time.RFC3339, trimmed)
	if err == nil {
		return parsed.UTC(), nil
	}
	parsed, err = time.Parse(time.RFC3339Nano, trimmed)
	if err != nil {
		return time.Time{}, err
	}
	return parsed.UTC(), nil
}

func isValidTransitionStorageClass(value string) bool {
	for _, item := range s3types.TransitionStorageClass("").Values() {
		if string(item) == value {
			return true
		}
	}
	return false
}

func itoa(value int) string {
	return strconv.Itoa(value)
}

func validateLifecycleSizes(ruleIndex int, field string, minimum, maximum *int64) error {
	if minimum != nil && *minimum < 0 {
		return lifecycleFieldError(ruleIndex, field+".objectSizeGreaterThan", "size must be nonnegative", nil)
	}
	if maximum != nil && *maximum < 0 {
		return lifecycleFieldError(ruleIndex, field+".objectSizeLessThan", "size must be nonnegative", nil)
	}
	if minimum != nil && maximum != nil && *minimum >= *maximum {
		return lifecycleFieldError(ruleIndex, field, "objectSizeGreaterThan must be less than objectSizeLessThan", nil)
	}
	return nil
}

// Compare explicit IDs first; an omitted ID may be generated by S3.
func awsLifecycleRulesMatch(expected, observed []s3types.LifecycleRule) bool {
	if len(expected) != len(observed) {
		return false
	}
	remaining := make(map[string]int, len(observed))
	anonymous := make(map[string]int, len(observed))
	for _, rule := range observed {
		raw, err := marshalAWSLifecycleRules([]s3types.LifecycleRule{rule})
		if err != nil {
			return false
		}
		remaining[string(raw)]++
	}
	for _, rule := range expected {
		if rule.ID == nil {
			continue
		}
		raw, err := marshalAWSLifecycleRules([]s3types.LifecycleRule{rule})
		if err != nil || remaining[string(raw)] == 0 {
			return false
		}
		remaining[string(raw)]--
	}
	for raw, count := range remaining {
		if count == 0 {
			continue
		}
		var payload []awsLifecycleRulePayload
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			return false
		}
		payload[0].ID = ""
		normalized, err := json.Marshal(payload)
		if err != nil {
			return false
		}
		anonymous[string(normalized)] += count
	}
	for _, rule := range expected {
		if rule.ID != nil {
			continue
		}
		raw, err := marshalAWSLifecycleRules([]s3types.LifecycleRule{rule})
		if err != nil || anonymous[string(raw)] == 0 {
			return false
		}
		anonymous[string(raw)]--
	}
	return true
}
