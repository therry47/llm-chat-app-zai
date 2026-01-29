/**
 * LLM Chat App Frontend
 *
 * Handles the chat UI interactions and communication with the backend API.
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

// Chat state
let chatHistory = [
	{
		role: "assistant",
		content:
			"Hello! I'm an LLM chat app powered by Cloudflare Workers AI. How can I help you today?",
	},
];
let isProcessing = false;

/**
 * Parse markdown to HTML safely
 */
function parseMarkdown(text) {
	// Escape HTML to prevent XSS
	function escapeHtml(unsafe) {
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}
	
	// Parse markdown syntax
	let html = escapeHtml(text);
	
	// Code blocks (must be before inline code)
	html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
		return '<pre><code>' + code.trim() + '</code></pre>';
	});
	
	// Inline code
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
	
	// Bold
	html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	
	// Italic
	html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
	html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
	
	// Headers
	html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
	html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
	html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
	
	// Links
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (match, text, url) {
		// Sanitize URL: allow http, https, mailto, relative and hash links
		var trimmedUrl = (url || "").trim();
		var lowerUrl = trimmedUrl.toLowerCase();
		
		var isAllowedScheme =
			lowerUrl.startsWith("http://") ||
			lowerUrl.startsWith("https://") ||
			lowerUrl.startsWith("mailto:");
		
		var isRelativeOrHash =
			trimmedUrl.startsWith("/") ||
			trimmedUrl.startsWith("#") ||
			// No colon means no explicit scheme (e.g., "path/to/page")
			trimmedUrl.indexOf(":") === -1;
		
		var safeUrl = (isAllowedScheme || isRelativeOrHash) ? trimmedUrl : "#";
		
		return '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' + text + "</a>";
	});
	
	// Process lists (grouping consecutive items)
	var lines = html.split('\n');
	var result = [];
	var inUl = false;
	var inOl = false;
	
	for (var i = 0; i < lines.length; i++) {
		var line = lines[i];
		var isUlItem = /^[*-] (.+)$/.test(line);
		var isOlItem = /^\d+\. (.+)$/.test(line);
		
		if (isUlItem) {
			if (!inUl) {
				result.push('<ul>');
				inUl = true;
			}
			result.push(line.replace(/^[*-] (.+)$/, '<li>$1</li>'));
		} else if (isOlItem) {
			if (!inOl) {
				result.push('<ol>');
				inOl = true;
			}
			result.push(line.replace(/^\d+\. (.+)$/, '<li>$1</li>'));
		} else {
			if (inUl) {
				result.push('</ul>');
				inUl = false;
			}
			if (inOl) {
				result.push('</ol>');
				inOl = false;
			}
			result.push(line);
		}
	}
	
	// Close any open lists
	if (inUl) result.push('</ul>');
	if (inOl) result.push('</ol>');
	
	html = result.join('\n');
	
	// Blockquotes
	html = html.replace(/^> (.+)$/gim, '<blockquote>$1</blockquote>');
	
	// Line breaks - only outside code blocks and lists
	function replaceNewlinesOutsideBlocks(htmlContent) {
		var segments = [];
		var blockRegex = /(<pre><code>[\s\S]*?<\/code><\/pre>|<ul>[\s\S]*?<\/ul>|<ol>[\s\S]*?<\/ol>)/g;
		var lastIndex = 0;
		var match;

		while ((match = blockRegex.exec(htmlContent)) !== null) {
			if (match.index > lastIndex) {
				segments.push({
					text: htmlContent.slice(lastIndex, match.index),
					safe: false,
				});
			}
			segments.push({
				text: match[0],
				safe: true,
			});
			lastIndex = blockRegex.lastIndex;
		}

		if (lastIndex < htmlContent.length) {
			segments.push({
				text: htmlContent.slice(lastIndex),
				safe: false,
			});
		}

		return segments
			.map(function(segment) {
				return segment.safe
					? segment.text
					: segment.text.replace(/\n/g, "<br>");
			})
			.join("");
	}

	html = replaceNewlinesOutsideBlocks(html);
	
	return html;
}

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);

/**
 * Sends a message to the chat API and processes the response
 */
