import { Button } from "@follow/components/ui/button/index.js"
import { Label } from "@follow/components/ui/label/index.jsx"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { getAISettings, setAISetting, useAISettingValue } from "~/atoms/settings/ai"
import { useDialog, useModalStack } from "~/components/ui/modal/stacked/hooks"

import { TokenConfigurationModal } from "./TokenConfigurationModal"

export const TokenConfigurationSection = () => {
  const { t } = useTranslation("ai")
  const aiSettings = useAISettingValue()
  // Retrieve tokenConfiguration or use default if undefined
  const tokenConfig = aiSettings.tokenConfiguration ?? { apiKey: undefined, baseURL: undefined }
  const { present } = useModalStack()

  const handleConfigure = () => {
    present({
      title: "Token Configuration", // We might want to add a translation key for this
      content: ({ dismiss }: { dismiss: () => void }) => (
        <TokenConfigurationModal
          config={getAISettings().tokenConfiguration}
          onSave={(newConfig) => {
            setAISetting("tokenConfiguration", newConfig)
            toast.success(t("byok.providers.updated"))
            dismiss()
          }}
          onCancel={dismiss}
        />
      ),
    })
  }

  const hasConfig = !!tokenConfig.apiKey

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-sm font-medium text-text">TokenConfiguration</Label>
            <div className="text-xs text-text-secondary">
              Configure the API Key and URL for translation services
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleConfigure}>
             <i className="i-mgc-settings-4-line mr-2 size-4" />
             {hasConfig ? t("words.edit", { ns: "common" }) : t("words.configure", { ns: "common" })}
          </Button>
        </div>
        {hasConfig && (
          <div className="mt-2 text-xs text-text-secondary flex items-center gap-2">
            {tokenConfig.baseURL && <span>Base URL: {tokenConfig.baseURL}</span>}
            {tokenConfig.model && <span>Model: {tokenConfig.model}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
