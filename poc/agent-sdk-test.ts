import Anthropic from "@anthropic-ai/sdk";

async function testAgentSDK() {
  console.log("Testing Claude Agent SDK...\n");

  // Check for credentials
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  console.log("ANTHROPIC_API_KEY set:", !!apiKey);
  console.log("CLAUDE_CODE_OAUTH_TOKEN set:", !!oauthToken);

  // Note: The SDK uses ANTHROPIC_API_KEY by default
  // CLAUDE_CODE_OAUTH_TOKEN is for Claude Max subscription
  // Let's try using OAuth token as authToken if API key is not set

  let client: Anthropic;

  if (apiKey) {
    console.log("\nUsing ANTHROPIC_API_KEY...");
    client = new Anthropic({ apiKey });
  } else if (oauthToken) {
    console.log("\nAttempting to use CLAUDE_CODE_OAUTH_TOKEN as authToken...");
    client = new Anthropic({ authToken: oauthToken });
  } else {
    console.error("\nNo credentials found! Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN");
    return;
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [
        { role: "user", content: "Say 'Agent SDK works!' and nothing else." }
      ]
    });

    console.log("\nResponse:");
    console.log(message.content[0].type === "text" ? message.content[0].text : message.content);
    console.log("\nSuccess! SDK is working.");
  } catch (error) {
    console.error("\nError:", error);
  }
}

testAgentSDK();
