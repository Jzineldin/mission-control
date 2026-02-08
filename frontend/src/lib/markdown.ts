/**
 * Safe markdown renderer that prevents XSS attacks
 * Supports: bold, inline code, fenced code blocks, headings, lists
 */

// HTML entity escaping to prevent XSS
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }
  return text.replace(/[&<>"']/g, (match) => htmlEntities[match])
}

// Extract language from code fence
function getLanguage(fence: string): string {
  const match = fence.match(/^```(\w+)?\s*\n/)
  return match?.[1] || ''
}

// Render fenced code blocks with styling and copy button placeholder
function renderCodeBlock(code: string, language: string): string {
  const escapedCode = escapeHtml(code)
  const langLabel = language ? `<span class="code-language">${language}</span>` : ''
  
  return `<pre class="code-block" style="
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 16px;
    margin: 12px 0;
    overflow-x: auto;
    position: relative;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
  ">${langLabel}<code style="
    color: rgba(255, 255, 255, 0.9);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre;
  ">${escapedCode}</code><button class="copy-button" style="
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    padding: 4px 8px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 10px;
    cursor: pointer;
    opacity: 0.7;
  " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">Copy</button></pre>`
}

// Process lists (lines starting with - or *)
function processLists(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inList = false
  let listItems: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const isListItem = trimmed.match(/^[-*]\s+(.+)/)

    if (isListItem) {
      if (!inList) {
        inList = true
        listItems = []
      }
      listItems.push(`<li style="margin-bottom: 4px;">${isListItem[1]}</li>`)
    } else {
      if (inList) {
        // End of list, flush accumulated items
        result.push(`<ul style="margin: 8px 0; padding-left: 20px; color: rgba(255, 255, 255, 0.82);">${listItems.join('')}</ul>`)
        listItems = []
        inList = false
      }
      if (trimmed || !inList) {
        result.push(line)
      }
    }
  }

  // Handle list at end of text
  if (inList && listItems.length > 0) {
    result.push(`<ul style="margin: 8px 0; padding-left: 20px; color: rgba(255, 255, 255, 0.82);">${listItems.join('')}</ul>`)
  }

  return result.join('\n')
}

// Process headings (## and ###)
function processHeadings(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3 style="font-size: 16px; font-weight: 600; color: rgba(255, 255, 255, 0.92); margin: 16px 0 8px 0;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size: 18px; font-weight: 600; color: rgba(255, 255, 255, 0.95); margin: 20px 0 10px 0;">$1</h2>')
}

/**
 * Main function to render markdown content safely
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''
  
  // Step 1: Escape HTML entities to prevent XSS
  let processed = escapeHtml(text)
  
  // Step 2: Handle fenced code blocks (```...```)
  // This must be done before other processing to avoid conflicts
  processed = processed.replace(/```(\w+)?\s*\n([\s\S]*?)\n```/g, (match, language, code) => {
    return renderCodeBlock(code, language || '')
  })
  
  // Step 3: Handle inline code (`...`)
  processed = processed.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-size:12px;color:rgba(255,255,255,0.9);">$1</code>')
  
  // Step 4: Handle bold text (**...**)
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 600; color: rgba(255, 255, 255, 0.95);">$1</strong>')
  
  // Step 5: Handle headings (## and ###)
  processed = processHeadings(processed)
  
  // Step 6: Handle lists (- and *)
  processed = processLists(processed)
  
  // Step 7: Replace remaining newlines with <br/>
  // Only replace single newlines that aren't part of block elements
  processed = processed.replace(/\n(?![^\n]*<\/(?:pre|ul|h[23])>)/g, '<br/>')
  
  return processed
}

// Widget-specific version with smaller styling
export function renderMarkdownWidget(text: string): string {
  if (!text) return ''
  
  // Step 1: Escape HTML entities to prevent XSS
  let processed = escapeHtml(text)
  
  // Step 2: Handle fenced code blocks with smaller styling
  processed = processed.replace(/```(\w+)?\s*\n([\s\S]*?)\n```/g, (match, language, code) => {
    const escapedCode = escapeHtml(code)
    const langLabel = language ? `<span style="font-size:9px;opacity:0.5;">${language}</span>` : ''
    
    return `<pre style="
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 10px;
      margin: 8px 0;
      overflow-x: auto;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 11px;
      line-height: 1.4;
    ">${langLabel}<code style="color: rgba(255, 255, 255, 0.85); white-space: pre;">${escapedCode}</code></pre>`
  })
  
  // Step 3: Handle inline code
  processed = processed.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:11px;">$1</code>')
  
  // Step 4: Handle bold text
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  
  // Step 5: Handle headings (smaller for widget)
  processed = processed
    .replace(/^### (.+)$/gm, '<h3 style="font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.9); margin: 10px 0 4px 0;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size: 14px; font-weight: 600; color: rgba(255, 255, 255, 0.92); margin: 12px 0 6px 0;">$1</h2>')
  
  // Step 6: Handle lists (smaller for widget)
  processed = processLists(processed).replace(
    /margin: 8px 0; padding-left: 20px/g, 
    'margin: 6px 0; padding-left: 16px; font-size: 12px'
  ).replace(/margin-bottom: 4px/g, 'margin-bottom: 2px')
  
  // Step 7: Replace remaining newlines with <br/>
  processed = processed.replace(/\n(?![^\n]*<\/(?:pre|ul|h[23])>)/g, '<br/>')
  
  return processed
}