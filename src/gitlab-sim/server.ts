/**
 * Night City GitLab Simulator
 *
 * Simulates a GitLab instance that receives merge request comments
 * via its REST API. In the real world, this would be your actual
 * GitLab/GitHub API endpoint. Here, it logs the formatted review
 * comment to the terminal with cyberpunk flair.
 *
 * Endpoints:
 *   POST /api/v4/projects/:id/merge_requests/:iid/notes  - Receive a review comment
 *   GET  /health                                           - Health check
 */

import express from 'express';
import type { ReviewComment } from '../shared/types.js';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3001', 10);

const SEVERITY_ICONS: Record<string, string> = {
  info: 'i',
  suggestion: '*',
  warning: '!',
  critical: 'X',
};

const SEVERITY_COLORS: Record<string, string> = {
  info: '\x1b[36m',       // cyan
  suggestion: '\x1b[33m', // yellow
  warning: '\x1b[35m',    // magenta
  critical: '\x1b[31m',   // red
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BRIGHT = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';

function formatComment(projectId: string, mrIid: string, comment: ReviewComment): string {
  const lines: string[] = [];
  const width = 72;

  lines.push('');
  lines.push(`${CYAN}${'='.repeat(width)}${RESET}`);
  lines.push(`${BRIGHT}${CYAN}  INCOMING REVIEW COMMENT // MR !${mrIid}${RESET}`);
  lines.push(`${CYAN}${'='.repeat(width)}${RESET}`);
  lines.push('');
  lines.push(`${DIM}  Project:${RESET}  ${projectId}`);
  lines.push(`${DIM}  Author:${RESET}   ${comment.author}`);
  lines.push(`${DIM}  Time:${RESET}     ${comment.timestamp}`);

  const severityColor = SEVERITY_COLORS[comment.severity] || '';
  lines.push(`${DIM}  Severity:${RESET} ${severityColor}${comment.severity.toUpperCase()}${RESET}`);

  lines.push('');
  lines.push(`${DIM}  ${'─'.repeat(width - 4)}${RESET}`);
  lines.push('');

  for (const line of comment.body.split('\n')) {
    lines.push(`  ${line}`);
  }

  if (comment.file_comments.length > 0) {
    lines.push('');
    lines.push(`${DIM}  ${'─'.repeat(width - 4)}${RESET}`);
    lines.push(`${BRIGHT}  FILE COMMENTS (${comment.file_comments.length})${RESET}`);
    lines.push('');

    for (const fc of comment.file_comments) {
      const icon = SEVERITY_ICONS[fc.severity] || '?';
      const color = SEVERITY_COLORS[fc.severity] || '';
      const location = fc.line ? `${fc.path}:${fc.line}` : fc.path;
      lines.push(`  ${color}[${icon}]${RESET} ${BRIGHT}${location}${RESET}`);
      for (const bodyLine of fc.body.split('\n')) {
        lines.push(`      ${bodyLine}`);
      }
      lines.push('');
    }
  }

  lines.push(`${CYAN}${'='.repeat(width)}${RESET}`);
  lines.push('');

  return lines.join('\n');
}

// GitLab-compatible notes endpoint
app.post('/api/v4/projects/:projectId/merge_requests/:mrIid/notes', (req, res) => {
  const { projectId, mrIid } = req.params;
  const comment = req.body as ReviewComment;

  console.log(formatComment(projectId, mrIid, comment));

  res.status(201).json({
    id: Date.now(),
    body: comment.body,
    author: { username: comment.author },
    created_at: comment.timestamp,
    system: false,
    noteable_type: 'MergeRequest',
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'operational', service: 'night-city-gitlab-sim' });
});

app.listen(PORT, () => {
  console.log(`${CYAN}${'='.repeat(50)}${RESET}`);
  console.log(`${BRIGHT}${CYAN}  NIGHT CITY GITLAB SIMULATOR${RESET}`);
  console.log(`${DIM}  Arasaka DevOps Division // Merge Request API${RESET}`);
  console.log(`${CYAN}${'='.repeat(50)}${RESET}`);
  console.log('');
  console.log(`  ${GREEN}ONLINE${RESET} on port ${PORT}`);
  console.log(`  POST /api/v4/projects/:id/merge_requests/:iid/notes`);
  console.log('');
  console.log(`${DIM}  Waiting for review comments...${RESET}`);
  console.log('');
});
