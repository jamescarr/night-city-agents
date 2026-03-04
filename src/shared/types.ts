/**
 * Night City Code Review Agent - Shared Types
 *
 * Domain types for the event-driven changeset review system.
 * All services (GitLab sim, webhook gateway, review agent) share these.
 */

export interface MergeRequestEvent {
  object_kind: 'merge_request';
  project: {
    id: number;
    name: string;
    namespace: string;
    web_url: string;
  };
  object_attributes: {
    iid: number;
    title: string;
    description: string;
    source_branch: string;
    target_branch: string;
    state: 'opened' | 'merged' | 'closed';
    action: 'open' | 'update' | 'merge' | 'close';
    author: {
      handle: string;
      name: string;
    };
    url: string;
  };
  changes: ChangesetFile[];
}

export interface ChangesetFile {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
}

export interface ReviewComment {
  merge_request_iid: number;
  project_id: number;
  author: string;
  body: string;
  severity: 'info' | 'suggestion' | 'warning' | 'critical';
  file_comments: FileComment[];
  timestamp: string;
}

export interface FileComment {
  path: string;
  line: number | null;
  body: string;
  severity: 'info' | 'suggestion' | 'warning' | 'critical';
}

export interface AgentConfig {
  gitlabSimUrl: string;
  model: string;
}
