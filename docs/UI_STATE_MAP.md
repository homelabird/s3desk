# UI State Maps (Page-level)

State diagrams are based on the current frontend implementation in `frontend/src`.

## App/Auth Gate

```mermaid
stateDiagram-v2
  [*] --> MetaLoading
  MetaLoading --> Ready: /meta ok
  MetaLoading --> Login: 401
  MetaLoading --> Error: network/403
  Login --> MetaLoading: token saved
  Error --> MetaLoading: retry
```

## Profiles Page

```mermaid
stateDiagram-v2
  [*] --> Loading
  Loading --> Loaded: profiles ok
  Loading --> Error
  Loaded --> Creating: open create modal
  Creating --> Loaded: create ok
  Creating --> Error: create failed
  Loaded --> Editing: open edit modal
  Editing --> Loaded: update ok
  Editing --> Error
  Loaded --> Testing: POST /profiles/{id}/test
  Testing --> Loaded: ok
  Testing --> Error
```

## Buckets Page

```mermaid
stateDiagram-v2
  [*] --> Loading
  Loading --> Loaded: list ok
  Loading --> Error
  Loaded --> Creating: create bucket
  Creating --> Loaded: ok
  Creating --> Error
  Loaded --> Deleting: delete bucket
  Deleting --> Loaded: ok
  Deleting --> Error
```

## Objects Page

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Listing: select bucket/prefix
  Listing --> Listed: list ok
  Listing --> Error
  Listed --> Paging: fetch next page
  Paging --> Listed
  Paging --> Error
  Listed --> Searching: open search drawer
  Searching --> Listed
  Listed --> Indexing: create s3_index_objects job
  Indexing --> Listed: job completed
  Listed --> Downloading: queue download
  Listed --> Uploading: queue upload
  Downloading --> Listed
  Uploading --> Listed
```

## Uploads Page

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> SessionCreated: POST /uploads
  SessionCreated --> Uploading: POST /uploads/{id}/files
  Uploading --> Commit: POST /uploads/{id}/commit
  Commit --> JobQueued: staging
  Commit --> Completed: presigned/direct
  JobQueued --> Completed
  Uploading --> Error
```

## Jobs Page

```mermaid
stateDiagram-v2
  [*] --> Loading
  Loading --> Loaded: list ok
  Loading --> Error
  Loaded --> Running: job.progress events
  Running --> Completed: job.completed
  Running --> Failed: job.failed
  Failed --> Retrying: POST /jobs/{id}/retry
  Retrying --> Running
```

## Settings

```mermaid
stateDiagram-v2
  [*] --> Closed
  Closed --> Open: user open
  Open --> Closed: close
  Open --> Saving: update prefs
  Saving --> Open: ok
  Saving --> Error
```

## Transfers (global drawer)

```mermaid
stateDiagram-v2
  [*] --> Closed
  Closed --> Open: user open
  Open --> DownloadQueued
  Open --> UploadQueued
  DownloadQueued --> Downloading
  UploadQueued --> Uploading
  Downloading --> Completed
  Uploading --> Completed
  Downloading --> Failed
  Uploading --> Failed
  Failed --> Retrying
  Retrying --> Downloading
```

