import { Button } from "@follow/components/ui/button/index.js"
import { Input } from "@follow/components/ui/input/index.js"
import { Label } from "@follow/components/ui/label/index.jsx"
import type { TokenConfiguration } from "@follow/shared/settings/interface"
import { useState } from "react"
import { useTranslation } from "react-i18next"

interface TokenConfigurationModalProps {
  config?: TokenConfiguration
  onSave: (config: TokenConfiguration) => void
  onCancel: () => void
}

export const TokenConfigurationModal = ({
  config,
  onSave,
  onCancel,
}: TokenConfigurationModalProps) => {
  const { t } = useTranslation("ai")

  const [formData, setFormData] = useState<TokenConfiguration>({
    baseURL: config?.baseURL ?? undefined,
    model: config?.model ?? undefined,
    apiKey: config?.apiKey ?? undefined,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-[40ch] space-y-4">
      <div className="space-y-2">
        <Label htmlFor="baseURL">{t("byok.providers.form.base_url")}</Label>
        <Input
          id="baseURL"
          type="url"
          placeholder={t("byok.providers.form.base_url_placeholder")}
          value={formData.baseURL ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              baseURL: e.target.value || undefined,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.base_url_help")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="model">Model</Label>
        <Input
          id="model"
          type="text"
          placeholder="e.g. deepseek-v3.2"
          value={formData.model ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              model: e.target.value || undefined,
            })
          }
        />
        <p className="text-xs text-text-secondary">The model identifier to use</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiKey">{t("byok.providers.form.api_key")}</Label>
        <Input
          id="apiKey"
          type="password"
          placeholder={t("byok.providers.form.api_key_placeholder")}
          value={formData.apiKey ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              apiKey: e.target.value || undefined,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.api_key_help")}</p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("words.cancel", { ns: "common" })}
        </Button>
        <Button type="submit">{t("words.save", { ns: "common" })}</Button>
      </div>
    </form>
  )
}
