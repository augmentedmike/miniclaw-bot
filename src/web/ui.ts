export const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>miniclaw</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  #app {
    width: 100%;
    max-width: 720px;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  header {
    padding: 12px 16px;
    border-bottom: 1px solid #2a2a4a;
    font-size: 14px;
    color: #888;
    text-align: center;
  }
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .msg {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 15px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .msg.user {
    align-self: flex-end;
    background: #2563eb;
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .msg.assistant {
    align-self: flex-start;
    background: #2a2a4a;
    color: #e0e0e0;
    border-bottom-left-radius: 4px;
  }
  .tool-call { display: none; }
  #input-area {
    padding: 12px 16px;
    border-top: 1px solid #2a2a4a;
    display: flex;
    gap: 8px;
  }
  #input {
    flex: 1;
    background: #2a2a4a;
    border: 1px solid #3a3a5a;
    border-radius: 8px;
    padding: 10px 14px;
    color: #e0e0e0;
    font-size: 15px;
    font-family: inherit;
    resize: none;
    min-height: 42px;
    max-height: 160px;
    outline: none;
  }
  #input:focus { border-color: #2563eb; }
  #send {
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0 20px;
    font-size: 15px;
    cursor: pointer;
  }
  #send:disabled { opacity: 0.5; cursor: default; }
  #send:hover:not(:disabled) { background: #1d4ed8; }
</style>
</head>
<body>
<div id="app">
  <header>miniclaw</header>
  <div id="messages"></div>
  <div id="input-area">
    <textarea id="input" rows="1" placeholder="Send a message\u2026"></textarea>
    <button id="send">Send</button>
  </div>
</div>
<script>
const messages = document.getElementById("messages");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
let streaming = false;

// Persistent session ID for conversation history
let sessionId = localStorage.getItem("miniclaw-session-id");
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem("miniclaw-session-id", sessionId);
}

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

sendBtn.addEventListener("click", send);

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function addMessage(role, content) {
  const el = document.createElement("div");
  el.className = "msg " + role;
  el.textContent = content;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  return el;
}

function addToolCall(name, args) {
  const el = document.createElement("div");
  el.className = "tool-call";
  el.innerHTML = '<span class="tool-name">' + escapeHtml(name) + "</span> " +
    escapeHtml(typeof args === "string" ? args : JSON.stringify(args, null, 2));
  // Append to the last assistant message or to messages container
  const last = messages.querySelector(".msg.assistant:last-of-type");
  if (last) {
    last.appendChild(el);
  } else {
    messages.appendChild(el);
  }
  messages.scrollTop = messages.scrollHeight;
}

async function send() {
  const text = input.value.trim();
  if (!text || streaming) return;

  addMessage("user", text);
  input.value = "";
  input.style.height = "auto";
  streaming = true;
  sendBtn.disabled = true;

  const assistantEl = addMessage("assistant", "");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId }),
    });

    if (!res.ok) {
      assistantEl.textContent = "Error: " + res.status;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\\n");
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6);
        if (!raw) continue;
        try {
          const evt = JSON.parse(raw);
          if (evt.type === "text") {
            assistantEl.textContent += evt.data;
            messages.scrollTop = messages.scrollHeight;
          } else if (evt.type === "tool") {
            addToolCall(evt.name, evt.args);
          } else if (evt.type === "error") {
            assistantEl.textContent += "\\nError: " + evt.data;
          }
        } catch {}
      }
    }

    if (!assistantEl.textContent && !assistantEl.querySelector(".tool-call")) {
      assistantEl.textContent = "(no response)";
    }
  } catch (err) {
    assistantEl.textContent = "Connection error: " + err.message;
  } finally {
    streaming = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

input.focus();
</script>
</body>
</html>`;
