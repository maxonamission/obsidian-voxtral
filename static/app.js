// ── State ──
let isRecording = false;
let ws = null;
let audioContext = null;
let mediaStream = null;
let processorNode = null;
let useRealtime = true;
let useDiarize = false;
let activeInsert = null; // span where incoming text is inserted
let isMidSentenceInsert = false; // true when inserting inside a sentence (not after . ! ?)
let analyserNode = null;
let micLevelAnimId = null;
let smoothLevel = 0; // smoothed mic level (0–1)
let lastLabel = ""; // current displayed label text
let userScrolledAway = false; // true when user manually scrolled up

// ── Correction settings ──
let autoCorrect = JSON.parse(localStorage.getItem("voxtral-autocorrect") || "false");
let systemPrompt = localStorage.getItem("voxtral-system-prompt") || "";

// ── Keyboard shortcut ──
const DEFAULT_SHORTCUT = { ctrl: true, shift: false, alt: false, meta: false, key: " " };
let recordShortcut = loadShortcut();

function loadShortcut() {
    try {
        const stored = localStorage.getItem("voxtral-shortcut");
        if (stored) return JSON.parse(stored);
    } catch {}
    return { ...DEFAULT_SHORTCUT };
}

function saveShortcut(sc) {
    recordShortcut = sc;
    localStorage.setItem("voxtral-shortcut", JSON.stringify(sc));
    updateShortcutDisplays();
}

function shortcutLabel(sc) {
    const parts = [];
    if (sc.ctrl) parts.push("Ctrl");
    if (sc.alt) parts.push("Alt");
    if (sc.shift) parts.push("Shift");
    if (sc.meta) parts.push("Meta");
    const keyName = sc.key === " " ? "Space" : sc.key.length === 1 ? sc.key.toUpperCase() : sc.key;
    parts.push(keyName);
    return parts.join("+");
}

function updateShortcutDisplays() {
    const label = shortcutLabel(recordShortcut);
    const helpEl = document.getElementById("help-shortcut-display");
    if (helpEl) helpEl.textContent = label.replace(/\+/g, " + ");
}

function matchesShortcut(e, sc) {
    return e.ctrlKey === sc.ctrl && e.shiftKey === sc.shift
        && e.altKey === sc.alt && e.metaKey === sc.meta
        && e.key === sc.key;
}

// ── DOM ──
const transcript = document.getElementById("transcript");
const btnRecord = document.getElementById("btn-record");
const btnCopy = document.getElementById("btn-copy");
const btnClear = document.getElementById("btn-clear");
const modeToggle = document.getElementById("mode-toggle");
const statusText = document.getElementById("status-text");
const delaySelect = document.getElementById("delay-select");

// Restore saved delay from localStorage
const savedDelay = localStorage.getItem("voxtral-delay");
if (savedDelay && [...delaySelect.options].some(o => o.value === savedDelay)) {
    delaySelect.value = savedDelay;
}

// Persist delay when changed
delaySelect.addEventListener("change", () => {
    localStorage.setItem("voxtral-delay", delaySelect.value);
});
const replaceHint = document.getElementById("replace-hint");
const micLevel = document.getElementById("mic-level");
const micLevelBar = document.getElementById("mic-level-bar");
const micLevelLabel = document.getElementById("mic-level-label");

// ── Auto-scroll: pause when user scrolls up, resume when they scroll back down ──
(function initScrollTracking() {
    const main = transcript.closest("main");
    if (!main) return;
    let programmaticScroll = false;

    // Intercept programmatic scrollTo to distinguish from user scrolls
    const origScrollTo = main.scrollTo.bind(main);
    main.scrollTo = function (...args) {
        programmaticScroll = true;
        origScrollTo(...args);
        // smooth scroll takes time; reset flag after it settles
        setTimeout(() => { programmaticScroll = false; }, 600);
    };

    main.addEventListener("scroll", () => {
        if (programmaticScroll) return;
        // User is scrolling manually. Check if they're near the bottom.
        const distFromBottom = main.scrollHeight - main.scrollTop - main.clientHeight;
        if (distFromBottom > 80) {
            userScrolledAway = true;
        } else {
            userScrolledAway = false;
        }
    });
})();
const queueInfo = document.getElementById("queue-info");
const queueCount = document.getElementById("queue-count");
const toast = document.getElementById("toast");
const settingsOverlay = document.getElementById("settings-overlay");
const inputApiKey = document.getElementById("input-apikey");
const settingsStatus = document.getElementById("settings-status");

// ── Mode toggle ──
const diarizeToggle = document.getElementById("diarize-toggle");
const diarizeLabel = document.getElementById("diarize-label");

function updateModeUI() {
    if (isRecording) return;
    statusText.textContent = useRealtime ? "Realtime" : "Opname";
    delaySelect.disabled = !useRealtime;
    // Diarize toggle: only visible in opname (batch) mode
    const showDiarize = !useRealtime;
    diarizeToggle.closest(".toggle").classList.toggle("hidden-toggle", !showDiarize);
    diarizeLabel.classList.toggle("hidden-toggle", !showDiarize);
}

modeToggle.addEventListener("change", () => {
    if (isRecording) { modeToggle.checked = useRealtime; return; }
    useRealtime = modeToggle.checked;
    updateModeUI();
});

diarizeToggle.addEventListener("change", () => {
    if (isRecording) { diarizeToggle.checked = useDiarize; return; }
    useDiarize = diarizeToggle.checked;
});

