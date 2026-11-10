"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ModelOption = {
  id: string;
  name: string;
  alias?: string;
  value: string;
  providerName: string;
};
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
    value: model.value,
    label: `${model.alias || model.name || model.id} · ${model.providerName}`,
  }));

  return (
    <div className="model-settings flex items-center gap-2 [&_label]:flex [&_label]:items-center [&_label]:gap-1.5 [&_label]:text-muted-foreground [&_label]:text-[11px] **:data-[slot=select-trigger]:max-w-55 **:data-[slot=select-trigger]:h-8 **:data-[slot=select-trigger]:border-input **:data-[slot=select-trigger]:bg-background **:data-[slot=select-trigger]:text-foreground **:data-[slot=select-trigger]:font-[inherit] **:data-[slot=select-trigger]:text-[11px] [&_[data-slot=select-trigger]:disabled]:opacity-[.6] in-[.composer-footer]:flex-1 in-[.composer-footer]:min-w-0 in-[.composer-footer]:flex-wrap max-[760px]:gap-1.5 max-[560px]:in-[.composer-footer]:gap-1.5 in-[.composer-footer]:gap-2.25" aria-label="Model settings">
      <label className="in-[.model-settings]:gap-1.5 in-[.model-settings]:whitespace-nowrap max-[760px]:in-[.model-settings]:flex-row max-[760px]:in-[.model-settings]:items-center max-[760px]:in-[.model-settings]:gap-1 in-[.composer-footer]:gap-1">
        <span className="text-muted-foreground text-[10px] font-[550] in-[.composer-footer]:text-muted-foreground in-[.composer-footer]:text-[10px] in-[.composer-footer]:font-[550]">Model</span>
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
            className="[.model-settings_[data-slot=select-trigger]&]:max-w-57.5 [.model-settings_[data-slot=select-trigger]&]:h-7.5 [.model-settings_[data-slot=select-trigger]&]:p-[0_8px] [.model-settings_[data-slot=select-trigger]&]:border-input [.model-settings_[data-slot=select-trigger]&]:rounded-md [.model-settings_[data-slot=select-trigger]&]:bg-background [.model-settings_[data-slot=select-trigger]&]:text-foreground [.model-settings_[data-slot=select-trigger]&]:font-[inherit] [.model-settings_[data-slot=select-trigger]&]:text-[11px] [.model-settings_[data-slot=select-trigger]&:hover]:border-input [.model-settings_[data-slot=select-trigger]&:hover]:bg-background max-[760px]:[.model-settings_[data-slot=select-trigger]&]:max-w-[42vw] max-[760px]:[.model-settings_[data-slot=select-trigger]&]:h-7.25 max-[760px]:[.model-settings_[data-slot=select-trigger]&]:pl-1.75 max-[760px]:[.model-settings_[data-slot=select-trigger]&]:text-[10px] [.composer-footer_.model-settings_[data-slot=select-trigger]&]:h-8 [.composer-footer_.model-settings_[data-slot=select-trigger]&]:gap-1.25 [.composer-footer_.model-settings_[data-slot=select-trigger]&]:p-[0_7px] [.composer-footer_.model-settings_[data-slot=select-trigger]&]:border-transparent [.composer-footer_.model-settings_[data-slot=select-trigger]&]:rounded-md [.composer-footer_.model-settings_[data-slot=select-trigger]&]:bg-transparent [.composer-footer_.model-settings_[data-slot=select-trigger]&]:text-foreground [.composer-footer_.model-settings_[data-slot=select-trigger]&]:text-[12px] [.composer-footer_.model-settings_[data-slot=select-trigger]&]:font-[550] [.composer-footer_.model-settings_[data-slot=select-trigger]&]:shadow-[none] [.composer-footer_.model-settings_[data-slot=select-trigger]&:hover]:border-transparent [.composer-footer_.model-settings_[data-slot=select-trigger]&:hover]:bg-accent [.composer-footer_.model-settings_[data-slot=select-trigger]&[aria-expanded=true]]:border-transparent [.composer-footer_.model-settings_[data-slot=select-trigger]&[aria-expanded=true]]:bg-accent [.composer-footer_.model-settings_[data-slot=select-trigger]&:focus-visible]:outline-2 outline-ring [.composer-footer_.model-settings_[data-slot=select-trigger]&:focus-visible]:outline-offset-2 [.composer-footer_&_>_svg]:w-3.5 [.composer-footer_&_>_svg]:h-3.5 [.composer-footer_&_>_svg]:text-muted-foreground"
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
          <label className="in-[.model-settings]:gap-1.5 in-[.model-settings]:whitespace-nowrap max-[760px]:in-[.model-settings]:flex-row max-[760px]:in-[.model-settings]:items-center max-[760px]:in-[.model-settings]:gap-1 in-[.composer-footer]:gap-1" key={control.id}>
            <span className="text-muted-foreground text-[10px] font-[550] in-[.composer-footer]:text-muted-foreground in-[.composer-footer]:text-[10px] in-[.composer-footer]:font-[550]">{control.name}</span>
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
                className="[.model-settings_[data-slot=select-trigger]&]:max-w-57.5 [.model-settings_[data-slot=select-trigger]&]:h-7.5 [.model-settings_[data-slot=select-trigger]&]:p-[0_8px] [.model-settings_[data-slot=select-trigger]&]:border-input [.model-settings_[data-slot=select-trigger]&]:rounded-md [.model-settings_[data-slot=select-trigger]&]:bg-background [.model-settings_[data-slot=select-trigger]&]:text-foreground [.model-settings_[data-slot=select-trigger]&]:font-[inherit] [.model-settings_[data-slot=select-trigger]&]:text-[11px] [.model-settings_[data-slot=select-trigger]&:hover]:border-input [.model-settings_[data-slot=select-trigger]&:hover]:bg-background max-[760px]:[.model-settings_[data-slot=select-trigger]&]:max-w-[42vw] max-[760px]:[.model-settings_[data-slot=select-trigger]&]:h-7.25 max-[760px]:[.model-settings_[data-slot=select-trigger]&]:pl-1.75 max-[760px]:[.model-settings_[data-slot=select-trigger]&]:text-[10px] [.composer-footer_.model-settings_[data-slot=select-trigger]&]:h-8 [.composer-footer_.model-settings_[data-slot=select-trigger]&]:gap-1.25 [.composer-footer_.model-settings_[data-slot=select-trigger]&]:p-[0_7px] [.composer-footer_.model-settings_[data-slot=select-trigger]&]:border-transparent [.composer-footer_.model-settings_[data-slot=select-trigger]&]:rounded-md [.composer-footer_.model-settings_[data-slot=select-trigger]&]:bg-transparent [.composer-footer_.model-settings_[data-slot=select-trigger]&]:text-foreground [.composer-footer_.model-settings_[data-slot=select-trigger]&]:text-[12px] [.composer-footer_.model-settings_[data-slot=select-trigger]&]:font-[550] [.composer-footer_.model-settings_[data-slot=select-trigger]&]:shadow-[none] [.composer-footer_.model-settings_[data-slot=select-trigger]&:hover]:border-transparent [.composer-footer_.model-settings_[data-slot=select-trigger]&:hover]:bg-accent [.composer-footer_.model-settings_[data-slot=select-trigger]&[aria-expanded=true]]:border-transparent [.composer-footer_.model-settings_[data-slot=select-trigger]&[aria-expanded=true]]:bg-accent [.composer-footer_.model-settings_[data-slot=select-trigger]&:focus-visible]:outline-2 outline-ring [.composer-footer_.model-settings_[data-slot=select-trigger]&:focus-visible]:outline-offset-2 [.composer-footer_&_>_svg]:w-3.5 [.composer-footer_&_>_svg]:h-3.5 [.composer-footer_&_>_svg]:text-muted-foreground"
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
