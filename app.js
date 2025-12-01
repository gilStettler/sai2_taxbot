// ==== CONFIG: IDs aus deinem Python-Script ====
const PROMPT_ID = "pmpt_692896af992881959106cbd3c386f89409af548b48c6b541";
const PROMPT_VERSION = "32";
const VECTOR_STORE_ID = "vs_69289678d9ac81919df96098adb8ec9e";

// ==== STATE ====
let apiKey = null;
let conversation = [];

// ==== DOM ELEMENTS ====
const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
const apiKeyStatus = document.getElementById("apiKeyStatus");

const chatWindow = document.getElementById("chatWindow"); // scrollcontainer
const chatMessages = document.getElementById("chatMessages"); // nur Nachrichten

const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const clearChatBtn = document.getElementById("clearChatBtn");

// ==== INIT ====
(function init() {
  const storedKey = localStorage.getItem("openai_api_key");
  if (storedKey) {
    apiKey = storedKey;
    apiKeyInput.value = "********";
    apiKeyStatus.textContent = "Key geladen";
  } else {
    apiKeyStatus.textContent = "Kein Key gespeichert";
  }

  if (window.marked) {
    marked.setOptions({
      breaks: true,
      mangle: false,
      headerIds: false
    });
  }

  renderConversation();
})();

// ==== RENDER ====
function addMessage(role, content) {
  conversation.push({ role, content });
  renderConversation();
}

function renderConversation() {
  chatMessages.innerHTML = ""; // WICHTIG: Hinweis bleibt erhalten

  conversation.forEach((msg) => {
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message", msg.role);

    const meta = document.createElement("div");
    meta.classList.add("meta");
    meta.textContent = msg.role === "user" ? "Du" : "Assistant";

    const text = document.createElement("div");

    if (msg.role === "assistant" && window.marked) {
      text.innerHTML = marked.parse(msg.content || "");
    } else {
      text.textContent = msg.content;
    }

    msgDiv.appendChild(meta);
    msgDiv.appendChild(text);
    chatMessages.appendChild(msgDiv);
  });

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ==== BUILD CONTEXT ====
function buildQuestionFromConversation(nextUserMessage) {
  const temp = [...conversation];

  if (nextUserMessage) {
    temp.push({ role: "user", content: nextUserMessage });
  }

  const lines = temp.map((m) => {
    const label = m.role === "user" ? "User" : "Assistant";
    return `${label}: ${m.content}`;
  });

  return (
    "This is a conversation between a user and an assistant.\n" +
    "Use the full chat history below to answer the last user message.\n\n" +
    lines.join("\n")
  );
}

// ==== PARSE OPENAI RESPONSE ====
function extractTextFromResponse(data) {
  try {
    if (typeof data.output_text === "string" && data.output_text.trim() !== "") {
      return data.output_text.trim();
    }

    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!item || !Array.isArray(item.content)) continue;
        for (const part of item.content) {
          if (part.type === "output_text" && part.text?.value) {
            return part.text.value.trim();
          }
          if (typeof part.text === "string") {
            return part.text.trim();
          }
        }
      }
    }

    return "Konnte keine Antwort auslesen:\n" + JSON.stringify(data, null, 2);
  } catch (e) {
    return "Fehler:\n" + e.message;
  }
}

// ==== EVENTS ====

// API KEY SPEICHERN
saveApiKeyBtn.addEventListener("click", () => {
  const value = apiKeyInput.value.trim();
  if (!value) {
    apiKeyStatus.textContent = "Bitte API Key eingeben";
    apiKeyStatus.style.color = "#cc5500";
    return;
  }

  apiKey = value;
  localStorage.setItem("openai_api_key", apiKey);
  apiKeyInput.value = "********";
  apiKeyStatus.textContent = "Key gespeichert";
  apiKeyStatus.style.color = "#16a34a";
});

// CLEAR CHAT
clearChatBtn.addEventListener("click", () => {
  if (!conversation.length) return;

  const ok = window.confirm(
    "Möchten Sie den gesamten Chat-Verlauf löschen?"
  );
  if (!ok) return;

  conversation = [];
  renderConversation();
});

// SENDEN
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;

  if (!apiKey) {
    alert("Bitte zuerst Ihren API Key speichern.");
    return;
  }

  const question = buildQuestionFromConversation(text);

  addMessage("user", text);
  userInput.value = "";
  userInput.focus();

  const typingIndex = conversation.length;
  conversation.push({ role: "assistant", content: "Denke nach…" });
  renderConversation();

  chatForm.querySelector("button[type=submit]").disabled = true;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "OpenAI-Beta": "responses=v1"
      },
      body: JSON.stringify({
        prompt: {
          id: PROMPT_ID,
          version: PROMPT_VERSION,
          variables: {
            question: question
          }
        },
        input: [],
        text: { format: { type: "text" } },
        reasoning: {},
        tools: [
          { type: "file_search", vector_store_ids: [VECTOR_STORE_ID] }
        ],
        max_output_tokens: 2048,
        store: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    const data = await response.json();
    const assistantText = extractTextFromResponse(data);

    conversation[typingIndex] = {
      role: "assistant",
      content: assistantText
    };
    renderConversation();
  } catch (err) {
    conversation[typingIndex] = {
      role: "assistant",
      content: "Fehler:\n" + err.message
    };
    renderConversation();
  } finally {
    chatForm.querySelector("button[type=submit]").disabled = false;
  }
});
