import { Suspense, lazy } from "react";

import styles from "./App.module.css";

const FullApp = lazy(async () => {
  const m = await import("./FullApp");
  return { default: m.default };
});

function LoadingScreen() {
  return (
    <div role="status" className={styles.loadingScreen}>
      <div className={styles.loadingPanel}>
        <div className={styles.loadingTitle}>Loading…</div>
        <div className={styles.loadingCopy}>Preparing the dashboard UI.</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <FullApp />
    </Suspense>
  );
}
