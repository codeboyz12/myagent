"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { modelProvidersSchema, modelSettingsSchema, type ModelControl, type ModelProvider } from "@/lib/chat-shape";

type ModelOption = {
  id: string;
  name: string;
  alias?: string;
  providerId: string;
  providerName: string;
  value: string;
};

function modelOptionValue(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

function listProviderModels(providers: ModelProvider[]): ModelOption[] {
  return providers.flatMap((provider) => {
    if (!provider.enabled) return [];
    const savedModels = provider.models;
    const legacyModelIds = Object.keys(provider.model_controls);
    const availableModels = savedModels.length > 0
      ? savedModels
      : [...new Set([...legacyModelIds, provider.model_id])]
          .filter(Boolean)
          .map((id) => ({ id, name: id }));

    return availableModels.map((model) => ({
      ...model,
      providerId: provider.id,
      providerName: provider.name,
      value: modelOptionValue(provider.id, model.id),
    }));
  });
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
    ) {
      return payload.detail;
    }
  } catch {
    // Use the caller's fallback for non-JSON responses.
  }
  return fallback;
}

export function useModelSettings() {
  const router = useRouter();
  const [models, setModels] = useState<ModelOption[]>([]);
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [effort, setEffort] = useState("default");
  const [modelControls, setModelControls] = useState<ModelControl[]>([]);
  const [controlSelections, setControlSelections] = useState<Record<string, string>>({});
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const requestSettings = useRef({
    modelId: null as string | null,
    effort: "default",
    modelControls: {} as Record<string, string | null>,
  });

  const refresh = useCallback(async () => {
    try {
      const [response, providersResponse] = await Promise.all([
        fetch("/api/model-settings", { cache: "no-store" }),
        fetch("/api/model-providers", { cache: "no-store" }),
      ]);
      if (response.status === 401) {
        router.replace("/signin");
        return;
      }
      if (!response.ok) throw new Error("Could not load model settings.");
      const result = modelSettingsSchema.safeParse(await response.json());
      if (!result.success) throw new Error("Could not read model settings.");
      const settings = result.data;
      if (!providersResponse.ok) throw new Error("Could not load your providers.");
      const providerResult = modelProvidersSchema.safeParse(await providersResponse.json());
      if (!providerResult.success) throw new Error("Could not read your providers.");
      setProviders(providerResult.data.providers);
      setActiveProviderId(providerResult.data.active_provider_id);
      setModels(listProviderModels(providerResult.data.providers));
      setConfigured(settings.configured);
      setBaseUrl(settings.base_url);
      setModelId(settings.model_id);
      setEffort(settings.reasoning_effort);
      setModelControls(settings.model_controls);
      setControlSelections(settings.model_control_selections);
      setApiKeyConfigured(settings.api_key_configured);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load model settings.");
    } finally {
      setLoaded(true);
    }
  }, [router]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    requestSettings.current = {
      modelId: modelId || null,
      effort,
      modelControls: controlSelections,
    };
  }, [controlSelections, effort, modelId]);

  const saveSelection = useCallback(
    async (nextModelId: string, nextEffort: string, nextProviderId = activeProviderId) => {
      const previous = { modelId, effort, providerId: activeProviderId };
      if (!nextProviderId) return;
      let providerSwitched = false;
      setModelId(nextModelId);
      setEffort(nextEffort);
      setActiveProviderId(nextProviderId);
      requestSettings.current = {
        modelId: nextModelId || null,
        effort: nextEffort,
        modelControls: controlSelections,
      };
      setError("");
      try {
        if (nextProviderId !== previous.providerId) {
          const providerResponse = await fetch("/api/model-providers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider_id: nextProviderId }),
          });
          if (!providerResponse.ok) {
            throw new Error(await responseMessage(providerResponse, "Could not switch model connection."));
          }
          providerSwitched = true;
        }

        const response = await fetch("/api/model-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model_id: nextModelId,
            reasoning_effort: nextEffort,
          }),
        });
        if (!response.ok) {
          throw new Error(await responseMessage(response, "Could not save model selection."));
        }
        await refresh();
      } catch (reason) {
        if (providerSwitched && previous.providerId) {
          await fetch("/api/model-providers", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider_id: previous.providerId }),
          }).catch(() => undefined);
        }
        setModelId(previous.modelId);
        setEffort(previous.effort);
        setActiveProviderId(previous.providerId);
        requestSettings.current = {
          modelId: previous.modelId || null,
          effort: previous.effort,
          modelControls: controlSelections,
        };
        setError(reason instanceof Error ? reason.message : "Could not save model selection.");
      }
    },
    [activeProviderId, controlSelections, effort, modelId, refresh],
  );

  const selectModel = useCallback(
    (value: string) => {
      const separator = value.indexOf(":");
      if (separator < 1) return;
      const providerId = value.slice(0, separator);
      const nextModelId = value.slice(separator + 1);
      if (!nextModelId) return;
      void saveSelection(nextModelId, effort, providerId);
    },
    [effort, saveSelection],
  );
  const selectEffort = useCallback(
    (nextEffort: string) => void saveSelection(modelId, nextEffort),
    [modelId, saveSelection],
  );

  const selectModelControl = useCallback(
    async (controlId: string, value: string | null) => {
      const previous = controlSelections;
      const next = { ...previous };
      if (value === null) delete next[controlId];
      else next[controlId] = value;
      setControlSelections(next);
      requestSettings.current = {
        modelId: modelId || null,
        effort,
        modelControls: next,
      };
      setError("");
      try {
        const response = await fetch("/api/model-settings/controls", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_id: modelId, control_id: controlId, value }),
        });
        if (!response.ok) throw new Error("Could not save this model control.");
      } catch (reason) {
        setControlSelections(previous);
        requestSettings.current = {
          modelId: modelId || null,
          effort,
          modelControls: previous,
        };
        setError(reason instanceof Error ? reason.message : "Could not save this model control.");
      }
    },
    [controlSelections, effort, modelId],
  );

  return {
    models,
    providers,
    activeProviderId,
    baseUrl,
    modelId,
    selectedModelValue: activeProviderId
      ? modelOptionValue(activeProviderId, modelId)
      : "",
    effort,
    modelControls,
    controlSelections,
    apiKeyConfigured,
    configured,
    loaded,
    error,
    requestSettings,
    refresh,
    selectModel,
    selectEffort,
    selectModelControl,
  };
}
