import { Alert } from "antd";

import styles from "../BucketGovernanceModal.module.css";
import type { OCIPreauthenticatedRequestDraft } from "./types";

type OCISharingCreatedRequestsProps = {
  requests: OCIPreauthenticatedRequestDraft[];
};

export function OCISharingCreatedRequests({
  requests,
}: OCISharingCreatedRequestsProps) {
  if (requests.length === 0) return null;

  return (
    <div className={styles.warningStack}>
      {requests.map((item) => (
        <Alert
          key={item.id || item.name}
          type="success"
          showIcon
          title={`Created PAR: ${item.name}`}
          description={item.accessUri}
        />
      ))}
    </div>
  );
}