// ── Active insert point management ──
// This is the core concept: a single span that receives all incoming text.
// By default it's at the end. Click in the transcript to move it.
// Select text to replace it.

function ensureInsertPoint() {
    // Must be inside transcript specifically — not just any parentNode
    if (activeInsert && transcript.contains(activeInsert)) return activeInsert;
    // If activeInsert exists but escaped transcript, remove it from wherever it is
    if (activeInsert && activeInsert.parentNode) activeInsert.remove();
    activeInsert = document.createElement("span");
    activeInsert.className = "partial";
    transcript.appendChild(activeInsert);
    return activeInsert;
}

// ── Auto-spacing helpers ──
function getTextBefore(node) {
    let prev = node.previousSibling;
    while (prev) {
        const t = prev.textContent;
        if (t.length > 0) return t;
        prev = prev.previousSibling;
    }
    return "";
}

function getTextAfter(node) {
    let next = node.nextSibling;
    while (next) {
        const t = next.textContent;
        if (t.length > 0) return t;
        next = next.nextSibling;
    }
    return "";
}

function needsSpaceBefore(target) {
    if (target.textContent !== "") return false; // only on first insert
    const before = getTextBefore(target);
    if (!before) return false;
    const last = before[before.length - 1];
    return last !== " " && last !== "\n" && last !== "\t";
}

function needsSpaceAfter(target) {
    const after = getTextAfter(target);
    if (!after) return false;
    const first = after[0];
    const content = target.textContent;
    if (!content) return false;
    const last = content[content.length - 1];
    return last !== " " && last !== "\n" && first !== " " && first !== "\n";
}

function capitalizeAfterSentenceEnd(node) {
    const content = node.textContent;
    if (!content) return;
    // Check if inserted text ends with sentence-ending punctuation
    const trimmed = content.trimEnd();
    const lastChar = trimmed[trimmed.length - 1];
    if (lastChar !== "." && lastChar !== "!" && lastChar !== "?") return;
    // Find next sibling with actual text
    let next = node.nextSibling;
    while (next) {
        if (next.textContent.trim().length > 0) break;
        next = next.nextSibling;
    }
    if (!next) return;
    const nextText = next.textContent;
    // Match optional leading whitespace then a lowercase letter (including accented)
    const match = nextText.match(/^(\s*)([a-zàáâãäåæçèéêëìíîïñòóôõöùúûüýÿ])/);
    if (match) {
        next.textContent = match[1] + match[2].toUpperCase() + nextText.slice(match[1].length + 1);
    }
}

function finalizeInsertPoint() {
    if (activeInsert) {
        if (activeInsert.textContent) {
            // Mid-sentence: strip trailing punctuation added by the API
            if (isMidSentenceInsert) {
                activeInsert.textContent = activeInsert.textContent.replace(/[.!?]+\s*$/, "");
            }
            // Auto-space: add trailing space if needed before next text
            if (needsSpaceAfter(activeInsert)) {
                activeInsert.textContent += " ";
            }
            // Auto-capitalize: uppercase first letter of next text after . ! ?
            if (!isMidSentenceInsert) {
                capitalizeAfterSentenceEnd(activeInsert);
            }
        }
        activeInsert.classList.remove("partial", "replacing");
        activeInsert = null;
        isMidSentenceInsert = false;
    }
    replaceHint.classList.add("hidden");
}

// ── Voice commands ──
const VOICE_COMMANDS = [
    // Structuur
    { patterns: ["nieuwe alinea", "nieuw alinea", "nieuwe paragraaf", "nieuwe linie", "new paragraph"], insert: "\n\n", toast: "¶ Nieuwe alinea" },
    { patterns: ["nieuwe regel", "new line", "volgende regel"], insert: "\n", toast: "↵ Nieuwe regel" },
    // Headings
    { patterns: ["kop 1", "kop een", "heading 1", "heading one", "kop 1", "kop één"], insert: "\n\n# ", toast: "# H1" },
    { patterns: ["kop 2", "kop twee", "heading 2", "heading two"], insert: "\n\n## ", toast: "## H2" },
    { patterns: ["kop 3", "kop drie", "heading 3", "heading three"], insert: "\n\n### ", toast: "### H3" },
    // Lijst
    { patterns: ["nieuw punt", "nieuw lijstitem", "lijst punt", "bullet", "bullet point", "volgend punt"], insert: "\n- ", toast: "• Lijstitem" },
    // To-do
    { patterns: ["nieuw to-do item", "nieuw todo item", "nieuw todo", "nieuwe taak", "new todo", "to-do item", "todo item"], insert: "\n- [ ] ", toast: "☐ To-do" },
    // Genummerde lijst
    { patterns: ["nieuw genummerd item", "nieuw genummerd punt", "genummerd punt", "genummerd item", "volgend nummer", "nummer punt", "numbered item", "new numbered item"], insert: "\n1. ", toast: "1. Genummerd item" },
    // Bediening
    { patterns: ["beëindig opname", "beëindig de opname", "beëindigt opname", "beëindigt de opname", "beëindigde opname", "beëindigde de opname", "beeindig opname", "beeindig de opname", "beeindigt opname", "beeindigt de opname", "beeindigde opname", "beeindigde de opname", "stop opname", "stopopname", "stop de opname", "stop recording"], action: "stopRecording", toast: "⏹ Stop" },
    // Wissen
    { patterns: ["verwijder laatste alinea", "verwijder laatste paragraaf", "wis laatste alinea", "delete last paragraph"], action: "deleteLastParagraph", toast: "Alinea gewist" },
    { patterns: ["verwijder laatste regel", "verwijder laatste zin", "wis laatste regel", "wist laatste regel", "delete last line"], action: "deleteLastLine", toast: "Regel gewist" },
    // Ongedaan maken
    { patterns: ["herstel", "ongedaan maken", "undo"], action: "undo", toast: "↩ Hersteld" },
];

