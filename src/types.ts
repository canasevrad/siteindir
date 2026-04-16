export interface ArchivedPage {
  id: string;
  url: string;
  title: string;
  description: string;
  favicon: string;
  html: string;
  text: string;
  links: string[];
  images: string[];
  archivedAt: string;
  size: number;
  status: "success" | "error" | "partial";
  errorMsg?: string;
}

export interface ArchiveJob {
  id: string;
  rootUrl: string;
  siteName: string;
  favicon: string;
  totalPages: number;
  donePages: number;
  status: "idle" | "running" | "done" | "error";
  startedAt: string;
  finishedAt?: string;
  pages: ArchivedPage[];
  errorMsg?: string;
}