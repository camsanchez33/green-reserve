// PostToolUse hook: SWC-parity parse check on every .ts/.tsx/.js/.jsx Claude edits.
// Zero tokens — runs as a process, not a prompt. Replaces the manual "run the
// @babel/parser check on every .tsx you touched" step, and catches the truncation /
// missing-</div> / multi-line-ternary hazards in CLAUDE.md the moment they happen,
// in the main thread AND inside worktree workers (the worktree has its own copy of
// this file; require() walks up to the repo's node_modules).
//
// Wired in .claude/settings.json. Reads the hook JSON from stdin; on a parse failure
// returns additionalContext so Claude sees the exact line before it moves on.
// Always exits 0 — PostToolUse cannot block, and a hook crash must never stall a run.
const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  try {
    const hook = JSON.parse(input || '{}');
    const file = hook.tool_input && hook.tool_input.file_path;
    if (!file || !/\.(tsx?|jsx?)$/.test(file) || file.endsWith('.d.ts')) return;
    const abs = path.isAbsolute(file) ? file : path.join(hook.cwd || process.cwd(), file);
    if (!fs.existsSync(abs)) return;
    const { parse } = require('@babel/parser');
    const src = fs.readFileSync(abs, 'utf8');
    try {
      parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    } catch (e) {
      const line = e.loc && e.loc.line;
      const msg = `PARSE FAIL ${file} line ${line}: ${e.message}. This will break the Vercel build (parse errors fail, type errors don't). Fix it before editing anything else. If the error is far from your edit, suspect a missing closing tag or a multi-line JSX ternary earlier in the file.`;
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } })
      );
    }
  } catch (e) {
    // Never fail the run because the hook failed.
    process.stderr.write('parse-on-edit hook error: ' + (e && e.message));
  }
});
