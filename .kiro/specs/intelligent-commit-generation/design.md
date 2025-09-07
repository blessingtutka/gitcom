# Design Document

## Overview

The intelligent commit generation feature transforms the GitCom extension into a smart AI assistant that can analyze code changes, automatically group related files, and create multiple structured commits with meaningful messages. The system uses file analysis, change pattern recognition, and conventional commit standards to create a clean, professional commit history.

## Architecture

### Core Components

1. **ChangeAnalyzer** - Analyzes unstaged files and their changes
2. **CommitGrouper** - Groups related changes into logical commits
3. **MessageGenerator** - Generates intelligent commit messages
4. **CommitOrchestrator** - Manages the staging and commit process
5. **PreviewUI** - Displays commit plan for user review

### Data Flow

```
Unstaged Files → ChangeAnalyzer → CommitGrouper → MessageGenerator → PreviewUI → CommitOrchestrator → Git Commits
```

## Components and Interfaces

### ChangeAnalyzer

```javascript
class ChangeAnalyzer {
    async analyzeUnstagedChanges()
    async getFileChanges(filePath)
    async detectChangeType(filePath, diff)
    async analyzeFileRelationships(files)
}
```

**Responsibilities:**
- Scan all unstaged files in the repository
- Analyze diff content for each file
- Detect change types (feature, fix, docs, test, etc.)
- Identify file relationships and dependencies

### CommitGrouper

```javascript
class CommitGrouper {
    async groupChanges(analyzedChanges)
    async detectFeatureGroups(changes)
    async separateChangeTypes(changes)
    async orderCommitGroups(groups)
}
```

**Responsibilities:**
- Group related files into logical commits
- Separate different types of changes (features, fixes, docs)
- Determine optimal commit order
- Handle cross-cutting concerns

### MessageGenerator

```javascript
class MessageGenerator {
    async generateCommitMessage(commitGroup)
    async detectCommitType(changes)
    async detectScope(filePaths)
    async generateDescription(changes, type, scope)
}
```

**Responsibilities:**
- Generate conventional commit messages
- Detect appropriate commit types and scopes
- Create descriptive but concise commit descriptions
- Handle breaking change detection

### CommitOrchestrator

```javascript
class CommitOrchestrator {
    async executeCommitPlan(commitPlan)
    async stageFiles(files)
    async createCommit(message)
    async handleCommitFailure(error, context)
}
```

**Responsibilities:**
- Execute the approved commit plan
- Stage files for each commit group
- Create commits in the correct order
- Handle errors and rollback if needed

## Data Models

### AnalyzedChange

```javascript
{
    filePath: string,
    changeType: 'added' | 'modified' | 'deleted' | 'renamed',
    diff: string,
    linesAdded: number,
    linesRemoved: number,
    fileCategory: 'feature' | 'test' | 'docs' | 'config' | 'style',
    detectedFeatures: string[],
    dependencies: string[]
}
```

### CommitGroup

```javascript
{
    id: string,
    type: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore',
    scope: string | null,
    description: string,
    files: AnalyzedChange[],
    message: string,
    priority: number
}
```

### CommitPlan

```javascript
{
    groups: CommitGroup[],
    totalFiles: number,
    estimatedTime: number,
    warnings: string[]
}
```

## Error Handling

### Analysis Errors
- **Git repository not found**: Display clear message to initialize git
- **No unstaged changes**: Inform user no changes to commit
- **File access errors**: Skip problematic files with warning

### Grouping Errors
- **Complex dependencies**: Fall back to single commit with warning
- **Conflicting changes**: Prompt user for manual resolution

### Commit Errors
- **Staging failures**: Stop process and show git error
- **Commit failures**: Rollback staged changes and report error
- **Permission errors**: Guide user to resolve git configuration

## Testing Strategy

### Unit Tests
- Test each component in isolation
- Mock git operations for consistent testing
- Test error handling scenarios
- Validate commit message generation

### Integration Tests
- Test full workflow with sample repositories
- Test various file change scenarios
- Test error recovery mechanisms
- Validate git operations

### User Acceptance Tests
- Test with real development scenarios
- Validate commit message quality
- Test user workflow and experience
- Performance testing with large changesets

## Performance Considerations

### File Analysis Optimization
- Process files in parallel where possible
- Cache analysis results for unchanged files
- Limit analysis depth for very large files
- Use streaming for large diff processing

### Memory Management
- Process large changesets in batches
- Clean up temporary data structures
- Limit concurrent git operations

### User Experience
- Show progress for long-running operations
- Allow cancellation of analysis process
- Provide estimated completion times
- Stream results as they become available

## Security Considerations

### Git Operations
- Validate all file paths to prevent directory traversal
- Sanitize commit messages to prevent injection
- Respect git hooks and pre-commit validations
- Handle sensitive files appropriately

### File Access
- Only access files within the git repository
- Respect .gitignore patterns
- Handle permission-restricted files gracefully

## Configuration Options

### Analysis Settings
- `maxFilesPerCommit`: Maximum files in a single commit (default: 10)
- `enableFeatureDetection`: Enable intelligent feature grouping (default: true)
- `separateTestCommits`: Create separate commits for tests (default: true)
- `maxCommitMessageLength`: Maximum commit message length (default: 72)

### Grouping Settings
- `groupingStrategy`: 'intelligent' | 'by-type' | 'by-directory' (default: 'intelligent')
- `enableBreakingChangeDetection`: Detect breaking changes (default: true)
- `prioritizeFeatures`: Commit features before fixes (default: true)

## Implementation Phases

### Phase 1: Core Analysis
- Implement ChangeAnalyzer
- Basic file change detection
- Simple change type classification

### Phase 2: Intelligent Grouping
- Implement CommitGrouper
- Feature detection and grouping
- Dependency analysis

### Phase 3: Message Generation
- Implement MessageGenerator
- Conventional commit format
- Scope and type detection

### Phase 4: Orchestration
- Implement CommitOrchestrator
- Git staging and commit operations
- Error handling and rollback

### Phase 5: User Interface
- Enhanced preview UI
- Interactive commit plan editing
- Progress indicators and feedback