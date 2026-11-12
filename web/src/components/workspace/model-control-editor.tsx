"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ModelControl } from "@/lib/chat-shape";

type ModelControlEditorProps = {
  controls: ModelControl[];
  onChange: (controls: ModelControl[]) => void;
};

function createControl(): ModelControl {
  return {
    id: crypto.randomUUID(),
    name: "",
    parameter: "",
    options: [{ label: "Default", value: "default" }],
    default_value: null,
  };
}

function parseOptions(value: string): ModelControl["options"] {
  const values = [
    ...new Set(
      value
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean),
    ),
  ];
  return values.map((option) => ({
    label: option
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase()),
    value: option,
  }));
}

export function areModelControlsValid(controls: ModelControl[]): boolean {
  const ids = controls.map((control) => control.id);
  return (
    controls.length <= 12 &&
    new Set(ids).size === ids.length &&
    controls.every((control) => {
      const values = control.options.map((option) => option.value);
      return (
        /^[a-zA-Z0-9_-]{1,64}$/.test(control.id) &&
        control.name.trim().length > 0 &&
        control.name.length <= 80 &&
        /^[a-zA-Z0-9_.-]{1,128}$/.test(control.parameter) &&
        control.options.length > 0 &&
        control.options.length <= 12 &&
        control.options.every(
          (option) =>
            option.label.trim().length > 0 &&
            option.label.length <= 64 &&
            option.value.trim().length > 0 &&
            option.value.length <= 128,
        ) &&
        new Set(values).size === values.length &&
        (control.default_value === null ||
          values.includes(control.default_value))
      );
    })
  );
}

export function ModelControlEditor({
  controls,
  onChange,
}: ModelControlEditorProps) {
  function updateControl(
    index: number,
    update: (control: ModelControl) => ModelControl,
  ) {
    onChange(
      controls.map((control, currentIndex) =>
        currentIndex === index ? update(control) : control,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-3 pt-1 [&_select]:w-full [&_select]:h-9 [&_select]:p-[0_10px] [&_select]:border [&_select]:border-border [&_select]:rounded-md [&_select]:font-[inherit] [&_select]:text-[12px] [&_select]:bg-background [&_select]:text-foreground">
      <div className="flex items-center justify-between gap-3 text-[12px] text-foreground">
        <strong>Model settings</strong>
        <Button
          type="button"
          variant="outline"
          className="[.provider-dialog_[data-slot=button]:not(.settings-primary):not(&)]:text-muted-foreground [.provider-dialog_[data-slot=button]&]:border-border [.provider-dialog_[data-slot=button]&]:bg-background [.provider-dialog_[data-slot=button]&]:text-muted-foreground [.user-settings-page_[data-slot=button]&]:border-border [.user-settings-page_[data-slot=button]&]:bg-background [.user-settings-page_[data-slot=button]&]:text-muted-foreground [.provider-dialog_[data-slot=button]&:hover]:bg-accent [.user-settings-page_[data-slot=button]&:hover]:bg-accent"
          onClick={() => onChange([...controls, createControl()])}
        >
          Add setting
        </Button>
      </div>
      <FieldDescription>
        Configure selectable parameters for this model. Parameter names are sent
        to the provider with each chat request.
      </FieldDescription>
      {!areModelControlsValid(controls) && (
        <FieldDescription>
          Complete each setting and use unique options. You can add up to 12
          settings, with up to 12 options each.
        </FieldDescription>
      )}
      {controls.map((control, index) => (
        <div className="flex flex-col gap-2 p-3 border border-border rounded-md bg-background" key={control.id}>
          <div className="grid grid-cols-[1fr_1fr] gap-2.5">
            <Field>
              <FieldLabel htmlFor={`${control.id}-name`}>Setting name</FieldLabel>
              <Input
                id={`${control.id}-name`}
                value={control.name}
                placeholder="Thinking"
                onChange={(event) =>
                  updateControl(index, (item) => ({
                    ...item,
                    name: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${control.id}-parameter`}>Provider parameter</FieldLabel>
              <Input
                id={`${control.id}-parameter`}
                value={control.parameter}
                placeholder="reasoning_effort"
                onChange={(event) =>
                  updateControl(index, (item) => ({
                    ...item,
                    parameter: event.target.value,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${control.id}-options`}>Options (comma-separated)</FieldLabel>
              <Input
                id={`${control.id}-options`}
                value={control.options.map((option) => option.value).join(", ")}
                placeholder="low, medium, high"
                onChange={(event) =>
                  updateControl(index, (item) => {
                    const options = parseOptions(event.target.value);
                    return {
                      ...item,
                      options,
                      default_value: options.some(
                        (option) => option.value === item.default_value,
                      )
                        ? item.default_value
                        : null,
                    };
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${control.id}-default`}>Default</FieldLabel>
              <select
                id={`${control.id}-default`}
                value={control.default_value ?? ""}
                onChange={(event) =>
                  updateControl(index, (item) => ({
                    ...item,
                    default_value: event.target.value || null,
                  }))
                }
              >
                <option value="">Provider default</option>
                {control.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="danger min-h-7 p-[0_8px] text-[11px] text-muted-foreground [&:hover]:bg-accent [&:hover]:text-foreground [&.danger]:text-destructive [&.danger:hover]:text-destructive"
            onClick={() =>
              onChange(
                controls.filter((_, currentIndex) => currentIndex !== index),
              )
            }
          >
            Remove setting
          </Button>
        </div>
      ))}
    </div>
  );
}
