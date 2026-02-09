import { UserRole } from "@follow/constants"
import type { TranslationSchema } from "@follow/database/schemas/types"
import { TranslationService } from "@follow/database/services/translation"
import type { SupportedActionLanguage } from "@follow/shared"
import { checkLanguage } from "@follow/utils/language"
import { create, indexedResolver, windowScheduler } from "@yornaath/batshit"

import { api } from "../../context"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { readNdjsonStream } from "../../lib/stream"
import { getEntry } from "../entry/getter"
import { useUserStore } from "../user/store"
import type { EntryTranslation, TranslationFieldArray, TranslationMode } from "./types"
import { translationFields } from "./types"

type TranslationModel = Omit<TranslationSchema, "createdAt">
type TranslationBatchRequest = Parameters<ReturnType<typeof api>["ai"]["translationBatch"]>[0]

interface TranslationState {
  data: Record<string, Partial<Record<SupportedActionLanguage, EntryTranslation>>>
}
const defaultState: TranslationState = {
  data: {},
}

export const useTranslationStore = createZustandStore<TranslationState>("translation")(
  () => defaultState,
)

const get = useTranslationStore.getState
const set = useTranslationStore.setState
const immerSet = createImmerSetter(useTranslationStore)

class TranslationActions implements Hydratable, Resetable {
  async hydrate() {
    const translations = await TranslationService.getTranslationToHydrate()
    translationActions.upsertManyInSession(translations)
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(defaultState)
    })
    tx.persist(() => TranslationService.reset())

    await tx.run()
  }

  upsertManyInSession(translations: TranslationModel[]) {
    immerSet((state) => {
      translations.forEach((translation) => {
        if (!state.data[translation.entryId]) {
          state.data[translation.entryId] = {}
        }

        if (!state.data[translation.entryId]![translation.language]) {
          state.data[translation.entryId]![translation.language] = {
            title: null,
            description: null,
            content: null,
            readabilityContent: null,
          }
        }

        translationFields.forEach((field) => {
          if (translation[field]) {
            state.data[translation.entryId]![translation.language]![field] = translation[field]
          }
        })
      })
    })
  }

  async upsertMany(translations: TranslationModel[]) {
    this.upsertManyInSession(translations)

    await Promise.all(
      translations.map((translation) => TranslationService.insertTranslation(translation)),
    )
  }

  getTranslation(entryId: string, language: SupportedActionLanguage) {
    return get().data[entryId]?.[language]
  }
}

export const translationActions = new TranslationActions()

class TranslationSyncService {
  private currentMode?: TranslationMode

  private async ensureMode(mode: TranslationMode) {
    if (!this.currentMode) {
      this.currentMode = mode
      return
    }

    if (this.currentMode === mode) return

    this.currentMode = mode
    await translationActions.reset()
  }

  private translationBatcher = create({
    fetcher: async (keys: string[]) => {
      // key format: `${entryId}|${language}|${target}|${fields}|${mode}`
      type KeyParts = {
        entryId: string
        language: SupportedActionLanguage
        target: "content" | "readabilityContent"
        fields: string
        mode: TranslationMode
      }

      const parseKey = (key: string): KeyParts => {
        const [entryId, language, target, fields, mode] = key.split("|") as [
          string,
          SupportedActionLanguage,
          "content" | "readabilityContent",
          string,
          TranslationMode | undefined,
        ]
        return { entryId, language, target, fields, mode: mode ?? "bilingual" }
      }

      const requests = keys.map(parseKey)

      // Group by language + fields + mode to minimize stream calls
      const groupKey = (r: KeyParts) => `${r.language}#${r.fields}#${r.mode}`
      const grouped = new Map<
        string,
        {
          language: SupportedActionLanguage
          fields: string
          mode: TranslationMode
          ids: string[]
          keyById: Record<string, string>
        }
      >()

      for (const r of requests) {
        const gk = groupKey(r)
        if (!grouped.has(gk)) {
          grouped.set(gk, {
            language: r.language,
            fields: r.fields,
            mode: r.mode,
            ids: [],
            keyById: {},
          })
        }
        const g = grouped.get(gk)!
        g.ids.push(r.entryId)
        g.keyById[r.entryId] = `${r.entryId}|${r.language}|${r.target}|${r.fields}|${r.mode}`
      }

      const results: Record<string, TranslationModel | null> = {}

      // Execute each group sequentially to keep memory small; groups are already windowed by scheduler
      for (const [, group] of grouped) {
        if (this.currentMode && this.currentMode !== group.mode) {
          for (const id of group.ids) {
            if (!group.keyById[id]) continue
            results[group.keyById[id]] = null
          }
          continue
        }

        try {
          const request: TranslationBatchRequest & { mode?: TranslationMode } = {
            ids: group.ids,
            language: group.language,
            fields: group.fields,
            mode: group.mode,
          }
          const response = await api().ai.translationBatch(request)

          await readNdjsonStream<{
            id: string
            data: Partial<Record<keyof TranslationModel, string>>
          }>(response, async (json) => {
            const key = group.keyById[json.id]
            if (!key) return

            if (this.currentMode && this.currentMode !== group.mode) return

            const translation: TranslationModel = {
              entryId: json.id,
              language: group.language,
              title: null,
              description: null,
              content: null,
              readabilityContent: null,
            }

            const { title, description, content, readabilityContent } = json.data || {}
            if (typeof title === "string") translation.title = title
            if (typeof description === "string") translation.description = description
            if (typeof content === "string") translation.content = content
            if (typeof readabilityContent === "string")
              translation.readabilityContent = readabilityContent

            results[key] = translation
            await translationActions.upsertMany([translation])
          })
        } catch (e) {
          console.error("Translation stream request failed:", e)
        }
      }

      return results
    },
    resolver: indexedResolver(),
    scheduler: windowScheduler(1000),
  })

