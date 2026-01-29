# LLM Chat Application with Z.AI

A simple, ready-to-deploy chat application template powered by OpenAI-compatible APIs through Z.AI. This template provides a clean starting point for building AI chat applications with streaming responses, markdown rendering, and thinking mode display.

## Demo

This template demonstrates how to build an AI-powered chat interface using the Z.AI API endpoint with streaming responses. It features:

- Real-time streaming of AI responses using Server-Sent Events (SSE)
- Markdown rendering for rich text formatting
- Collapsible "thinking process" display for reasoning models
- Clean, responsive UI that works on mobile and desktop

## Features

- 💬 Simple and responsive chat interface
- ⚡ Server-Sent Events (SSE) for streaming responses
- 🧠 Powered by Z.AI OpenAI-compatible API (glm-4.7 model)
- 🛠️ Built with TypeScript and Cloudflare Workers
- 📱 Mobile-friendly design
- 🔄 Maintains chat history on the client
- 📝 Full markdown rendering support
- 💭 Collapsible thinking mode display
- 🔒 Secure secret management
- 🔎 Built-in Observability logging

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- A Cloudflare account for deployment
- Z.AI API key

### Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/cloudflare/templates.git
   cd templates/llm-chat-app
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Generate Worker type definitions:
   ```bash
   npm run cf-typegen
   ```

4. Configure the Z.AI API Key secret:

   The application requires a Cloudflare Worker secret named `Z_AI_API_KEY` containing your Z.AI API key.
   
   **For production deployment:**
   - Set the secret via the Cloudflare dashboard: Workers & Pages > Your Worker > Settings > Variables and Secrets
   - Or use the Wrangler CLI:
     ```bash
     wrangler secret put Z_AI_API_KEY
     ```
   
   **For local development:**
   - Create a `.dev.vars` file in the project root:
     ```
     Z_AI_API_KEY=your_api_key_here
     ```
   - Note: `.dev.vars` is already in `.gitignore` to prevent accidental commits

### Development

Start a local development server:

```bash
npm run dev
```

This will start a local server at http://localhost:8787.

Note: Using Workers AI accesses your Cloudflare account even during local development, which will incur usage charges.

### Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

### Monitor

View real-time logs associated with any deployed Worker:

```bash
npm wrangler tail
```

## Project Structure

```
/
├── public/             # Static assets
│   ├── index.html      # Chat UI HTML
│   └── chat.js         # Chat UI frontend script
├── src/
│   ├── index.ts        # Main Worker entry point
│   └── types.ts        # TypeScript type definitions
├── test/               # Test files
├── wrangler.jsonc      # Cloudflare Worker configuration
├── tsconfig.json       # TypeScript configuration
└── README.md           # This documentation
```

## How It Works

### Backend

The backend is built with Cloudflare Workers and uses the Z.AI OpenAI-compatible API to generate responses. The main components are:

1. **API Endpoint** (`/api/chat`): Accepts POST requests with chat messages and streams responses
2. **Streaming**: Uses Server-Sent Events (SSE) for real-time streaming of AI responses
3. **OpenAI SDK**: Integrates with Z.AI API using the OpenAI SDK with custom base URL
4. **Secret Management**: API key stored securely as Cloudflare Worker secret (`Z_AI_API_KEY`)

### Frontend

The frontend is a simple HTML/CSS/JavaScript application that:

1. Presents a chat interface with markdown support
2. Sends user messages to the API
3. Processes streaming responses in real-time with both thinking and response content
4. Maintains chat history on the client side
5. Renders markdown formatting (bold, italic, code blocks, lists, links, etc.)
6. Displays collapsible thinking process section for reasoning models

## Customization

### Changing the Model

To use a different AI model, update the `MODEL_ID` constant in `src/index.ts`. The current implementation uses `glm-4.7` which supports thinking mode.

### Changing the API Endpoint

To use a different OpenAI-compatible API, update the `OPENAI_API_BASE` constant in `src/index.ts` and ensure your `Z_AI_API_KEY` secret is configured for that API.

### Modifying the System Prompt

The default system prompt can be changed by updating the `SYSTEM_PROMPT` constant in `src/index.ts`.

### Styling

The UI styling is contained in the `<style>` section of `public/index.html`. You can modify the CSS variables at the top to quickly change the color scheme.

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [Z.AI API Documentation](https://api.z.ai/docs)
