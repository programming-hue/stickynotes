import React from 'react';

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~|https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={keyIdx++} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={keyIdx++} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={keyIdx++}
          className="px-1 py-0.5 rounded bg-black/10 font-mono-note text-[0.86em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(
        <del key={keyIdx++} className="opacity-65 line-through">
          {token.slice(2, -2)}
        </del>
      );
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      nodes.push(
        <a
          key={keyIdx++}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="underline decoration-current/50 underline-offset-2 hover:decoration-current break-all"
        >
          {token}
        </a>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function renderLiteMarkdown(source: string): React.ReactNode {
  if (!source.trim()) {
    return (
      <span className="opacity-45 italic">
        Double-click to write Markdown notes...
      </span>
    );
  }

  const lines = source.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="font-bold text-[1.02em] leading-snug mt-1.5 mb-0.5">
          {renderInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="font-bold text-[1.12em] leading-snug mt-1.5 mb-0.5">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="font-bold text-[1.24em] leading-snug mt-1 mb-1">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={i}
          className="pl-2.5 my-1 italic opacity-85 bg-black/[0.04] rounded py-0.5 pr-2"
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
    } else if (line.startsWith('- [x] ') || line.startsWith('- [X] ')) {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 leading-snug my-0.5">
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 mt-0.5 rounded bg-slate-800 text-white text-[10px] shrink-0">
            ✓
          </span>
          <span className="line-through opacity-65">{renderInline(line.slice(6))}</span>
        </div>
      );
    } else if (line.startsWith('- [ ] ')) {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 leading-snug my-0.5">
          <span className="inline-block w-3.5 h-3.5 mt-0.5 rounded border border-slate-700/50 shrink-0" />
          <span>{renderInline(line.slice(6))}</span>
        </div>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex items-start gap-1.5 leading-snug my-0.5">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === '---') {
      elements.push(<hr key={i} className="my-2 border-black/15" />);
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }

  return <div className="space-y-0.5 break-words">{elements}</div>;
}
