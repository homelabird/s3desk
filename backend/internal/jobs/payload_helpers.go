package jobs

import "fmt"

func payloadOptionalString(payload map[string]any, key string) (string, error) {
	v, ok := payload[key]
	if !ok || v == nil {
		return "", nil
	}
	s, ok := v.(string)
	if !ok {
		return "", fmt.Errorf("payload.%s must be a string", key)
	}
	return s, nil
}

func payloadOptionalBool(payload map[string]any, key string) (bool, error) {
	v, ok := payload[key]
	if !ok || v == nil {
		return false, nil
	}
	b, ok := v.(bool)
	if !ok {
		return false, fmt.Errorf("payload.%s must be a boolean", key)
	}
	return b, nil
}

func payloadOptionalBoolOr(payload map[string]any, key string, defaultValue bool) (bool, error) {
	v, ok := payload[key]
	if !ok || v == nil {
		return defaultValue, nil
	}
	b, ok := v.(bool)
	if !ok {
		return false, fmt.Errorf("payload.%s must be a boolean", key)
	}
	return b, nil
}

func payloadOptionalAnySlice(payload map[string]any, key string) ([]any, bool) {
	v, ok := payload[key]
	if !ok || v == nil {
		return nil, false
	}
	vv, ok := v.([]any)
	if !ok {
		return nil, false
	}
	return vv, true
}

func payloadOptionalStringSlice(payload map[string]any, key string) ([]string, error) {
	v, ok := payload[key]
	if !ok || v == nil {
		return nil, nil
	}

	switch vv := v.(type) {
	case []string:
		out := make([]string, len(vv))
		copy(out, vv)
		return out, nil
	case []any:
		out := make([]string, 0, len(vv))
		for idx, item := range vv {
			s, ok := item.(string)
			if !ok {
				return nil, fmt.Errorf("payload.%s[%d] must be a string", key, idx)
			}
			out = append(out, s)
		}
		return out, nil
	default:
		return nil, fmt.Errorf("payload.%s must be an array of strings", key)
	}
}
