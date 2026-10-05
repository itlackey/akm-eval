# Primary References

These sources define the interoperability and evaluation assumptions used by
this pack. Recheck them before changing the skill format or client adapters.

- Agent Skills specification: <https://agentskills.io/specification>
- OpenAI skill authoring: <https://learn.chatgpt.com/docs/build-skills>
- OpenAI repository guidance: <https://learn.chatgpt.com/docs/agent-configuration/agents-md>
- OpenAI skill evaluations: <https://developers.openai.com/blog/eval-skills>
- Anthropic Agent Skills best practices: <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
- Claude Code skills: <https://docs.anthropic.com/en/docs/claude-code/skills>
- Claude Code practices: <https://www.anthropic.com/engineering/claude-code-best-practices>
- Anthropic context engineering: <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
- GitHub technical-debt tutorial: <https://docs.github.com/en/copilot/tutorials/reduce-technical-debt>
- GitHub repository instructions: <https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions>
- Cursor agent practices: <https://cursor.com/blog/agent-best-practices>

Portable skills keep top-level frontmatter to fields allowed by the Agent Skills
specification. AKM annotations live in the standard flat `metadata` map. Client
specific behavior belongs in thin repository entry points rather than copied
skill bodies.
