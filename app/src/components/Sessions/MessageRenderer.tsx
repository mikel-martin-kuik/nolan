import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

// CRITICAL: Sanitization schema prevents XSS attacks
const sanitizeSchema = {
  tagNames: [
    'p', 'em', 'strong', 'code', 'pre', 'a', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
  ],
  attributes: {
    a: ['href', 'title'],          // Links only
    code: ['className'],           // Syntax highlighting
  },
  protocols: {
    href: ['http', 'https', 'mailto'],  // Block javascript:
  },
};

export function MessageRenderer({ content }: { content: string }) {
  return (
    <div className="prose dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeSanitize, sanitizeSchema],  // MUST be included
          rehypeHighlight,
        ]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
