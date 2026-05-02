package api

func mergeUploadVerificationTargets(groups ...[]uploadVerificationTarget) []uploadVerificationTarget {
	merged := make([]uploadVerificationTarget, 0)
	seen := make(map[string]struct{})
	for _, group := range groups {
		for _, target := range group {
			identity := target.Path
			if identity == "" {
				identity = target.Key
			}
			if identity == "" {
				continue
			}
			if _, exists := seen[identity]; exists {
				continue
			}
			seen[identity] = struct{}{}
			merged = append(merged, target)
		}
	}
	return merged
}