// Strip diacritics: ë→e, é→e, ï→i etc.
function stripDiacritics(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Normalize spoken text for command matching
function normalizeCommand(text) {
    let norm = text.toLowerCase().trim();
    norm = stripDiacritics(norm);
    // Strip punctuation including all dash/hyphen variants (ASCII, Unicode hyphen, en-dash, em-dash)
    norm = norm.replace(/[,;:'"…\u002D\u2010\u2011\u2012\u2013\u2014\u2015]/g, "");
    // Common Voxtral mishearings
    norm = norm.replace(/\bniveau\b/g, "nieuwe");
    return norm.trim();
}

function findCommand(normalized) {
    for (const cmd of VOICE_COMMANDS) {
        for (const pattern of cmd.patterns) {
            // Normalize pattern the same way as input (strip diacritics, hyphens, etc.)
            const p = normalizeCommand(pattern);
            // Match exact OR as suffix (e.g. "dan nieuwe paragraaf" ends with "nieuwe paragraaf")
            if (normalized === p || normalized.endsWith(" " + p)) return cmd;
        }
    }
    return null;
}

function checkForCommand() {
    if (!activeInsert || !activeInsert.textContent) return false;
    const raw = activeInsert.textContent.replace(/[.!?]/g, "");
    const norm = normalizeCommand(raw);
    if (!norm) return false;
    const cmd = findCommand(norm);
    if (cmd) {
        executeCommand(cmd);
        return true;
    }
    return false;
}

// Process completed sentences in real-time as periods arrive in deltas.
// This is essential because the Mistral realtime API may not send "done"
// events between sentences during continuous speech.
function processCompletedSentences() {
    if (!activeInsert || !activeInsert.textContent) return;

    const text = activeInsert.textContent;

    // Match complete sentences: text followed by sentence-ending punctuation
    const parts = text.match(/\s*[^.!?]+[.!?]+/g);
    if (!parts) return; // no complete sentence yet

    // Calculate remainder (incomplete text after the last matched sentence)
    const matchedLength = parts.join("").length;
    const remainder = text.substring(matchedLength);

    // First pass: classify each part as command or text
    const actions = parts.map(part => {
        const trimmedPart = part.trim();
        const textOnly = trimmedPart.replace(/[.!?]+$/, "").trim();
        const norm = normalizeCommand(textOnly);
        const cmd = findCommand(norm);
        // Log hex codes for debugging hyphen issues
        const hexCodes = [...textOnly].map(c => c.charCodeAt(0) > 127 ? `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}` : c).join("");
        console.debug(`[voice] "${textOnly}" [${hexCodes}] → norm="${norm}" → ${cmd ? "CMD: " + cmd.toast : "text"}`);
        return { trimmedPart, cmd };
    });

    // Save undo state BEFORE modifying the transcript — but ONLY if there are
    // actual text parts being committed. Pure command sentences (like "Herstel.")
    // should NOT save undo, otherwise restoreUndo() pops the wrong state.
    // (Destructive commands like deleteLastBlock already call saveUndo() internally.)
    const hasTextParts = actions.some(a => !a.cmd);
    if (hasTextParts) {
        saveUndo();
    }

    // Clear command text from activeInsert BEFORE executing commands
    // so deleteLastBlock/restoreUndo won't see command text in transcript
    activeInsert.textContent = remainder;

    // Second pass: execute actions
    let stopRequested = false;
    for (const { trimmedPart, cmd } of actions) {
        // After destructive commands (delete/undo), activeInsert may be detached
        // Re-attach it so subsequent text insertions work — must be inside transcript
        if (!transcript.contains(activeInsert)) {
            if (activeInsert.parentNode) activeInsert.remove();
            transcript.appendChild(activeInsert);
        }

        if (cmd) {
            if (cmd.insert) {
                const span = document.createElement("span");
                span.textContent = cmd.insert;
                activeInsert.parentNode.insertBefore(span, activeInsert);
            }
            if (cmd.action === "stopRecording") stopRequested = true;
            if (cmd.action === "deleteLastParagraph") deleteLastBlock("paragraph");
            if (cmd.action === "deleteLastLine") deleteLastBlock("line");
            if (cmd.action === "undo") restoreUndo();
            showToast(cmd.toast);
        } else {
            // Finalize as regular text (white, not gray)
            const span = document.createElement("span");
            span.textContent = trimmedPart + " ";
            activeInsert.parentNode.insertBefore(span, activeInsert);
        }
    }

    isMidSentenceInsert = false; // after a sentence boundary, next text starts fresh

    if (stopRequested) {
        setTimeout(() => { if (isRecording) btnRecord.click(); }, 0);
    }
}

function executeCommand(cmd) {
    // Single command: clear text and execute
    if (activeInsert) {
        activeInsert.textContent = "";
    }

    if (cmd.insert) {
        if (activeInsert) {
            activeInsert.textContent = cmd.insert;
            activeInsert.classList.remove("partial", "replacing");
            activeInsert = null;
        }
    } else if (cmd.action === "stopRecording") {
        if (activeInsert) { activeInsert.remove(); activeInsert = null; }
        if (isRecording) btnRecord.click();
    } else if (cmd.action === "deleteLastParagraph") {
        if (activeInsert) { activeInsert.remove(); activeInsert = null; }
        deleteLastBlock("paragraph");
    } else if (cmd.action === "deleteLastLine") {
        if (activeInsert) { activeInsert.remove(); activeInsert = null; }
        deleteLastBlock("line");
    } else if (cmd.action === "undo") {
        if (activeInsert) { activeInsert.remove(); activeInsert = null; }
        restoreUndo();
    }

    isMidSentenceInsert = false;
    replaceHint.classList.add("hidden");
    showToast(cmd.toast);
}

// ── Undo stack ──
let undoStack = [];

function saveUndo() {
    undoStack.push(transcript.innerHTML);
    if (undoStack.length > 20) undoStack.shift(); // max 20 states
}

function restoreUndo() {
    if (undoStack.length === 0) return false;
    transcript.innerHTML = undoStack.pop();
    return true;
}

function deleteLastBlock(type) {
    const fullText = transcript.innerText;
    if (!fullText || !fullText.trim()) return;

    saveUndo();

    let newText;
    if (type === "paragraph") {
        // Delete everything after the last double newline
        const idx = fullText.lastIndexOf("\n\n");
        newText = idx > 0 ? fullText.substring(0, idx) : "";
    } else {
        // Delete last sentence: find the last sentence-ending punctuation before the final one
        const trimmed = fullText.trimEnd();
        // Find second-to-last sentence boundary (. ! ?)
        let cutIdx = -1;
        for (let i = trimmed.length - 2; i >= 0; i--) {
            const ch = trimmed[i];
            if (ch === "." || ch === "!" || ch === "?") {
                cutIdx = i + 1; // keep the period
                break;
            }
            if (ch === "\n") {
                cutIdx = i + 1; // keep the newline as boundary
                break;
            }
        }
        newText = cutIdx > 0 ? fullText.substring(0, cutIdx) : "";
    }

    transcript.innerHTML = "";
    if (newText && newText.trim()) {
        const span = document.createElement("span");
        span.textContent = newText;
        transcript.appendChild(span);
    } else {
        transcript.innerHTML = '<span class="placeholder">Druk op opnemen om te beginnen...</span>';
    }
}

function isAfterSentenceEnd(node) {
    const before = getTextBefore(node);
    if (!before) return true; // start of transcript = treat as sentence start
    const trimmed = before.trimEnd();
    if (!trimmed) return true;
    const last = trimmed[trimmed.length - 1];
    // Also treat markdown markers (#, -, \n) as sentence starts (after voice command inserts)
    return last === "." || last === "!" || last === "?" || last === "#" || last === "\n" || last === "-";
}

function lowercaseFirstLetter(text) {
    // Handle leading whitespace: " En" → " en"
    const match = text.match(/^(\s*)([A-ZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸ])/);
    if (match) {
        return match[1] + match[2].toLowerCase() + text.slice(match[1].length + 1);
    }
    return text;
}

function feedText(text) {
    clearPlaceholder();
    const target = ensureInsertPoint();

    // Auto-space: add leading space on first text if previous text has no trailing space
    if (needsSpaceBefore(target) && text.length > 0 && text[0] !== " " && text[0] !== "\n") {
        target.textContent = " ";
    }

    // Prevent double spaces: trim leading spaces from text if we already have one
    if (target.textContent.endsWith(" ") && text.startsWith(" ")) {
        text = text.replace(/^ +/, "");
    }
    // Also when target is still empty but before text already ends with space
    if (target.textContent === "" && text.startsWith(" ")) {
        const before = getTextBefore(target);
        if (before && before.endsWith(" ")) {
            text = text.replace(/^ +/, "");
        }
    }

    // On first real text: determine if this is a mid-sentence or new-sentence insertion
    if (target.textContent.replace(/ /g, "") === "") {
        isMidSentenceInsert = !isAfterSentenceEnd(target);
        if (isMidSentenceInsert) {
            text = lowercaseFirstLetter(text);
        }
    }

    target.textContent += text;

    // Safety: if target somehow escaped transcript, move it back
    if (!transcript.contains(target)) {
        if (target.parentNode) target.remove();
        transcript.appendChild(target);
    }

    scrollToInsertPoint();

    // Process completed sentences in real-time (commands + finalize text)
    processCompletedSentences();
}

// ── Click-to-move cursor — works during AND before recording ──
transcript.addEventListener("mouseup", () => {
    // Ignore if transcript only has the placeholder
    if (transcript.querySelector(".placeholder")) return;

    setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        // Both anchor and focus must be inside transcript
        if (!transcript.contains(sel.anchorNode)) return;
        if (!transcript.contains(sel.focusNode)) return;

        // Finalize current insert point
        finalizeInsertPoint();

        if (!sel.isCollapsed) {
            // ── Selection: replace mode ──
            // Clamp range to stay within transcript
            const range = sel.getRangeAt(0);
            const transcriptRange = document.createRange();
            transcriptRange.selectNodeContents(transcript);

            // If selection extends beyond transcript, clamp it
            if (range.compareBoundaryPoints(Range.START_TO_START, transcriptRange) < 0) {
                range.setStart(transcriptRange.startContainer, transcriptRange.startOffset);
            }
            if (range.compareBoundaryPoints(Range.END_TO_END, transcriptRange) > 0) {
                range.setEnd(transcriptRange.endContainer, transcriptRange.endOffset);
            }

            saveUndo(); // save state before text is replaced/cleared
            const marker = document.createElement("span");
            marker.className = "replacing";
            try {
                range.surroundContents(marker);
            } catch {
                const fragment = range.extractContents();
                marker.appendChild(fragment);
                range.insertNode(marker);
            }
            marker.textContent = "";

            // Safety: ensure marker ended up inside transcript
            if (!transcript.contains(marker)) {
                marker.remove();
                transcript.appendChild(marker);
            }

            activeInsert = marker;
            replaceHint.classList.remove("hidden");
            sel.removeAllRanges();
        } else {
            // ── Click: move insertion point ──
            const range = sel.getRangeAt(0);
            const newInsert = document.createElement("span");
            newInsert.className = "partial";
            range.insertNode(newInsert);

            // Safety: ensure insert ended up inside transcript
            if (!transcript.contains(newInsert)) {
                newInsert.remove();
                transcript.appendChild(newInsert);
            }

            activeInsert = newInsert;
            sel.removeAllRanges();
        }
    }, 10);
});

// ── IndexedDB for offline queue ──
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("voxtral-queue", 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore("recordings", { autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveToQueue(blob) {
    const db = await openDB();
    const tx = db.transaction("recordings", "readwrite");
    tx.objectStore("recordings").add(blob);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    updateQueueBadge();
}

async function getQueueCount() {
    const db = await openDB();
    const tx = db.transaction("recordings", "readonly");
    const store = tx.objectStore("recordings");
    return new Promise((res) => {
        const req = store.count();
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(0);
    });
}

let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue) return;
    const count = await getQueueCount();
    if (count === 0) return;
    isProcessingQueue = true;
    showToast(`Wachtrij verwerken (${count})...`);

    const db = await openDB();
    const tx = db.transaction("recordings", "readonly");
    const store = tx.objectStore("recordings");
    const allKeys = await new Promise((res) => {
        const req = store.getAllKeys();
        req.onsuccess = () => res(req.result);
        req.onerror = () => res([]);
    });

    let processed = 0;
    for (const key of allKeys) {
        const getTx = db.transaction("recordings", "readonly");
        const blob = await new Promise((res) => {
            const req = getTx.objectStore("recordings").get(key);
            req.onsuccess = () => res(req.result);
            req.onerror = () => res(null);
        });
        if (!blob) continue;
        try {
            const formData = new FormData();
            formData.append("file", blob, "recording.webm");
            const resp = await fetch("/api/transcribe", { method: "POST", body: formData });
            if (!resp.ok) {
                console.warn(`Queue item ${key}: server returned ${resp.status}, skipping for now`);
                continue;
            }
            const data = await resp.json();
            if (data.text) appendFinalText(data.text + " ");
            // Delete successfully processed item
            const delTx = db.transaction("recordings", "readwrite");
            delTx.objectStore("recordings").delete(key);
            await new Promise((res) => { delTx.oncomplete = res; });
            processed++;
        } catch (err) {
            console.warn("Queue processing failed (offline?):", err.message);
            break; // stop on network errors, retry later
        }
    }
    isProcessingQueue = false;
    updateQueueBadge();
    if (processed > 0) {
        showToast(`${processed} opname(s) verwerkt`);
    }
}

async function updateQueueBadge() {
    const count = await getQueueCount();
    queueCount.textContent = count;
    queueInfo.classList.toggle("hidden", count === 0);
}

// ── Transcript helpers ──
function clearPlaceholder() {
    const ph = transcript.querySelector(".placeholder");
    if (ph) ph.remove();
}

function appendFinalText(text) {
    clearPlaceholder();
    const span = document.createElement("span");
    span.textContent = text;
    transcript.appendChild(span);
    scrollToInsertPoint();
}

function appendDiarizedText(segments) {
    for (const seg of segments) {
        const label = document.createElement("span");
        label.className = "speaker-label";
        label.textContent = seg.speaker + ": ";
        transcript.appendChild(label);

        const text = document.createElement("span");
        text.textContent = seg.text + "\n\n";
        transcript.appendChild(text);
    }
    scrollToInsertPoint();
}

function scrollToInsertPoint() {
    // Don't auto-scroll if user has scrolled away to read earlier text
    if (userScrolledAway) return;

    const main = transcript.closest("main");
    if (!main) return;

    if (activeInsert && transcript.contains(activeInsert)) {
        const mainRect = main.getBoundingClientRect();
        const insertRect = activeInsert.getBoundingClientRect();

        // How far down is the insert point in the visible area? (0 = top, 1 = bottom)
        const relativePos = (insertRect.top - mainRect.top) / mainRect.height;

        if (relativePos < 0 || relativePos > 0.5) {
            // Insert point is off-screen above, or in the lower half of the viewport.
            // Scroll so insert point sits at ~35% from the top — keeps the 50vh
            // padding visible as black space below the active text.
            const targetOffset = mainRect.height * 0.35;
            const insertOffsetInMain = insertRect.top - mainRect.top + main.scrollTop;
            main.scrollTo({ top: insertOffsetInMain - targetOffset, behavior: "smooth" });
        }
        // If already in the upper half (0–50%), don't scroll — position is fine.
    } else {
        // Fallback: scroll to bottom (e.g. when appending without active insert)
        main.scrollTop = main.scrollHeight;
    }
}

// ── Mic level indicator ──
function startMicLevel(source) {
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);
    micLevel.classList.remove("hidden");
    micLevelLabel.classList.remove("hidden");
    updateMicLevel();
}

function updateMicLevel() {
    if (!analyserNode) return;
    const data = new Uint8Array(analyserNode.fftSize);
    analyserNode.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const rawLevel = Math.min(1, rms * 3); // amplify for visibility

    // Only update the speech average when there's actual speech (above silence floor).
    // This gives a stable overall assessment instead of a jumpy real-time meter.
    const SILENCE_FLOOR = 0.06;
    if (rawLevel > SILENCE_FLOOR) {
        // Very slow EMA: assessment changes gradually over ~3-5 seconds of speech
        smoothLevel = smoothLevel === 0
            ? rawLevel
            : smoothLevel * 0.98 + rawLevel * 0.02;
    }
    // During silence: keep previous smoothLevel (= last speech assessment)

    // Determine status: one stable assessment based on average speech level
    let newLabel, dotColor;
    if (smoothLevel < SILENCE_FLOOR) {
        // Not spoken yet or only silence
        newLabel = ""; dotColor = "#555";
    } else if (smoothLevel < 0.12) {
        newLabel = "te zacht"; dotColor = "#ef4444";
    } else if (smoothLevel > 0.75) {
        newLabel = "te hard"; dotColor = "#ef4444";
    } else if (smoothLevel > 0.45) {
        newLabel = "hard"; dotColor = "#eab308";
    } else {
        newLabel = "in orde"; dotColor = "#4ade80";
    }

    // Update dot color
    micLevel.style.background = dotColor;

    // Update label (only when it actually changes)
    if (newLabel !== lastLabel) {
        micLevelLabel.textContent = newLabel;
        micLevelLabel.style.color = dotColor;
        lastLabel = newLabel;
    }
    micLevelAnimId = requestAnimationFrame(updateMicLevel);
}

function stopMicLevel() {
    if (micLevelAnimId) { cancelAnimationFrame(micLevelAnimId); micLevelAnimId = null; }
    if (analyserNode) { analyserNode.disconnect(); analyserNode = null; }
    smoothLevel = 0;
    lastLabel = "";
    micLevel.classList.add("hidden");
    micLevelLabel.classList.add("hidden");
    micLevel.style.background = "#555";
    micLevelLabel.textContent = "";
}

// ── Audio: PCM s16le 16kHz mono ──
function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(buffer);
}