async function sendMessage() {
	const message = userInput.value.trim();

	// Don't send empty messages
	if (message === "" || isProcessing) return;

	// Disable input while processing
	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;

	// Add user message to chat
	addMessageToChat("user", message);

	// Clear input
	userInput.value = "";
	userInput.style.height = "auto";

	// Show typing indicator
	typingIndicator.classList.add("visible");

	// Add message to history
	chatHistory.push({ role: "user", content: message });

	try {
		// Create container for all 3 responses
		const responsesContainer = document.createElement("div");
		responsesContainer.className = "multi-response-container";
		chatMessages.appendChild(responsesContainer);
		
		// Create 3 response elements (one for each tone)
		const tones = ['friendly', 'rude', 'professional'];
		const responseElements = {};
		
		tones.forEach((tone) => {
			const toneContainer = document.createElement("div");
			toneContainer.className = `tone-response ${tone}-response`;
			
			// Add header for each tone
			const header = document.createElement("div");
			header.className = "tone-header";
			const toneLabels = {
				friendly: "😊 Friendly",
				rude: "😤 Rude", 
				professional: "💼 Professional"
			};
			header.textContent = toneLabels[tone];
			toneContainer.appendChild(header);
			
			// Create thinking section
			const thinkingSection = document.createElement("div");
			thinkingSection.className = "thinking-section";
			thinkingSection.style.display = "none";
			thinkingSection.innerHTML = `
				<button class="thinking-header" aria-expanded="false" aria-controls="thinking-content-${tone}-${Date.now()}">
					<div class="thinking-title">
						<span>💭</span>
						<span>Thinking process</span>
					</div>
					<span class="thinking-toggle">▼</span>
				</button>
				<div class="thinking-content" id="thinking-content-${tone}-${Date.now()}"></div>
			`;
			
			// Create response container
			const responseContainer = document.createElement("div");
			responseContainer.className = "response-content";
			
			// Assemble tone container
			toneContainer.appendChild(thinkingSection);
			toneContainer.appendChild(responseContainer);
			responsesContainer.appendChild(toneContainer);
			
			const thinkingContentEl = thinkingSection.querySelector(".thinking-content");
			const thinkingToggleEl = thinkingSection.querySelector(".thinking-toggle");
			const thinkingHeaderEl = thinkingSection.querySelector(".thinking-header");
			
			// Add click handler for collapsing/expanding thinking
			thinkingHeaderEl.addEventListener("click", () => {
				const isCollapsed = thinkingContentEl.classList.toggle("collapsed");
				thinkingToggleEl.classList.toggle("collapsed");
				thinkingHeaderEl.setAttribute("aria-expanded", !isCollapsed);
			});
			
			// Start with thinking collapsed
			thinkingContentEl.classList.add("collapsed");
			thinkingToggleEl.classList.add("collapsed");
			
			// Store references for this tone
			responseElements[tone] = {
				responseContainer,
				thinkingSection,
				thinkingContentEl,
				responseText: "",
				thinkingText: ""
			};
		});

		// Scroll to bottom
		chatMessages.scrollTop = chatMessages.scrollHeight;

		// Send request to API
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messages: chatHistory,
			}),
		});

		// Handle errors
		if (!response.ok) {
			throw new Error("Failed to get response");
		}
		if (!response.body) {
			throw new Error("Response body is null");
		}

		// Process streaming response
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let lastRenderTime = 0;
		const RENDER_THROTTLE_MS = 50; // Throttle rendering to ~20fps
		
		const flushResponse = (tone) => {
			const now = Date.now();
			if (now - lastRenderTime >= RENDER_THROTTLE_MS) {
				const el = responseElements[tone];
				el.responseContainer.innerHTML = parseMarkdown(el.responseText);
				chatMessages.scrollTop = chatMessages.scrollHeight;
				lastRenderTime = now;
			}
		};
		const flushResponseImmediate = (tone) => {
			const el = responseElements[tone];
			el.responseContainer.innerHTML = parseMarkdown(el.responseText);
			chatMessages.scrollTop = chatMessages.scrollHeight;
			lastRenderTime = Date.now();
		};
		const flushThinking = (tone) => {
			const el = responseElements[tone];
			el.thinkingContentEl.textContent = el.thinkingText;
			// Show thinking section if we have content
			if (el.thinkingText.length > 0) {
				el.thinkingSection.style.display = "block";
			}
		};

		let sawDone = false;
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				// Process any remaining complete events in buffer
				const parsed = consumeSseEvents(buffer + "\n\n");
				for (const data of parsed.events) {
					if (data === "[DONE]") {
						break;
					}
					try {
						const jsonData = JSON.parse(data);
						const tone = jsonData.tone;
						
						if (!tone || !responseElements[tone]) continue;
						
						// Handle thinking content
						if (jsonData.thinking) {
							responseElements[tone].thinkingText += jsonData.thinking;
							flushThinking(tone);
						}
						
						// Handle response content
						if (jsonData.response) {
							responseElements[tone].responseText += jsonData.response;
							flushResponse(tone);
						}
					} catch (e) {
						console.error("Error parsing SSE data as JSON:", e, data);
					}
				}
				break;
			}

			// Decode chunk
			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				if (data === "[DONE]") {
					sawDone = true;
					buffer = "";
					break;
				}
				try {
					const jsonData = JSON.parse(data);
					const tone = jsonData.tone;
					
					if (!tone || !responseElements[tone]) continue;
					
					// Handle thinking content
					if (jsonData.thinking) {
						responseElements[tone].thinkingText += jsonData.thinking;
						flushThinking(tone);
					}
					
					// Handle response content
					if (jsonData.response) {
						responseElements[tone].responseText += jsonData.response;
						flushResponse(tone);
					}
				} catch (e) {
					console.error("Error parsing SSE data as JSON:", e, data);
				}
			}
			if (sawDone) {
				break;
			}
		}

		// Final render with complete content for all tones
		tones.forEach((tone) => {
			flushResponseImmediate(tone);
		});

		// Add completed responses to chat history (use professional as the main response)
		if (responseElements['professional'].responseText.length > 0) {
			chatHistory.push({ role: "assistant", content: responseElements['professional'].responseText });
		}
	} catch (error) {
		console.error("Error:", error);
		addMessageToChat(
			"assistant",
			"Sorry, there was an error processing your request.",
		);
	} finally {
		// Hide typing indicator
		typingIndicator.classList.remove("visible");

		// Re-enable input
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}

/**
 * Helper function to add message to chat
 */
function addMessageToChat(role, content) {
	const messageEl = document.createElement("div");
	messageEl.className = `message ${role}-message`;
	
	// Use markdown for assistant messages, plain text for user messages
	if (role === "assistant") {
		const contentDiv = document.createElement("div");
		contentDiv.innerHTML = parseMarkdown(content);
		messageEl.appendChild(contentDiv);
	} else {
		const p = document.createElement("p");
		p.textContent = content;
		messageEl.appendChild(p);
	}
	
	chatMessages.appendChild(messageEl);

	// Scroll to bottom
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");
	const events = [];
	let eventEndIndex;
	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);

		const lines = rawEvent.split("\n");
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		events.push(dataLines.join("\n"));
	}
	return { events, buffer: normalized };
}
