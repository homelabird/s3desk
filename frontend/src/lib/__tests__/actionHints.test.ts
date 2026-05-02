import { describe, expect, it } from "vitest";

import {
  addFilesOrFolderFirstHint,
  addFilesOrFolderFirstSentenceHint,
  bucketFieldPlaceholder,
  clearFavoritesFilterHint,
  chooseProfileToShowPinnedObjectsHint,
  chooseProfileToLoadFoldersForWorkspaceHint,
  createNewFolderMarkerObjectHint,
  createFolderOrUploadFilesAtThisLevelHint,
  deleteSelectedObjectsLabel,
  downloadToBrowserHint,
  failedToListObjectsTitle,
  failedToLoadFoldersTitle,
  failedToLoadBucketsTitle,
  failedToLoadFavoritesTitle,
  fetchingNestedPrefixesForThisLocationHint,
  fetchingPinnedObjectsHint,
  favoritesUnavailableUntilBucketSelectedLabel,
  favoritesUnavailableUntilProfileSelectedLabel,
  goToBucketsLabel,
  loadingFavoritesCountLabel,
  loadingFavoritesTitle,
  loadingControlsTitle,
  loadingFoldersTitle,
  loadingListTitle,
  loadingBucketsPlaceholder,
  noFavoritesMatchQueryTitle,
  noFavoritesYetTitle,
  noFoldersHereYetTitle,
  noMatchingBucketsHint,
  noBucketsAvailableHint,
  noBucketsAvailableSentenceHint,
  noBucketsMatchSearchHint,
  noBucketSelectedLabel,
  newFolderShortcutHint,
  offlineNetworkConnectionHint,
  offlineObjectActionsDisabledHint,
  offlineUploadsDisabledHint,
  selectBucketFirstHint,
  selectBucketFirstSentenceHint,
  selectBucketToBrowseObjectsHint,
  selectBucketTitle,
  selectObjectToLoadMetadataHint,
  selectObjectToSeeDetailsHint,
  selectObjectsFirstHint,
  selectProfileFirstHint,
  selectProfileFirstSentenceHint,
  searchBucketsPlaceholder,
  pickBucketToShowPinnedObjectsHint,
  pickBucketToBrowseFoldersAndNestedPrefixesHint,
  starObjectsToKeepThemHereHint,
  tapToChooseBucketHint,
  tapToSwitchBucketHint,
  uploadFilesOrFoldersHint,
  uploadFilesOrFoldersFromDeviceHint,
  uploadsUnsupportedHint,
} from "../actionHints";

