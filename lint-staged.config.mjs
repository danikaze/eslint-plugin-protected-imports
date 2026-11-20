/** Staged paths that trigger project-wide type checking and linting. */
const CHECKED_FILES =
  '{*.{ts,tsx,mts,cts,js,jsx,mjs,cjs},tsconfig*.json,package.json}';

/** Returns whole-project checks without passing staged filenames to them. */
function checkProject() {
  return ['npm run typecheck', 'npm run lint'];
}

// The pre-commit hook runs these groups serially so formatting happens first.
// lint-staged hides unstaged edits in partially staged files by default.
export default {
  '*': 'npm run format --',
  [CHECKED_FILES]: checkProject,
};
