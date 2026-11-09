"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { modelListSchema, modelProvidersSchema, modelSettingsSchema, type ModelControl, type ModelProvider } from "@/lib/chat-shape";

type ModelOption = { id: string; name: string; alias?: string };
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
      const response = await fetch("/api/model-settings", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/signin");
        return;
      }
      if (!response.ok) throw new Error("Could not load model settings.");
      const result = modelSettingsSchema.safeParse(await response.json());
      if (!result.success) throw new Error("Could not read model settings.");
      const settings = result.data;
      const providersResponse = await fetch("/api/model-providers", { cache: "no-store" });
      if (!providersResponse.ok) throw new Error("Could not load your providers.");
      const providerResult = modelProvidersSchema.safeParse(await providersResponse.json());
      if (!providerResult.success) throw new Error("Could not read your providers.");
      setProviders(providerResult.data.providers);
      setActiveProviderId(providerResult.data.active_provider_id);
      setConfigured(settings.configured);
      setBaseUrl(settings.base_url);
      setModelId(settings.model_id);
      setEffort(settings.reasoning_effort);
      setModelControls(settings.model_controls);
      setControlSelections(settings.model_control_selections);
      setApiKeyConfigured(settings.api_key_configured);
      if (settings.configured) {
        const modelsResponse = await fetch("/api/models", { cache: "no-store" });
        if (!modelsResponse.ok) throw new Error("Could not load available models.");
        const catalog = modelListSchema.safeParse(await modelsResponse.json());
        if (!catalog.success) throw new Error("Could not read available models.");
        setModels(catalog.data.models);
      } else {
        setModels([]);
      }
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
    async (nextModelId: string, nextEffort: string) => {
      const previous = { modelId, effort };
      setModelId(nextModelId);
      setEffort(nextEffort);
      requestSettings.current = {
        modelId: nextModelId || null,
        effort: nextEffort,
        modelControls: controlSelections,
      };
      setError("");
      try {
        const response = await fetch("/api/model-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model_id: nextModelId,
            reasoning_effort: nextEffort,
          }),
        });
        if (!response.ok) throw new Error("Could not save model selection.");
        await refresh();
      } catch (reason) {
        setModelId(previous.modelId);
        setEffort(previous.effort);
        requestSettings.current = {
          modelId: previous.modelId || null,
          effort: previous.effort,
          modelControls: controlSelections,
        };
        setError(reason instanceof Error ? reason.message : "Could not save model selection.");
      }
    },
    [controlSelections, effort, modelId, refresh],
  );

  const selectModel = useCallback(
    (nextModelId: string) => void saveSelection(nextModelId, effort),
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
