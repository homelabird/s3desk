package jobs

import "fmt"

type transferBatchItemPayload struct {
	SrcKey string
	DstKey string
}

type transferBatchPayload struct {
	SrcBucket string
	DstBucket string
	Items     []transferBatchItemPayload
	DryRun    bool
}

func parseTransferBatchPayload(payload map[string]any) (transferBatchPayload, error) {
	srcBucket, err := payloadOptionalString(payload, "srcBucket")
	if err != nil {
		return transferBatchPayload{}, err
	}
	dstBucket, err := payloadOptionalString(payload, "dstBucket")
	if err != nil {
		return transferBatchPayload{}, err
	}
	dryRun, err := payloadOptionalBool(payload, "dryRun")
	if err != nil {
		return transferBatchPayload{}, err
	}

	rawItems, ok := payload["items"]
	if !ok || rawItems == nil {
		return transferBatchPayload{
			SrcBucket: srcBucket,
			DstBucket: dstBucket,
			Items:     nil,
			DryRun:    dryRun,
		}, nil
	}

	itemsSlice, ok := rawItems.([]any)
	if !ok {
		// Preserve existing behavior: treat type mismatch like missing.
		return transferBatchPayload{
			SrcBucket: srcBucket,
			DstBucket: dstBucket,
			Items:     nil,
			DryRun:    dryRun,
		}, nil
	}

	items := make([]transferBatchItemPayload, 0, len(itemsSlice))
	for i, item := range itemsSlice {
		mm, ok := item.(map[string]any)
		if !ok {
			return transferBatchPayload{}, fmt.Errorf("payload.items[%d] must be an object", i)
		}
		srcKey, _ := mm["srcKey"].(string)
		dstKey, _ := mm["dstKey"].(string)
		items = append(items, transferBatchItemPayload{SrcKey: srcKey, DstKey: dstKey})
	}

	return transferBatchPayload{
		SrcBucket: srcBucket,
		DstBucket: dstBucket,
		Items:     items,
		DryRun:    dryRun,
	}, nil
}