describe("actionHints helpers", () => {
  it("builds the offline uploads-disabled hint from the shared wording module", () => {
    expect(offlineUploadsDisabledHint()).toBe("Offline: uploads are disabled.");
  });

  it("builds the offline network hint from the shared wording module", () => {
    expect(offlineNetworkConnectionHint()).toBe(
      "Offline: check your network connection",
    );
  });

  it("builds the offline object-actions-disabled hint from the shared wording module", () => {
    expect(offlineObjectActionsDisabledHint()).toBe(
      "Offline: object actions are disabled.",
    );
  });

  it("builds the uploads-unsupported hint from the shared wording module", () => {
    expect(uploadsUnsupportedHint()).toBe(
      "Uploads are not supported by this provider.",
    );
  });

  it("builds the select-profile prerequisite hint from the shared wording module", () => {
    expect(selectProfileFirstHint()).toBe("Select a profile first");
  });

  it("builds the select-profile prerequisite sentence from the shared wording module", () => {
    expect(selectProfileFirstSentenceHint()).toBe("Select a profile first.");
  });

  it("builds the select-bucket prerequisite hint from the shared wording module", () => {
    expect(selectBucketFirstHint()).toBe("Select a bucket first");
  });

  it("builds the select-bucket prerequisite sentence from the shared wording module", () => {
    expect(selectBucketFirstSentenceHint()).toBe("Select a bucket first.");
  });

  it("builds the no-bucket-selected label from the shared wording module", () => {
    expect(noBucketSelectedLabel()).toBe("No bucket selected");
  });

  it("builds the no-buckets-available hint from the shared wording module", () => {
    expect(noBucketsAvailableHint()).toBe("No buckets available");
  });

  it("builds the no-buckets-available sentence from the shared wording module", () => {
    expect(noBucketsAvailableSentenceHint()).toBe("No buckets available.");
  });

  it("builds the no-buckets-match-search hint from the shared wording module", () => {
    expect(noBucketsMatchSearchHint()).toBe("No buckets match this search.");
  });

  it("builds the bucket field placeholder from the shared wording module", () => {
    expect(bucketFieldPlaceholder()).toBe("Bucket…");
  });

  it("builds the loading-buckets placeholder from the shared wording module", () => {
    expect(loadingBucketsPlaceholder()).toBe("Loading buckets…");
  });

  it("builds the failed-to-load-buckets title from the shared wording module", () => {
    expect(failedToLoadBucketsTitle()).toBe("Failed to load buckets");
  });

  it("builds the failed-to-load-favorites title from the shared wording module", () => {
    expect(failedToLoadFavoritesTitle()).toBe("Failed to load favorites");
  });

  it("builds the loading-favorites title from the shared wording module", () => {
    expect(loadingFavoritesTitle()).toBe("Loading favorites…");
  });

  it("builds the failed-to-list-objects title from the shared wording module", () => {
    expect(failedToListObjectsTitle()).toBe("Failed to list objects");
  });

  it("builds the favorites-unavailable-until-profile-selected label from the shared wording module", () => {
    expect(favoritesUnavailableUntilProfileSelectedLabel()).toBe(
      "Favorites unavailable until a profile is selected",
    );
  });

  it("builds the favorites-unavailable-until-bucket-selected label from the shared wording module", () => {
    expect(favoritesUnavailableUntilBucketSelectedLabel()).toBe(
      "Favorites unavailable until a bucket is selected",
    );
  });

  it("builds the loading-favorites-count label from the shared wording module", () => {
    expect(loadingFavoritesCountLabel()).toBe("Loading favorites count");
  });

  it("builds the choose-profile-to-show-pinned-objects hint from the shared wording module", () => {
    expect(chooseProfileToShowPinnedObjectsHint()).toBe(
      "Choose a profile to show pinned objects.",
    );
  });

  it("builds the choose-profile-to-load-folders-for-workspace hint from the shared wording module", () => {
    expect(chooseProfileToLoadFoldersForWorkspaceHint()).toBe(
      "Choose a profile to load folders for this workspace.",
    );
  });

  it("builds the pick-bucket-to-show-pinned-objects hint from the shared wording module", () => {
    expect(pickBucketToShowPinnedObjectsHint()).toBe(
      "Pick a bucket to show pinned objects.",
    );
  });

  it("builds the pick-bucket-to-browse-folders-and-nested-prefixes hint from the shared wording module", () => {
    expect(pickBucketToBrowseFoldersAndNestedPrefixesHint()).toBe(
      "Pick a bucket to browse folders and nested prefixes.",
    );
  });

  it("builds the fetching-pinned-objects hint from the shared wording module", () => {
    expect(fetchingPinnedObjectsHint()).toBe("Fetching pinned objects.");
  });

  it("builds the failed-to-load-folders title from the shared wording module", () => {
    expect(failedToLoadFoldersTitle()).toBe("Failed to load folders");
  });

  it("builds the loading-folders title from the shared wording module", () => {
    expect(loadingFoldersTitle()).toBe("Loading folders…");
  });

  it("builds the fetching-nested-prefixes-for-this-location hint from the shared wording module", () => {
    expect(fetchingNestedPrefixesForThisLocationHint()).toBe(
      "Fetching nested prefixes for this location.",
    );
  });

  it("builds the no-folders-here-yet title from the shared wording module", () => {
    expect(noFoldersHereYetTitle()).toBe("No folders here yet");
  });

  it("builds the create-folder-or-upload-files-at-this-level hint from the shared wording module", () => {
    expect(createFolderOrUploadFilesAtThisLevelHint()).toBe(
      "Create a folder or upload files at this level.",
    );
  });

  it("builds the loading-list title from the shared wording module", () => {
    expect(loadingListTitle()).toBe("Loading list…");
  });

  it("builds the loading-controls title from the shared wording module", () => {
    expect(loadingControlsTitle()).toBe("Loading controls…");
  });

  it("builds the no-favorites-yet title from the shared wording module", () => {
    expect(noFavoritesYetTitle()).toBe("No favorites yet.");
  });

  it("builds the star-objects-to-keep-them-here hint from the shared wording module", () => {
    expect(starObjectsToKeepThemHereHint()).toBe(
      "Star objects to keep them here.",
    );
  });

  it("builds the no-favorites-match-query title from the shared wording module", () => {
    expect(noFavoritesMatchQueryTitle("report")).toBe(
      'No matches for "report".',
    );
  });

  it("builds the clear-favorites-filter hint from the shared wording module", () => {
    expect(clearFavoritesFilterHint()).toBe(
      "Clear the filter or try a broader term.",
    );
  });

  it("builds the search-buckets placeholder from the shared wording module", () => {
    expect(searchBucketsPlaceholder()).toBe("Search buckets…");
  });

  it("builds the no-matching-buckets hint from the shared wording module", () => {
    expect(noMatchingBucketsHint()).toBe("No matching buckets");
  });

  it("builds the select-bucket title from the shared wording module", () => {
    expect(selectBucketTitle()).toBe("Select bucket");
  });

  it("builds the select-bucket-to-browse-objects hint from the shared wording module", () => {
    expect(selectBucketToBrowseObjectsHint()).toBe(
      "Select a bucket to browse objects.",
    );
  });

  it("builds the go-to-buckets label from the shared wording module", () => {
    expect(goToBucketsLabel()).toBe("Go to Buckets");
  });

  it("builds the tap-to-switch-bucket hint from the shared wording module", () => {
    expect(tapToSwitchBucketHint()).toBe("Tap to switch bucket");
  });

  it("builds the tap-to-choose-bucket hint from the shared wording module", () => {
    expect(tapToChooseBucketHint()).toBe("Tap to choose a bucket");
  });

  it("builds the add-files-or-folder prerequisite hint from the shared wording module", () => {
    expect(addFilesOrFolderFirstHint()).toBe("Add files or a folder first");
  });

  it("builds the add-files-or-folder prerequisite sentence from the shared wording module", () => {
    expect(addFilesOrFolderFirstSentenceHint()).toBe(
      "Add files or a folder first.",
    );
  });

  it("builds the upload-files-or-folders hint from the shared wording module", () => {
    expect(uploadFilesOrFoldersHint()).toBe("Upload files or folders");
  });

  it("builds the upload-files-or-folders-from-device hint from the shared wording module", () => {
    expect(uploadFilesOrFoldersFromDeviceHint()).toBe(
      "Upload files or folders from this device",
    );
  });

  it("builds the create-folder marker hint from the shared wording module", () => {
    expect(createNewFolderMarkerObjectHint()).toBe(
      "Create a new folder marker object",
    );
  });

  it("builds the new-folder-shortcut hint from the shared wording module", () => {
    expect(newFolderShortcutHint()).toBe("New folder (Ctrl+Shift+N)");
  });

  it("builds the download-to-browser hint from the shared wording module", () => {
    expect(downloadToBrowserHint()).toBe("Download to your browser");
  });

  it("builds the delete-selected-objects label from the shared wording module", () => {
    expect(deleteSelectedObjectsLabel()).toBe("Delete selected objects");
  });

  it("builds the select-objects prerequisite hint from the shared wording module", () => {
    expect(selectObjectsFirstHint()).toBe("Select objects first");
  });

  it("builds the select-object details hint from the shared wording module", () => {
    expect(selectObjectToSeeDetailsHint()).toBe(
      "Select an object to see details",
    );
  });

  it("builds the select-object metadata hint from the shared wording module", () => {
    expect(selectObjectToLoadMetadataHint()).toBe(
      "Select an object to load metadata.",
    );
  });
});
