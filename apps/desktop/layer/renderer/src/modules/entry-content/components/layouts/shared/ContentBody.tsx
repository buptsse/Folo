import { useEntry } from "@follow/store/entry/hooks"
import { cn } from "@follow/utils/utils"

import { HTML } from "~/components/ui/markdown/HTML"
import { readableContentMaxWidthClassName } from "~/constants/ui"
import { useRenderStyle } from "~/hooks/biz/useRenderStyle"

interface ContentBodyProps {
  entryId: string
  className?: string
  compact?: boolean
  noMedia?: boolean
  translation?: {
    content?: string
    title?: string
    description?: string
  }
}

export const ContentBody: React.FC<ContentBodyProps> = ({
  entryId,
  className,
  compact = false,
  noMedia = false,
  translation,
}) => {
  const entry = useEntry(entryId, (state) => ({
    content: state.content,
    description: state.description,
  }))

  const renderStyle = useRenderStyle({
    baseFontSize: compact ? 14 : 16,
    baseLineHeight: compact ? 1.625 : 1.7,
  })

  if (!entry) return null

  const content = entry.content || entry.description
  const translationContent = translation?.description || translation?.content

  if (!content) return null

  return (
    <>
      <HTML
        as="div"
        className={cn(
          "prose dark:prose-invert",
          "prose-blockquote:mt-0",
          "cursor-auto select-text",
          readableContentMaxWidthClassName,
          compact ? "text-sm leading-relaxed" : "text-base leading-relaxed",
          className,
        )}
        noMedia={noMedia}
        style={renderStyle}
      >
        {content}
      </HTML>
      {translationContent && (
        <div
          className={cn(
            readableContentMaxWidthClassName,
            "mt-4 border-t border-border pt-4 text-secondary-foreground",
          )}
        >
          <HTML
            as="div"
            className={cn(
              "prose dark:prose-invert",
              "prose-blockquote:mt-0",
              "cursor-auto select-text",
              compact ? "text-sm leading-relaxed" : "text-base leading-relaxed",
            )}
            noMedia
            style={renderStyle}
          >
            {translationContent}
          </HTML>
        </div>
      )}
    </>
  )
}
