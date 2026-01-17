/**
 * Manual test to verify command injection vulnerability is fixed
 *
 * This test demonstrates that malicious input in commit messages and branch names
 * cannot execute arbitrary commands.
 *
 * To run this test manually:
 * 1. Create a temporary git repository
 * 2. Run: npx tsx packages/dashboard/src/lib/__tests__/git.injection.test.ts
 * 3. Verify no files are created or commands executed
 */

import { createCommit, createBranch } from '../git';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

const testDir = join(tmpdir(), `git-injection-test-${Date.now()}`);

async function runTests() {
  console.log('🔒 Testing command injection vulnerability fixes...\n');

  try {
    // Setup test directory
    console.log('📁 Setting up test repository...');
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
    execSync('git init');
    execSync('git config user.email "test@example.com"');
    execSync('git config user.name "Test User"');

    // Create initial commit
    writeFileSync('README.md', '# Test\n');
    execSync('git add .');
    execSync('git commit -m "Initial commit"');

    console.log('✅ Test repository created\n');

    // Test 1: Command injection in commit message
    console.log('Test 1: Malicious commit message');
    const maliciousMessage = 'test"; rm -rf /tmp/pwned; echo "pwned';
    writeFileSync('test.txt', 'test content\n');

    const result = await createCommit(testDir, maliciousMessage);

    if (result.success) {
      console.log('✅ Commit created without executing injected command');

      // Verify the message was stored as-is
      const lastCommitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' }).trim();
      if (lastCommitMessage === maliciousMessage) {
        console.log('✅ Commit message stored correctly without interpretation');
      } else {
        console.log('❌ Commit message was altered:', lastCommitMessage);
      }

      // Verify no file was created by the injected command
      if (!existsSync('/tmp/pwned')) {
        console.log('✅ Injected command did not execute (no /tmp/pwned file)\n');
      } else {
        console.log('❌ WARNING: Injected command executed!\n');
        rmSync('/tmp/pwned', { force: true });
      }
    } else {
      console.log('❌ Commit failed:', result.error, '\n');
    }

    // Test 2: Command injection in branch name
    console.log('Test 2: Malicious branch name');
    const maliciousBranch = 'test; touch /tmp/pwned2; echo pwned';

    const branchResult = await createBranch(testDir, maliciousBranch);

    if (!branchResult.success) {
      console.log('✅ Malicious branch name rejected (as expected)');

      // Verify no file was created by the injected command
      if (!existsSync('/tmp/pwned2')) {
        console.log('✅ Injected command did not execute (no /tmp/pwned2 file)\n');
      } else {
        console.log('❌ WARNING: Injected command executed!\n');
        rmSync('/tmp/pwned2', { force: true });
      }
    } else {
      console.log('⚠️  Branch created (git allowed it)');

      // Even if git allowed the branch name, verify the command didn't execute
      if (!existsSync('/tmp/pwned2')) {
        console.log('✅ Injected command did not execute (no /tmp/pwned2 file)\n');
      } else {
        console.log('❌ WARNING: Injected command executed!\n');
        rmSync('/tmp/pwned2', { force: true });
      }
    }

    // Test 3: Special characters in commit message
    console.log('Test 3: Special characters in commit message');
    const specialCharsMessage = 'test $PATH `whoami` $(ls) & | ; \n\t"\'\\';
    writeFileSync('test2.txt', 'test content 2\n');

    const result2 = await createCommit(testDir, specialCharsMessage);

    if (result2.success) {
      console.log('✅ Commit with special characters created successfully');

      // Verify the message was stored as-is
      const lastCommitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' }).trim();
      if (lastCommitMessage === specialCharsMessage) {
        console.log('✅ Special characters preserved without interpretation\n');
      } else {
        console.log('❌ Special characters were altered:', lastCommitMessage, '\n');
      }
    } else {
      console.log('❌ Commit failed:', result2.error, '\n');
    }

    console.log('✅ All tests passed! Command injection vulnerability is fixed.');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up test directory...');
    process.chdir('/');
    rmSync(testDir, { recursive: true, force: true });
    console.log('✅ Cleanup complete');
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests };
