import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import 'highlight.js/styles/github-dark.css';

// CRITICAL: Sanitization schema prevents XSS attacks
const sanitizeSchema = {
  tagNames: [
    'p', 'em', 'strong', 'code', 'pre', 'a', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'details', 'summary', // Collapsible sections
    'span', // For heading anchors
  ],
  attributes: {
    a: ['href', 'title', 'className'],  // Links + class for anchor styling
    code: ['className'],                 // Syntax highlighting
    details: ['open'],                   // Allow open attribute for collapsibles
    '*': ['id'],                         // Allow IDs for heading anchors
    span: ['className'],                 // For anchor icons
  },
  protocols: {
    href: ['http', 'https', 'mailto'],  // Block javascript:
  },
};

export function MessageRenderer({ content }: { content: string }) {
  return (
    <div className="prose dark:prose-invert max-w-none prose-details">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,   // Parse raw HTML (details/summary)
          rehypeSlug,  // Add IDs to headings
          [rehypeAutolinkHeadings, {
            behavior: 'wrap',
            properties: { className: 'heading-anchor' }
          }],
          [rehypeSanitize, sanitizeSchema],  // MUST be included - sanitizes after parsing
          rehypeHighlight,
        ]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
