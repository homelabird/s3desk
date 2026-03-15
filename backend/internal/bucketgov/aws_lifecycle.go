package bucketgov

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

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
	Key   string `json:"key"`
	Value string `json:"value"`
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
		if deleteErr != nil {
			return mapAWSLifecycleError(deleteErr, bucket, "delete")
		}
		return nil
	}

	_, putErr := client.PutBucketLifecycleConfiguration(ctx, &s3.PutBucketLifecycleConfigurationInput{
		Bucket: &bucket,
		LifecycleConfiguration: &s3types.BucketLifecycleConfiguration{
			Rules: rules,
		},
	})
	if putErr != nil {
		return mapAWSLifecycleError(putErr, bucket, "put")
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
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, InvalidFieldError("rules", "rules must be a JSON array of AWS lifecycle rules", map[string]any{
			"section": "lifecycle",
			"error":   err.Error(),
		})
	}

	rules := make([]s3types.LifecycleRule, 0, len(payload))
	for idx, item := range payload {
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
	if id := strings.TrimSpace(p.ID); id != "" {
		rule.ID = &id
	}

	if strings.TrimSpace(p.Prefix) != "" && p.Filter != nil {
		return s3types.LifecycleRule{}, lifecycleFieldError(ruleIndex, "filter", "filter cannot be used together with prefix", nil)
	}

	switch {
	case p.Filter != nil:
		filter, allObjects, err := p.Filter.toS3(ruleIndex)
		if err != nil {
			return s3types.LifecycleRule{}, err
		}
		if allObjects {
			empty := ""
			rule.Prefix = &empty
		} else {
			rule.Filter = filter
		}
	case strings.TrimSpace(p.Prefix) != "":
		prefix := strings.TrimSpace(p.Prefix)
		rule.Prefix = &prefix
	default:
		empty := ""
		rule.Prefix = &empty
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
		payload.ID = strings.TrimSpace(*rule.ID)
	}
	if rule.Prefix != nil && strings.TrimSpace(*rule.Prefix) != "" {
		payload.Prefix = strings.TrimSpace(*rule.Prefix)
	}
	if rule.Filter != nil {
		filter, err := awsLifecycleFilterFromS3(rule.Filter, ruleIndex)
		if err != nil {
			return awsLifecycleRulePayload{}, err
		}
		payload.Filter = filter
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

func (p *awsLifecycleFilterPayload) toS3(ruleIndex int) (s3types.LifecycleRuleFilter, bool, error) {
	if p == nil {
		return nil, true, nil
	}

	count := 0
	if strings.TrimSpace(p.Prefix) != "" {
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
	case strings.TrimSpace(p.Prefix) != "":
		return &s3types.LifecycleRuleFilterMemberPrefix{Value: strings.TrimSpace(p.Prefix)}, false, nil
	case p.Tag != nil:
		tag, err := p.Tag.toS3(ruleIndex, "filter.tag")
		if err != nil {
			return nil, false, err
		}
		return &s3types.LifecycleRuleFilterMemberTag{Value: tag}, false, nil
	case p.And != nil:
		and, err := p.And.toS3(ruleIndex)
		if err != nil {
			return nil, false, err
		}
		return &s3types.LifecycleRuleFilterMemberAnd{Value: and}, false, nil
	case p.ObjectSizeGreaterThan != nil:
		return &s3types.LifecycleRuleFilterMemberObjectSizeGreaterThan{Value: *p.ObjectSizeGreaterThan}, false, nil
	default:
		return &s3types.LifecycleRuleFilterMemberObjectSizeLessThan{Value: *p.ObjectSizeLessThan}, false, nil
	}
}

func awsLifecycleFilterFromS3(filter s3types.LifecycleRuleFilter, ruleIndex int) (*awsLifecycleFilterPayload, error) {
	switch value := filter.(type) {
	case *s3types.LifecycleRuleFilterMemberPrefix:
		if strings.TrimSpace(value.Value) == "" {
			return nil, nil
		}
		return &awsLifecycleFilterPayload{Prefix: strings.TrimSpace(value.Value)}, nil
	case *s3types.LifecycleRuleFilterMemberTag:
		tag := awsLifecycleTagFromS3(value.Value)
		return &awsLifecycleFilterPayload{Tag: &tag}, nil
	case *s3types.LifecycleRuleFilterMemberAnd:
		and := awsLifecycleAndFromS3(value.Value)
		return &awsLifecycleFilterPayload{And: &and}, nil
	case *s3types.LifecycleRuleFilterMemberObjectSizeGreaterThan:
		size := value.Value
		return &awsLifecycleFilterPayload{ObjectSizeGreaterThan: &size}, nil
	case *s3types.LifecycleRuleFilterMemberObjectSizeLessThan:
		size := value.Value
		return &awsLifecycleFilterPayload{ObjectSizeLessThan: &size}, nil
	default:
		return nil, lifecycleFieldError(ruleIndex, "filter", "encountered an unsupported AWS lifecycle filter type", nil)
	}
}

func (p *awsLifecycleAndPayload) toS3(ruleIndex int) (s3types.LifecycleRuleAndOperator, error) {
	if p == nil {
		return s3types.LifecycleRuleAndOperator{}, lifecycleFieldError(ruleIndex, "filter.and", "and filter is required", nil)
	}
	operator := s3types.LifecycleRuleAndOperator{}
	if strings.TrimSpace(p.Prefix) != "" {
		prefix := strings.TrimSpace(p.Prefix)
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
		for idx, item := range p.Tags {
			tag, err := item.toS3(ruleIndex, "filter.and.tags["+itoa(idx)+"]")
			if err != nil {
				return s3types.LifecycleRuleAndOperator{}, err
			}
			operator.Tags = append(operator.Tags, tag)
		}
	}
	if operator.Prefix == nil && operator.ObjectSizeGreaterThan == nil && operator.ObjectSizeLessThan == nil && len(operator.Tags) == 0 {
		return s3types.LifecycleRuleAndOperator{}, lifecycleFieldError(ruleIndex, "filter.and", "and filter must define at least one predicate", nil)
	}
	return operator, nil
}

func awsLifecycleAndFromS3(value s3types.LifecycleRuleAndOperator) awsLifecycleAndPayload {
	out := awsLifecycleAndPayload{}
	if value.Prefix != nil {
		out.Prefix = strings.TrimSpace(*value.Prefix)
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
	key := strings.TrimSpace(p.Key)
	value := strings.TrimSpace(p.Value)
	if key == "" {
		return s3types.Tag{}, lifecycleFieldError(ruleIndex, field+".key", "tag key is required", nil)
	}
	if value == "" {
		return s3types.Tag{}, lifecycleFieldError(ruleIndex, field+".value", "tag value is required", nil)
	}
	return s3types.Tag{
		Key:   &key,
		Value: &value,
	}, nil
}

func awsLifecycleTagFromS3(value s3types.Tag) awsLifecycleTagPayload {
	out := awsLifecycleTagPayload{}
	if value.Key != nil {
		out.Key = strings.TrimSpace(*value.Key)
	}
	if value.Value != nil {
		out.Value = strings.TrimSpace(*value.Value)
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
		if err != nil {
			return nil, lifecycleFieldError(ruleIndex, "expiration.date", "expiration date must be a valid RFC3339 timestamp", map[string]any{"value": p.Date})
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
		if *p.Days <= 0 {
			return s3types.Transition{}, lifecycleFieldError(ruleIndex, "transitions["+itoa(transitionIndex)+"].days", "days must be greater than zero", nil)
		}
		out.Days = p.Days
	}
	if strings.TrimSpace(p.Date) != "" {
		date, err := parseRFC3339Field(p.Date)
		if err != nil {
			return s3types.Transition{}, lifecycleFieldError(ruleIndex, "transitions["+itoa(transitionIndex)+"].date", "date must be a valid RFC3339 timestamp", map[string]any{"value": p.Date})
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
	if p.NewerNoncurrentVersions != nil && *p.NewerNoncurrentVersions < 0 {
		return nil, lifecycleFieldError(ruleIndex, "noncurrentVersionExpiration.newerNoncurrentVersions", "newerNoncurrentVersions must be zero or greater", nil)
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
	if p.NewerNoncurrentVersions != nil && *p.NewerNoncurrentVersions < 0 {
		return s3types.NoncurrentVersionTransition{}, lifecycleFieldError(ruleIndex, "noncurrentVersionTransitions["+itoa(transitionIndex)+"].newerNoncurrentVersions", "newerNoncurrentVersions must be zero or greater", nil)
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
