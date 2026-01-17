# Changelog

## 1.0.0 (2026-01-17)


### Features

* add /full-review slash command for codebase review ([b6336e2](https://github.com/acartag7/glm-orchestrator/commit/b6336e296d427ab2cd731f74cc29448df6edd1cc))
* add ErrorBoundary component to prevent page crashes ([2c5bd37](https://github.com/acartag7/glm-orchestrator/commit/2c5bd376867fe378b61311120d7c31ba27644042))
* add loading state to workers page ([4d30967](https://github.com/acartag7/glm-orchestrator/commit/4d30967f13d0009ba4d3d0fb337c7a5c0fb50a9a))
* add npm token expiry reminder workflow ([5fce933](https://github.com/acartag7/glm-orchestrator/commit/5fce9331be0ab3d10fe90d49c52aa90704196b87))
* add pre-commit hook to detect secrets ([4ca64ce](https://github.com/acartag7/glm-orchestrator/commit/4ca64ced202d95de44ca8c73280b3195f0cda1d1))
* add Toast notification system and ConfirmModal component ([af71213](https://github.com/acartag7/glm-orchestrator/commit/af71213e266637a7db85e143a0d00d610d6e1e5b))
* add unsaved changes warning to SpecStudioWizard ([63eb748](https://github.com/acartag7/glm-orchestrator/commit/63eb7485d5d49206eed16d206c3649c53d47d9a8))
* chunk dependencies, context passing, and codebase analysis ([1042c32](https://github.com/acartag7/glm-orchestrator/commit/1042c325db93df051cd6aa6ee0fc76108ed40be3))
* configuration system - executor/planner/reviewer selection ([7ba54d9](https://github.com/acartag7/glm-orchestrator/commit/7ba54d9fee37e952da3a8ef8d6d7a84a372f9552))
* MVP Day 1 - Foundation complete ([85994c3](https://github.com/acartag7/glm-orchestrator/commit/85994c3139554c4e862247a5572ffc2722390146))
* MVP Day 2 - Spec & Chunks complete ([a06e3a1](https://github.com/acartag7/glm-orchestrator/commit/a06e3a166643206b7719f223a77e5fa82056ec13))
* MVP Day 3 - Execution complete ([4617810](https://github.com/acartag7/glm-orchestrator/commit/46178101e9ce41642287b1bb55862fd450066b5f))
* Phase 2 Day 2 - Review Loop ([4caf362](https://github.com/acartag7/glm-orchestrator/commit/4caf362f4953790904e98479103d6e10a6099bd4))
* Phase 2 Day 3 - Run All Chunks ([c0328b8](https://github.com/acartag7/glm-orchestrator/commit/c0328b8afcda3595073622f67caca682ff30f95c))
* Phase 2 Day 4 - Git Integration ([4c624e9](https://github.com/acartag7/glm-orchestrator/commit/4c624e914c44eb7e05488270755cd9efcc33ca7e))
* Phase 4 - Multiple GLM Workers with queue management ([b4b70ea](https://github.com/acartag7/glm-orchestrator/commit/b4b70ea9c6bcfaee41c8a4942cffb4f43338105d))
* security hardening and dashboard DB integration ([5793f21](https://github.com/acartag7/glm-orchestrator/commit/5793f218a9b151e49a04b50c06202014ecefc6c1))
* Spec Studio wizard and Phase 2 multi-spec foundation ([6d325e6](https://github.com/acartag7/glm-orchestrator/commit/6d325e61843b1e725b1a2ffd0919f6759219e2c9))


### Bug Fixes

* convert parallel chunk execution to sequential to avoid race condition ([ca97c64](https://github.com/acartag7/glm-orchestrator/commit/ca97c64076d047a1ab166d310127ed11ef6dfdf6))
* Day 4-5 bug fixes and execution history ([4f6534c](https://github.com/acartag7/glm-orchestrator/commit/4f6534c5c68cce45ffb623fe7e750c1d0a067af1))
* handle unknown spec status in SpecCard to prevent crash ([69d9ebd](https://github.com/acartag7/glm-orchestrator/commit/69d9ebdcfac930e26b818a70ef453b4b488b900b))
* memory leaks in execution service ([b2e0191](https://github.com/acartag7/glm-orchestrator/commit/b2e0191d0cd8fa45525ac9619348a3395686ad3d))
* prevent SSE errors when user navigates away during run-all ([60a7787](https://github.com/acartag7/glm-orchestrator/commit/60a7787101e40f2a62fadadb9136daf2c24aac12))
* show toast notification when project deletion fails ([d6deace](https://github.com/acartag7/glm-orchestrator/commit/d6deacef2afba07e778a628bcabe81be11f89e1e))
* simplify Claude CLI path detection ([6695f9c](https://github.com/acartag7/glm-orchestrator/commit/6695f9cca5f38d915b88444316c407d4ef525034))
* use crypto.randomUUID() and add DB_PATH env var support ([92af070](https://github.com/acartag7/glm-orchestrator/commit/92af070ff99cd8c6f934d7e078949cdc2f3e5537))
