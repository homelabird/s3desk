import { Alert, Button } from "antd";

import { appFeedback } from "../../../lib/appFeedback";
import { clipboardFailureHint, copyToClipboard } from "../../../lib/clipboard";
import styles from "../BucketGovernanceModal.module.css";
import type { OCIPreauthenticatedRequestDraft } from "./types";

type OCISharingCreatedRequestsProps = {
  requests: OCIPreauthenticatedRequestDraft[];
};

export function OCISharingCreatedRequests({
  requests,
}: OCISharingCreatedRequestsProps) {
  if (requests.length === 0) return null;

  const copyURL = async (url: string) => {
    const result = await copyToClipboard(url);
    if (result.ok) {
      appFeedback.success("PAR URL copied.");
      return;
    }
    appFeedback.error(clipboardFailureHint());
  };

  return (
    <div className={styles.warningStack}>
      {requests.map((item) => (
        <Alert
          key={item.id || item.name}
          type="success"
          showIcon
          title={`Created PAR: ${item.name}`}
          description={
            <div>
              <div>{item.accessUri}</div>
              <Button
                size="small"
                onClick={() => void copyURL(item.accessUri)}
                aria-label={`Copy PAR URL for ${item.name}`}
              >
                Copy URL
              </Button>
            </div>
          }
        />
      ))}
    </div>
  );
}
