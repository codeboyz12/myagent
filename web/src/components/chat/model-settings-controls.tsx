"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ModelOption = { id: string; name: string; alias?: string };
type ModelControl = {
  id: string;
  name: string;
  parameter: string;
  options: Array<{ label: string; value: string }>;
  default_value: string | null;
};

type ModelSettingsControlsProps = {
  models: ModelOption[];
  modelId: string;
  onModelChange: (modelId: string) => void;
  controls: ModelControl[];
  selections: Record<string, string>;
  onControlChange: (controlId: string, value: string | null) => void;
  disabled: boolean;
};

export function ModelSettingsControls({
  models,
  modelId,
  onModelChange,
  controls,
  selections,
  onControlChange,
  disabled,
}: ModelSettingsControlsProps) {
  const modelItems = models.map((model) => ({
    value: model.id,
    label: model.alias || model.name || model.id,
  }));

  return (
    <div className="model-settings" aria-label="Model settings">
      <label className="model-setting">
        <span className="model-setting-label">Model</span>
        <Select
          items={modelItems}
          aria-label="Model"
          value={modelId}
          onValueChange={(value) => {
            if (typeof value === "string") onModelChange(value);
          }}
          disabled={disabled || models.length === 0}
        >
          <SelectTrigger
            className="model-setting-trigger"
            aria-label="Model"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {modelItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      {controls.map((control) => {
        const items = control.options.map((option) => ({
          value: option.value,
          label: option.label,
        }));
        return (
          <label className="model-setting" key={control.id}>
            <span className="model-setting-label">{control.name}</span>
            <Select
              items={items}
              aria-label={control.name}
              value={
                selections[control.id] ??
                control.default_value ??
                control.options[0]?.value ??
                ""
              }
              onValueChange={(value) => {
                if (typeof value === "string")
                  onControlChange(control.id, value);
              }}
              disabled={disabled}
            >
              <SelectTrigger
                className="model-setting-trigger"
                aria-label={control.name}
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        );
      })}
    </div>
  );
}
