# Fundamental Fixes for Specwright Tool

## Overview
These are the critical blockers preventing the Specwright tool from being reliable for production use. Fix these in separate Claude sessions using isolated worktrees.

## Fix Priority Order

### 🔴 CRITICAL (Fix First)

#### 1. Review System Code Validation (ORC-55)
**File:** `01-review-validation.md`
**Priority:** HIGHEST - Blocks everything
**Impact:** All chunks can introduce bugs undetected
**Estimated Effort:** 3-4 hours
**Dependencies:** None

**Why First:**
- Currently review only reads AI output text
- Doesn't validate code actually works
- Build errors, import errors, type errors all slip through
- Every other fix depends on reliable review

**Worktree Branch:** `fix/orc-55-review-validation`

---

#### 2. Chunk Completion Criteria
**File:** `02-chunk-completion-criteria.md`
**Priority:** HIGH - Prevents false completions
**Impact:** Chunks marked "completed" when they did nothing
**Estimated Effort:** 2-3 hours
**Dependencies:** None (but works with #1)

**Why Second:**
- Chunks say "completed" but add no code
- Wastes time and creates confusion
- Quick win, clear validation logic

**Worktree Branch:** `fix/chunk-completion-criteria`

---

#### 3. Dependency Enforcement
**File:** `03-dependency-enforcement.md`
**Priority:** HIGH - Prevents cascading failures
**Impact:** Chunks run when prerequisites failed
**Estimated Effort:** 2-3 hours
**Dependencies:** Needs #1 (review status) to work properly

**Why Third:**
- Chunks run even when dependencies failed review
- Causes cascading failures down dependency chains
- Complements review validation

**Worktree Branch:** `fix/dependency-enforcement`

---

## 🟡 MEDIUM PRIORITY (Fix After Critical)

#### 4. Error Handling and Propagation
**Impact:** Errors get swallowed, unclear failure states
**Estimated Effort:** 3-4 hours
**Issues:**
- Specs stuck in "running" or "review"
- Silent failures
- Poor error messages

**TODO:** Create detailed prompt

---

#### 5. Database State Consistency
**Impact:** Orphaned data, inconsistent states
**Estimated Effort:** 2-3 hours
**Issues:**
- Old worktree references
- Specs in weird states
- Cleanup needed

**TODO:** Create detailed prompt

---

## 🟢 LOW PRIORITY (Nice to Have)

#### 6. Worktree Lifecycle Management
**Impact:** Disk space, stale worktrees
**Estimated Effort:** 2 hours

#### 7. Execution Timeout Recovery
**Impact:** Stuck chunks
**Estimated Effort:** 2 hours
**Note:** 15-min timeout helps but not solved

---

## Workflow for Each Fix

### Step 1: Create Worktree
```bash
cd /Users/acartagena/project/orchestrator
git worktree add ../orchestrator-fix-{issue-name} -b fix/{issue-name}
cd ../orchestrator-fix-{issue-name}
```

### Step 2: Start New Claude Session
- Open the prompt file (e.g., `01-review-validation.md`)
- Copy entire contents
- Paste into new Claude session
- Let Claude implement the fix

### Step 3: Test Thoroughly
```bash
# Run build
pnpm build

# Test with a simple spec
# Create test spec with known failure case
# Verify fix catches the issue
```

### Step 4: Create PR
```bash
git add .
git commit -m "fix: [description from prompt]"
git push origin fix/{issue-name}

# Create PR on GitHub
# Reference ORC-{number} in description
```

### Step 5: Merge and Update Main Worktree
```bash
# After PR merged
cd /Users/acartagena/project/orchestrator
git pull origin main

# Update any active spec worktrees
cd /Users/acartagena/project/orchestrator-spec-*
git fetch origin main
git rebase origin/main  # or merge
```

### Step 6: Clean Up Fix Worktree
```bash
cd /Users/acartagena/project/orchestrator
git worktree remove ../orchestrator-fix-{issue-name}
git branch -d fix/{issue-name}  # if merged
```

---

## Current Tool Limitations (Until Fixed)

### ❌ DON'T Use Tool For:
- Core infrastructure refactoring
- Multi-file architectural changes
- Features requiring real-time debugging
- Complex interdependent chunks
- Anything critical to product function

### ✅ DO Use Tool For (After Fixes):
- Isolated feature additions
- UI components with clear mockups
- API endpoints with defined contracts
- Database schema additions
- Bug fixes with reproduction steps
- Documentation

---

## Testing Strategy

### After Fix #1 (Review Validation):
**Test with intentionally broken chunk:**
1. Create spec: "Add broken import"
2. Chunk should fail build
3. Review should auto-fail
4. No commit should be created

### After Fix #2 (Completion Criteria):
**Test with no-op chunk:**
1. Create spec: "Do nothing task"
2. Chunk completes but makes no changes
3. Should auto-fail with "no file changes"
4. Review never runs (fast fail)

### After Fix #3 (Dependencies):
**Test with dependency chain:**
1. Create spec with 3 dependent chunks
2. Make chunk 2 fail review
3. Chunks 3 should be blocked
4. Clear error message shown

---

## Success Metrics

### Before Fixes:
- ❌ ~40% of chunks pass review incorrectly
- ❌ Build breaks slip through
- ❌ Dependent chunks run after failures
- ❌ No validation of actual work done

### After Fixes:
- ✅ 0% false positives (chunks don't pass when broken)
- ✅ Build failures caught before commit
- ✅ Dependency chains stop at first failure
- ✅ Chunks validated for actual file changes
- ✅ Clear error messages at each failure point

---

## Database Location

```bash
~/.specwright/orchestrator.db
```

**Backup before major changes:**
```bash
cp ~/.specwright/orchestrator.db ~/.specwright/orchestrator.db.backup-$(date +%Y%m%d)
```

---

## Questions? Issues?

If a prompt is unclear or needs more context:
1. Read the referenced source files first
2. Run the code in the worktree to understand current behavior
3. Check git history for related changes
4. Ask clarifying questions in the fix session

---

## After All Fixes Complete

Return to original session and we can:
1. ✅ Use the tool confidently for appropriate tasks
2. ✅ Create specs for UI features
3. ✅ Add isolated components
4. ✅ Trust the review process
5. ✅ Build the product with AI assistance

---

**Start with Fix #1 (Review Validation) - it's the foundation for everything else.**
