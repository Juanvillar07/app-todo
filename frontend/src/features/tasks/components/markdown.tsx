import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/** Renderiza Markdown (con tablas, listas de tareas, etc.). react-markdown no ejecuta HTML. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm prose-neutral max-w-none dark:prose-invert prose-headings:font-semibold prose-a:underline-offset-4',
        // Código en línea sin las comillas que añade typography, con un fondo sutil.
        'prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none',
        // Listas de tareas (- [ ]) sin viñeta.
        '[&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0 [&_.task-list-item_input]:my-0 [&_.task-list-item_input]:mr-2 [&_.task-list-item_input]:align-middle',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
