export type ArchivePageStatus = "success" | "error";

export type ArchivedPage = {
  id: string;
  url: string;
  title: string;
  html: string;
  text: string;
  links: string[];
  images: string[];
  size: number;
  status: ArchivePageStatus;
  archivedAt: string;
  favicon?: string;
  errorMsg?: string;
};

export type ArchiveJobStatus = "running" | "done" | "error";

export type ArchiveJob = {
  id: string;
  rootUrl: string;
  siteName: string;
  favicon?: string;
  totalPages: number;
  donePages: number;
  status: ArchiveJobStatus;
  startedAt: string;
  finishedAt?: string;
  errorMsg?: string;
  pages: ArchivedPage[];
  cloudPath?: string;
  cloudSyncedAt?: string;
  cloudSyncPaused?: boolean;
};