  async translateEntry({
    entryId,
    language,
    content,
    target = "description",
    style = "append",
    tokenConfig,
  }: {
    entryId: string
    language: SupportedActionLanguage
    content: string
    target?: "description" | "content"
    style?: "append" | "bilingual_paragraph"
    tokenConfig?: { apiKey?: string; baseURL?: string; model?: string }
  }) {
    console.log("Starting translation for entry:", entryId, "Language:", language, "Style:", style)

    const apiKey = tokenConfig?.apiKey
    const baseURL = tokenConfig?.baseURL
    const model = tokenConfig?.model || "deepseek-v3.2"

    if (!apiKey || !baseURL) {
      console.warn("Missing AI Token Configuration (APK Key or Base URL)")
      throw new Error("Missing AI Token Configuration. Please configure it in Settings -> AI.")
    }

    try {
      // Chunking logic
      const MAX_CHUNK_SIZE = 2000
      const chunks: string[] = []
      let tempContent = content

      while (tempContent.length > 0) {
        if (tempContent.length <= MAX_CHUNK_SIZE) {
          chunks.push(tempContent)
          break
        }
        
        let chunk = tempContent.slice(0, MAX_CHUNK_SIZE)
        const lastP = chunk.lastIndexOf("</p>")
        const lastNewline = chunk.lastIndexOf("\n")
        
        let splitIndex = MAX_CHUNK_SIZE
        if (lastP > -1) {
            splitIndex = lastP + 4
        } else if (lastNewline > -1) {
            splitIndex = lastNewline + 1
        }

        chunks.push(tempContent.slice(0, splitIndex))
        tempContent = tempContent.slice(splitIndex)
      }

      console.log(`Split content into ${chunks.length} chunks`)
      const translatedChunks: string[] = []

      let systemPrompt = `You are a helpful assistant that translates text. Please translate the following content to ${language}.`
      
      if (style === "bilingual_paragraph") {
        systemPrompt += `
          The user wants a bilingual view. 
          Please output the translation by appending the translated text after each original paragraph.
          Maintain the original HTML/Markdown structure. 
          Format: 
          <p>Original text</p>
          <p>Translated text</p>`
      } else {
        // Default append style (just return translation)
        systemPrompt += ` Returns only the translated content.`
      }

      for (const chunk of chunks) {
          const response = await fetch(`${baseURL}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: model,
              max_tokens: 4096,
              messages: [
                {
                  role: "system",
                  content: systemPrompt,
                },
                {
                  role: "user",
                  content: chunk,
                },
              ],
              stream: false,
            }),
          })

          if (!response.ok) {
            console.error("API error status:", response.status, response.statusText)
            throw new Error(`API error: ${response.statusText}`)
          }

          const data = await response.json()
          const text = data.choices?.[0]?.message?.content || ""
          translatedChunks.push(text)
      }

      const translatedText = translatedChunks.join("\n")
      console.log("Translation complete")

      await translationActions.upsertMany([
        {
          entryId,
          language,
          [target]: translatedText,
        },
      ])

      return translatedText
    } catch (error) {
      console.error("Iflow translation error:", error)
      throw error
    }
  }

  async generateTranslation({
    entryId,
    language,
    withContent,
    target,
    mode,
  }: {
    entryId: string
    language: SupportedActionLanguage
    withContent?: boolean
    target: "content" | "readabilityContent"
    mode?: TranslationMode
  }) {
    const userRole = useUserStore.getState().role

    if (userRole === UserRole.Free) return null
    const translationMode = mode ?? "bilingual"
    await this.ensureMode(translationMode)

    const entry = getEntry(entryId)

    if (!entry) return
    const translationSession = translationActions.getTranslation(entryId, language)

    const fields = (
      ["title", "description", ...(withContent ? [target] : [])] as TranslationFieldArray
    ).filter((field) => {
      const content = entry[field]
      if (!content) return false

      if (translationSession?.[field]) return false

      return !checkLanguage({
        content,
        language,
      })
    })

    if (fields.length === 0) return null

    const key = `${entryId}|${language}|${target}|${fields.join(",")}|${translationMode}`
    const result = await this.translationBatcher.fetch(key)
    return result || null
  }
}

export const translationSyncService = new TranslationSyncService()
