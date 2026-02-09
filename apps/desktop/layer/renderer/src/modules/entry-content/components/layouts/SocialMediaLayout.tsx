import { useEntry } from "@follow/store/entry/hooks"
import { useFeedById } from "@follow/store/feed/hooks"
import { useEntryTranslation } from "@follow/store/translation/hooks"
import { translationSyncService } from "@follow/store/translation/store"
import { cn } from "@follow/utils/utils"
import { useState } from "react"
import { useActionLanguage, useGeneralSettingKey } from "~/atoms/settings/general"
import { useAISettingValue } from "~/atoms/settings/ai"

import { Media } from "~/components/ui/media/Media"
import { readableContentMaxWidthClassName } from "~/constants/ui"

import { AuthorHeader } from "./shared/AuthorHeader"
import { ContentBody } from "./shared/ContentBody"
import type { EntryLayoutProps } from "./types"

export const SocialMediaLayout: React.FC<EntryLayoutProps> = ({
  entryId,
  compact = false,
  noMedia = false,
  translation: propTranslation,
}) => {
  const entry = useEntry(entryId, (state) => ({
    feedId: state.feedId,
    media: state.media,
    description: state.description,
    content: state.content,
  }))
  const feed = useFeedById(entry?.feedId)

  const [forceShowTranslation, setForceShowTranslation] = useState(false)
  const enableTranslation = useGeneralSettingKey("translation")
  const actionLanguage = useActionLanguage()
  const targetLanguage = actionLanguage || "en"
  const translationData = useEntryTranslation({
    entryId,
    language: targetLanguage,
    enabled: enableTranslation || forceShowTranslation,
  })
  const translation = translationData
    ? {
        content: translationData.content ?? undefined,
        title: translationData.title ?? undefined,
        description: translationData.description ?? undefined,
      }
    : propTranslation

  const aiSettings = useAISettingValue()

  const handleTranslate = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const contentToTranslate = entry?.content || entry?.description
    if (!contentToTranslate) return
    setForceShowTranslation(true)
    await translationSyncService.translateEntry({
      entryId,
      language: targetLanguage,
      content: contentToTranslate,
      target: "description",
      style: "append",
      tokenConfig: aiSettings.tokenConfiguration,
    })
  }

  if (!entry || !feed) return null

  return (
    <div className={cn(readableContentMaxWidthClassName, "mx-auto space-y-5 pt-12")}>
      {/* Single Author header without avatar */}
      <AuthorHeader entryId={entryId} onTranslate={handleTranslate} />

      {/* Main content - direct ContentBody usage without show more logic */}
      <ContentBody
        entryId={entryId}
        translation={translation}
        compact={compact}
        className="text-base leading-relaxed"
        noMedia={true}
      />

      {/* Media gallery */}
      {entry.media &&
        entry.media.length > 0 &&
        !noMedia &&
        entry.media.map((m) => (
          <div key={m.url} className="mt-4 flex justify-center">
            <Media
              src={m.url}
              type={m.type}
              previewImageUrl={m.preview_image_url}
              blurhash={m.blurhash}
            />
          </div>
        ))}
    </div>
  )
}
