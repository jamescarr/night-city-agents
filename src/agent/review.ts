/**
 * Night City Changeset Review Agent
 *
 * Analyzes a merge request changeset and posts a review comment back
 * to the GitLab API (real or simulated). Designed to run as a
 * container step inside an Argo Workflow.
 *
 * Input:  EVENT_PAYLOAD env var (JSON-encoded MergeRequestEvent)
 * Output: POST review comment to GitLab notes endpoint
 *
 * The agent uses Claude to analyze the diff, identify issues, and
 * generate structured review feedback with file-level comments.
 */

import { generateText, tool, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import type {
  MergeRequestEvent,
  ReviewComment,
  FileComment,
  ChangesetFile,
} from '../shared/types.js';

const GITLAB_SIM_URL = process.env.GITLAB_SIM_URL || 'http://gitlab-sim:3001';
const MODEL = process.env.MODEL || 'claude-sonnet-4-5-20250929';

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BRIGHT = '\x1b[1m';
const RESET = '\x1b[0m';

const SYSTEM_PROMPT = `You are NETWATCH CODE REVIEWER, an elite AI code review agent operating in Night City's
Arasaka DevOps Division. You review merge request changesets with a focus on:

- Security vulnerabilities and injection risks
- Logic errors and edge cases
- Performance concerns
- Code style and maintainability
- Missing error handling

Your review style is direct and technical. Use the submit_review tool to post your findings.
For each file with issues, include specific file comments with line references when possible.

Rate the overall severity:
- info: Clean code, minor style notes at most
- suggestion: Improvements recommended but not blocking
- warning: Issues that should be addressed before merge
- critical: Security or correctness problems that must be fixed`;

async function main() {
  const eventJson = process.env.EVENT_PAYLOAD;
  if (!eventJson) {
    console.error(`${RED}ERROR: EVENT_PAYLOAD environment variable not set${RESET}`);
    process.exit(1);
  }

  let event: MergeRequestEvent;
  try {
    event = JSON.parse(eventJson);
  } catch {
    console.error(`${RED}ERROR: Failed to parse EVENT_PAYLOAD as JSON${RESET}`);
    process.exit(1);
  }

  const mrIid = event.object_attributes.iid;
  const projectId = event.project.id;
  const title = event.object_attributes.title;
  const author = event.object_attributes.author.handle;

  console.log(`${CYAN}${'='.repeat(60)}${RESET}`);
  console.log(`${BRIGHT}${CYAN}  NETWATCH CODE REVIEWER // CHANGESET ANALYSIS${RESET}`);
  console.log(`${CYAN}${'='.repeat(60)}${RESET}`);
  console.log('');
  console.log(`${DIM}  MR:${RESET}      !${mrIid} - ${title}`);
  console.log(`${DIM}  Author:${RESET}  ${author}`);
  console.log(`${DIM}  Files:${RESET}   ${event.changes.length} changed`);
  console.log(`${DIM}  Model:${RESET}   ${MODEL}`);
  console.log('');

  const diffSummary = formatDiffForLLM(event.changes);

  console.log(`${DIM}  Analyzing changeset...${RESET}`);
  console.log('');

  let submittedReview: ReviewComment | null = null;

  const result = await generateText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(event, diffSummary),
    tools: {
      submit_review: tool({
        description: 'Submit a code review comment on the merge request',
        inputSchema: z.object({
          summary: z.string().describe('Overall review summary (markdown supported)'),
          severity: z.enum(['info', 'suggestion', 'warning', 'critical']).describe('Overall severity'),
          file_comments: z.array(z.object({
            path: z.string().describe('File path'),
            line: z.number().nullable().describe('Line number (null for general file comment)'),
            body: z.string().describe('Comment body'),
            severity: z.enum(['info', 'suggestion', 'warning', 'critical']),
          })).describe('Per-file comments'),
        }),
        execute: async ({ summary, severity, file_comments }) => {
          const review: ReviewComment = {
            merge_request_iid: mrIid,
            project_id: projectId,
            author: 'NetWatch Code Reviewer',
            body: summary,
            severity,
            file_comments: file_comments as FileComment[],
            timestamp: new Date().toISOString(),
          };

          submittedReview = review;

          console.log(`${GREEN}  Review generated (${severity.toUpperCase()})${RESET}`);
          console.log(`${DIM}  ${file_comments.length} file comment(s)${RESET}`);

          return { status: 'submitted', severity, file_comment_count: file_comments.length };
        },
      }),
    },
    stopWhen: stepCountIs(3),
  });

  if (!submittedReview) {
    console.log(`${YELLOW}  Agent did not call submit_review, constructing from text...${RESET}`);
    submittedReview = {
      merge_request_iid: mrIid,
      project_id: projectId,
      author: 'NetWatch Code Reviewer',
      body: result.text || 'Review completed with no specific findings.',
      severity: 'info',
      file_comments: [],
      timestamp: new Date().toISOString(),
    };
  }

  // Post the review to the GitLab simulator
  const notesUrl = `${GITLAB_SIM_URL}/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes`;
  console.log('');
  console.log(`${DIM}  Posting review to ${notesUrl}${RESET}`);

  try {
    const response = await fetch(notesUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submittedReview),
    });

    if (response.ok) {
      console.log(`${GREEN}  Review posted successfully${RESET}`);
    } else {
      const body = await response.text();
      console.error(`${RED}  Failed to post review (${response.status}): ${body}${RESET}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`${RED}  Failed to reach GitLab: ${error instanceof Error ? error.message : error}${RESET}`);
    process.exit(1);
  }

  console.log('');
  console.log(`${CYAN}${'='.repeat(60)}${RESET}`);
  console.log(`${GREEN}  REVIEW COMPLETE${RESET}`);
  console.log(`${CYAN}${'='.repeat(60)}${RESET}`);
}

function formatDiffForLLM(changes: ChangesetFile[]): string {
  return changes.map((c) => {
    const status = c.new_file ? '[NEW]' : c.deleted_file ? '[DELETED]' : c.renamed_file ? '[RENAMED]' : '[MODIFIED]';
    return `${status} ${c.new_path}\n${c.diff}`;
  }).join('\n\n');
}

function buildPrompt(event: MergeRequestEvent, diffSummary: string): string {
  return `Review this merge request changeset.

**MR !${event.object_attributes.iid}**: ${event.object_attributes.title}
**Author**: ${event.object_attributes.author.handle} (${event.object_attributes.author.name})
**Branch**: ${event.object_attributes.source_branch} -> ${event.object_attributes.target_branch}
**Description**: ${event.object_attributes.description || 'No description provided.'}

## Changeset (${event.changes.length} files)

\`\`\`diff
${diffSummary}
\`\`\`

Analyze each changed file. Use the submit_review tool to post your review.`;
}

main().catch((err) => {
  console.error(`${RED}Agent crashed: ${err}${RESET}`);
  process.exit(1);
});
