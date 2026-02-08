/**
 * Git Validation - Branch name and path validation
 *
 * Extracted from lib/git.ts (ORC-116)
 */

/**
 * Valid git branch name pattern (defense in depth)
 * Allows alphanumeric, dash, underscore, slash, and dot
 */
const VALID_BRANCH_NAME = /^[\w\-\/.]+$/;

/**
 * Validates a git branch name for safety and correctness
 */
export function validateBranchName(branchName: string): { valid: boolean; error?: string } {
  if (!branchName || branchName.length === 0) {
    return { valid: false, error: 'Branch name cannot be empty' };
  }
  if (branchName.length > 255) {
    return { valid: false, error: 'Branch name is too long (max 255 characters)' };
  }
  if (!VALID_BRANCH_NAME.test(branchName)) {
    return { valid: false, error: 'Branch name contains invalid characters. Use only alphanumeric, dash, underscore, slash, or dot.' };
  }
  if (branchName.startsWith('-') || branchName.startsWith('.')) {
    return { valid: false, error: 'Branch name cannot start with a dash or dot' };
  }
  if (branchName.endsWith('.lock') || branchName.endsWith('/')) {
    return { valid: false, error: 'Branch name cannot end with .lock or /' };
  }
  if (branchName.includes('..') || branchName.includes('//')) {
    return { valid: false, error: 'Branch name cannot contain consecutive dots or slashes' };
  }
  return { valid: true };
}

/**
 * Generate a slug from a title string
 * Produces a URL-safe, lowercase string with hyphens
 */
export function slugify(title: string, maxLength: number = 40): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);

  return slug || 'untitled';
}

/**
 * Generate a branch name from spec ID and title
 */
export function generateBranchName(specId: string, title: string): string {
  const slug = slugify(title, 40);
  return `spec/${specId.slice(0, 8)}-${slug}`;
}

/**
 * Generate a branch name slug from spec title
 * Returns: spec/{slug} (max 50 chars total)
 */
export function generateSpecBranchName(specTitle: string): string {
  const slug = slugify(specTitle, 44);
  const branchName = `spec/${slug}`;

  const validation = validateBranchName(branchName);
  if (!validation.valid) {
    return 'spec/untitled';
  }

  return branchName;
}
