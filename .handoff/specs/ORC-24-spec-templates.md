# ORC-24: Spec Templates for Common Patterns

## Overview

Pre-built spec templates for common development patterns to accelerate spec creation.

## Context

Users start from scratch every time when creating specs. Common patterns like "Add a feature", "Fix a bug", or "Create a component" could be templated.

## Suggested Templates

- **Feature Addition**: New feature with tests
- **Bug Fix**: Investigation and fix pattern
- **Refactor**: Code improvement pattern
- **API Endpoint**: REST endpoint pattern
- **React Component**: Component with tests

## Implementation

### 1. Create Template Storage

Create `packages/dashboard/src/lib/templates.ts`:

```typescript
export interface SpecTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: string[]; // e.g., ["featureName", "filePath"]
}

export const builtInTemplates: SpecTemplate[] = [
  {
    id: 'feature',
    name: 'Feature Addition',
    description: 'Add a new feature with tests',
    content: `# Feature: {{featureName}}

## Description
{{description}}

## Requirements
- [ ] Implement core functionality
- [ ] Add unit tests
- [ ] Update documentation

## Files to modify
- {{filePath}}
`,
    variables: ['featureName', 'description', 'filePath'],
  },
  // ... more templates
];
```

### 2. Template Selection UI

Add template selection to spec creation wizard or as a starting point.

### 3. Variable Substitution

Replace `{{variable}}` placeholders with user-provided values.

## Files to Modify

- CREATE: `packages/dashboard/src/lib/templates.ts`
- MODIFY: `packages/dashboard/src/components/spec-studio/SpecStudioWizard.tsx`

## Acceptance Criteria

- [ ] Template selection in spec creation
- [ ] Templates stored as markdown with variables
- [ ] Variable substitution on template use
- [ ] User can preview before creating
