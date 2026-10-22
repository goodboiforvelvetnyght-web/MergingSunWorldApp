const response = await fetch(
  "https://asia-southeast1-mergingsunapp-2.cloudfunctions.net/storageReadiness",
  { signal: AbortSignal.timeout(30000) },
);
if (!response.ok || (await response.json()).ready !== true) {
  console.error(
    "Storage is initialized, but the app runtime cannot read and write its images. The current live app has not been replaced. A project owner must run scripts/setup-storage-access.sh in Google Cloud Shell, then rerun this workflow.",
  );
  process.exit(1);
}
console.log(
  "App runtime can read and write images in the Firebase Storage bucket.",
);