function downsample(buffer, fromRate, toRate) {
    if (fromRate === toRate) return buffer;
    const ratio = fromRate / toRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
        result[i] = buffer[Math.round(i * ratio)];
    }
    return result;
}

// ── Realtime recording ──
async function startRealtime() {
    const delay = delaySelect.value;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/ws/transcribe?delay=${delay}`);

    ws.onopen = () => {
        statusText.textContent = "Opnemen (realtime)";
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "delta") {
            feedText(msg.text);
        } else if (msg.type === "done") {
            if (!checkForCommand()) finalizeInsertPoint();
        } else if (msg.type === "error") {
            console.error("Transcription error (full):", msg.message);
            // Show short user-friendly message, not the full gRPC stack trace
            showToast("Serverfout — herverbinden...");
        }
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);

    ws.onclose = () => {
        if (isRecording) {
            // Transient error: try to reconnect automatically
            console.log("WebSocket closed while recording — attempting reconnect...");
            stopAudioCapture();
            finalizeInsertPoint();
            showToast("Verbinding verbroken — herverbinden...");
            // Brief delay then reconnect
            setTimeout(async () => {
                if (!isRecording) return; // user stopped in the meantime
                try {
                    await startRealtime();
                    showToast("Herverbonden");
                } catch (err) {
                    console.error("Reconnect failed:", err);
                    isRecording = false;
                    btnRecord.classList.remove("active");
                    btnRecord.textContent = "Opnemen";
                    updateModeUI();
                    showToast("Herverbinden mislukt");
                }
            }, 1500);
        }
    };

    await new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve, { once: true });
        ws.addEventListener("error", reject, { once: true });
    });

    const audioConstraints = { channelCount: 1, sampleRate: 16000 };
    if (selectedMicId) audioConstraints.deviceId = { exact: selectedMicId };
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);

    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    processorNode.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const downsampled = downsample(inputData, audioContext.sampleRate, 16000);
        const pcm = floatTo16BitPCM(downsampled);
        ws.send(pcm.buffer);
    };

    source.connect(processorNode);
    processorNode.connect(audioContext.destination);

    startMicLevel(source);
}

function stopRealtime() {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    ws = null;
    stopAudioCapture();
}

// ── Offline / batch recording ──
let mediaRecorder = null;
let offlineChunks = [];

async function startOffline() {
    statusText.textContent = "Opnemen...";

    const audioConstraints = { channelCount: 1 };
    if (selectedMicId) audioConstraints.deviceId = { exact: selectedMicId };
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

    // Create AudioContext for mic level monitoring
    audioContext = new AudioContext();
    const monitorSource = audioContext.createMediaStreamSource(mediaStream);
    startMicLevel(monitorSource);

    offlineChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: "audio/webm;codecs=opus" });

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) offlineChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
        if (offlineChunks.length > 0) {
            const blob = new Blob(offlineChunks, { type: "audio/webm" });
            statusText.textContent = "Transcriberen...";
            try {
                const formData = new FormData();
                formData.append("file", blob, "recording.webm");
                if (useDiarize) formData.append("diarize", "true");
                const resp = await fetch("/api/transcribe", { method: "POST", body: formData });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.segments && data.segments.length > 0) {
                        // Diarized output: show speaker labels
                        clearPlaceholder();
                        appendDiarizedText(data.segments);
                    } else if (data.text) {
                        clearPlaceholder();
                        feedText(data.text);
                        checkForCommand();
                    }
                } else {
                    await saveToQueue(blob);
                }
            } catch {
                await saveToQueue(blob);
            }
            updateModeUI();
        }
        offlineChunks = [];
        finalizeInsertPoint(); // no-op if command already handled
        autoCorrectAfterStop().then(() => copyTranscript()); // correct then copy
    };

    mediaRecorder.start(1000);
}

function stopOffline() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    mediaRecorder = null;
    stopAudioCapture();
}

function stopAudioCapture() {
    stopMicLevel();
    if (processorNode) { processorNode.disconnect(); processorNode = null; }
    if (audioContext) { audioContext.close(); audioContext = null; }
    if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }
}

// ── Record button ──
btnRecord.addEventListener("click", async () => {
    if (isRecording) {
        isRecording = false;
        btnRecord.classList.remove("active");
        btnRecord.textContent = "Opnemen";

        if (useRealtime && ws) {
            stopRealtime();
            finalizeInsertPoint();
            autoCorrectAfterStop().then(() => copyTranscript()); // correct then copy
        } else {
            stopOffline();
            // Don't finalize here — onstop handler does it after inserting text
            // Auto-correct + copy happens in onstop handler after transcription
        }

        updateModeUI();
    } else {
        isRecording = true;
        btnRecord.classList.add("active");
        btnRecord.textContent = "Stop";

        try {
            if (useRealtime) {
                await startRealtime();
            } else {
                await startOffline();
            }
        } catch (err) {
            console.error("Failed to start recording:", err);
            isRecording = false;
            btnRecord.classList.remove("active");
            btnRecord.textContent = "Opnemen";
            finalizeInsertPoint();
            statusText.textContent = "Fout: " + err.message;
        }
    }
});

// ── Copy helpers ──
async function copyTranscript() {
    let text = transcript.innerText.trim();
    if (!text || text === "Druk op opnemen om te beginnen...") return;
    // Normalize line endings: use \r\n for Windows compatibility
    text = text.replace(/\r?\n/g, "\r\n");
    try {
        await navigator.clipboard.writeText(text);
        showToast("Gekopieerd");
    } catch {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showToast("Gekopieerd");
    }
}

btnCopy.addEventListener("click", copyTranscript);

// ── Text correction ──
const btnCorrect = document.getElementById("btn-correct");

async function correctText(text) {
    const resp = await fetch("/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, system_prompt: systemPrompt }),
    });
    const raw = await resp.text();
    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error(`Server fout (${resp.status}): ${raw.substring(0, 120)}`);
    }
    if (!resp.ok) throw new Error(data.error || `Server fout ${resp.status}`);
    return data.corrected;
}

// Manual: correct entire transcript
btnCorrect.addEventListener("click", async () => {
    const text = transcript.innerText.trim();
    if (!text || text === "Druk op opnemen om te beginnen...") return;
    if (isRecording) return;

    btnCorrect.textContent = "...";
    btnCorrect.disabled = true;

    try {
        const corrected = await correctText(text);
        if (corrected && corrected !== text) {
            transcript.innerHTML = "";
            const span = document.createElement("span");
            span.textContent = corrected;
            span.classList.add("corrected");
            transcript.appendChild(span);
            showToast("Tekst gecorrigeerd");
        } else {
            showToast("Geen correcties nodig");
        }
    } catch (err) {
        showToast("Correctie mislukt: " + err.message);
    } finally {
        btnCorrect.textContent = "Controleer";
        btnCorrect.disabled = false;
    }
});

// Auto-correct: correct full transcript after recording stops
async function autoCorrectAfterStop() {
    console.debug(`[autocorrect] autoCorrect=${autoCorrect}, called after stop`);
    if (!autoCorrect) return;

    const text = transcript.innerText.trim();
    if (!text || text === "Druk op opnemen om te beginnen...") return;

    btnCorrect.textContent = "...";
    btnCorrect.disabled = true;

    try {
        const corrected = await correctText(text);
        if (corrected && corrected.trim() !== text) {
            transcript.innerHTML = "";
            const span = document.createElement("span");
            span.textContent = corrected;
            span.classList.add("corrected");
            transcript.appendChild(span);
            showToast("Tekst gecorrigeerd");
        }
    } catch {
        // Silent fail for auto-correct
    } finally {
        btnCorrect.textContent = "Controleer";
        btnCorrect.disabled = false;
    }
}

// ── Clear button ──
btnClear.addEventListener("click", () => {
    if (isRecording) return;
    transcript.innerHTML = '<span class="placeholder">Druk op opnemen om te beginnen...</span>';
    activeInsert = null;
    undoStack = []; // clear undo history — deliberate wipe shouldn't be undoable
});

// ── Toast ──
function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 1500);
}

// ── Queue: auto-retry when back online + periodic + click to retry ──
window.addEventListener("online", () => {
    console.log("Back online — processing queue");
    processQueue();
});

// Retry queue every 30 seconds if there are items
setInterval(async () => {
    const count = await getQueueCount();
    if (count > 0 && navigator.onLine) processQueue();
}, 30000);

// Click on queue badge to manually retry
queueInfo.style.cursor = "pointer";
queueInfo.title = "Klik om wachtrij opnieuw te verwerken";
queueInfo.addEventListener("click", () => {
    if (!isProcessingQueue) processQueue();
});

// ── Settings modal ──
const toggleAutocorrect = document.getElementById("toggle-autocorrect");
const inputSystemPrompt = document.getElementById("input-system-prompt");
const selectMicrophone = document.getElementById("select-microphone");
let selectedMicId = localStorage.getItem("voxtral-mic") || "";

async function loadMicrophones() {
    try {
        // Request permission first (needed to get device labels)
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === "audioinput");
        selectMicrophone.innerHTML = "";
        for (const mic of mics) {
            const opt = document.createElement("option");
            opt.value = mic.deviceId;
            opt.textContent = mic.label || `Microfoon ${selectMicrophone.options.length + 1}`;
            if (mic.deviceId === selectedMicId) opt.selected = true;
            selectMicrophone.appendChild(opt);
        }
        // If no saved selection, default is the first (system default)
        if (!selectedMicId && mics.length > 0) {
            selectedMicId = mics[0].deviceId;
        }
    } catch {
        selectMicrophone.innerHTML = '<option>Geen toegang tot microfoon</option>';
    }
}

function openSettings() {
    settingsOverlay.classList.remove("hidden");
    settingsStatus.textContent = "";
    settingsStatus.className = "modal-status";
    inputApiKey.value = "";
    // Load current masked key as placeholder
    fetch("/api/settings").then(r => r.json()).then(data => {
        inputApiKey.placeholder = data.has_key ? data.masked_key : "Plak je API key hier...";
    }).catch(() => {});
    // Load correction settings
    toggleAutocorrect.checked = autoCorrect;
    inputSystemPrompt.value = systemPrompt;
    // Load microphone list
    loadMicrophones();
}

function closeSettings() {
    settingsOverlay.classList.add("hidden");
}

document.getElementById("btn-settings").addEventListener("click", openSettings);
document.getElementById("btn-close-settings").addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
});

// Toggle key visibility
document.getElementById("btn-toggle-key").addEventListener("click", () => {
    inputApiKey.type = inputApiKey.type === "password" ? "text" : "password";
});

// Save key
document.getElementById("btn-save-key").addEventListener("click", async () => {
    // Always save all settings
    autoCorrect = toggleAutocorrect.checked;
    localStorage.setItem("voxtral-autocorrect", JSON.stringify(autoCorrect));
    systemPrompt = inputSystemPrompt.value;
    localStorage.setItem("voxtral-system-prompt", systemPrompt);
    selectedMicId = selectMicrophone.value;
    localStorage.setItem("voxtral-mic", selectedMicId);

    // Only validate/save API key if a new one was entered
    const key = inputApiKey.value.trim();
    if (!key) {
        settingsStatus.textContent = "Instellingen opgeslagen";
        settingsStatus.className = "modal-status success";
        setTimeout(closeSettings, 1500);
        return;
    }
    settingsStatus.textContent = "Valideren...";
    settingsStatus.className = "modal-status";
    try {
        const resp = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: key }),
        });
        const data = await resp.json();
        if (resp.ok) {
            settingsStatus.textContent = "Opgeslagen en gevalideerd";
            settingsStatus.className = "modal-status success";
            setTimeout(closeSettings, 1500);
        } else {
            settingsStatus.textContent = data.error || "Opslaan mislukt";
            settingsStatus.className = "modal-status error";
        }
    } catch (err) {
        settingsStatus.textContent = "Verbindingsfout: " + err.message;
        settingsStatus.className = "modal-status error";
    }
});

// ── Keyboard shortcut for recording ──
document.addEventListener("keydown", (e) => {
    // Don't trigger while typing in inputs or settings modal
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (!settingsOverlay.classList.contains("hidden")) return;

    if (matchesShortcut(e, recordShortcut)) {
        e.preventDefault();
        btnRecord.click();
    }
});

// ── Help panel ──
const helpPanel = document.getElementById("help-panel");
const btnHelp = document.getElementById("btn-help");
const btnCloseHelp = document.getElementById("btn-close-help");

btnHelp.addEventListener("click", () => {
    updateShortcutDisplays(); // refresh shortcut label
    helpPanel.classList.toggle("visible");
});

btnCloseHelp.addEventListener("click", () => {
    helpPanel.classList.remove("visible");
});


// ── Shortcut configuration in settings ──
const inputShortcut = document.getElementById("input-shortcut");
const btnResetShortcut = document.getElementById("btn-reset-shortcut");
let pendingShortcut = null;

inputShortcut.addEventListener("keydown", (e) => {
    e.preventDefault();
    // Ignore standalone modifier keys
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

    pendingShortcut = {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
        key: e.key
    };
    inputShortcut.value = shortcutLabel(pendingShortcut);
});

btnResetShortcut.addEventListener("click", () => {
    pendingShortcut = { ...DEFAULT_SHORTCUT };
    inputShortcut.value = shortcutLabel(pendingShortcut);
});

// Show current shortcut when settings open
document.getElementById("btn-settings").addEventListener("click", () => {
    pendingShortcut = null;
    inputShortcut.value = shortcutLabel(recordShortcut);
});

// Save shortcut alongside API key
document.getElementById("btn-save-key").addEventListener("click", () => {
    if (pendingShortcut) {
        saveShortcut(pendingShortcut);
        pendingShortcut = null;
    }
});

// ── Init ──
updateModeUI();
updateQueueBadge();
updateShortcutDisplays();
processQueue();

// Register service worker for PWA install
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Check if API key is configured on load
fetch("/api/health").then(r => r.json()).then(data => {
    if (data.status === "no_key") {
        openSettings();
    }
}).catch(() => {});
