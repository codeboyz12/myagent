import { FormNameContext, FormValidationContext, defineComponent, useCreateFormValidation, type ComponentRenderProps } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { z } from "zod/v4";

const columnSchema = z.object({
  label: z.string(),
  data: z.any().optional(),
  type: z.enum(["string", "number", "action"]).optional(),
});

const compatibleColumn = defineComponent({
  name: "Col",
  props: columnSchema,
  description: "A table column heading with optional data and a display type.",
  component: () => null,
});

const rowValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const compatibleTableProps = z.object({
  columns: z.array(compatibleColumn.ref),
  rows: z.array(z.array(rowValueSchema)).optional(),
});

type CompatibleTableProps = ComponentRenderProps<{
  columns: Array<{ props?: { label?: unknown; data?: unknown } }>;
  rows?: Array<Array<string | number | boolean>>;
}>;

const compatibleTable = defineComponent({
  name: "Table",
  props: compatibleTableProps,
  description: "A table using column labels and optional row-oriented data.",
  component: ({ props, renderNode }: CompatibleTableProps) => {
    const columns = props.columns.map((column) => column.props ?? {});
    const columnData = columns.map((column) =>
      Array.isArray(column.data) ? column.data : [],
    );
    const rowCount = props.rows?.length ?? Math.max(0, ...columnData.map((data) => data.length));

    return (
      <div className="max-w-full overflow-x-auto">
        <table className="w-full border-collapse text-left [&_th]:p-[10px_12px] [&_th]:border-b [&_th]:border-border [&_th]:align-top [&_td]:p-[10px_12px] [&_td]:border-b [&_td]:border-border [&_td]:align-top [&_th]:text-muted-foreground [&_th]:text-[0.875rem] [&_th]:font-semibold [.openui-generated-response_&_th]:p-[13px_16px] [.openui-generated-response_&_th]:leading-[1.55] [.openui-generated-response_&_td]:p-[13px_16px] [.openui-generated-response_&_td]:leading-[1.55]">
          <thead>
            <tr>{columns.map((column, index) => <th key={index}>{String(column.label ?? "")}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((_column, columnIndex) => {
                  const value = props.rows?.[rowIndex]?.[columnIndex] ?? columnData[columnIndex]?.[rowIndex] ?? "";
                  return <td key={columnIndex}>{renderNode(value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
});

const formControlList = z.array(openuiLibrary.components.FormControl.ref);
const buttons = openuiLibrary.components.Buttons.ref;
const compatibleFormProps = z.object({
  name: z.string(),
  fieldsOrButtons: z.union([formControlList, buttons]),
  buttonsOrFields: z.union([formControlList, buttons]).optional(),
});

type CompatibleFormRenderProps = ComponentRenderProps<{
  name: string;
  fieldsOrButtons: unknown;
  buttonsOrFields?: unknown;
}>;

function CompatibleFormRenderer({
  props,
  renderNode,
}: CompatibleFormRenderProps) {
  const fieldsFirst = Array.isArray(props.fieldsOrButtons);
  const fields = fieldsFirst ? props.fieldsOrButtons : props.buttonsOrFields;
  const formButtons = fieldsFirst ? props.buttonsOrFields : props.fieldsOrButtons;
  const validation = useCreateFormValidation();

  return (
    <FormValidationContext.Provider value={validation}>
      <FormNameContext.Provider value={props.name}>
        <div className="flex flex-col gap-4">
          {fields ? renderNode(fields) : null}
          {formButtons ? renderNode(formButtons) : null}
        </div>
      </FormNameContext.Provider>
    </FormValidationContext.Provider>
  );
}

const compatibleForm = defineComponent({
  name: "Form",
  props: compatibleFormProps,
  description: "A form with fields and action buttons. Accepts fields before buttons.",
  component: CompatibleFormRenderer,
});

export const myagentOpenUILibrary = openuiLibrary.extend({
  components: {
    // Keep the complete OpenUI GenUI catalog available. The overrides below
    // preserve myagent's row-oriented tables and both accepted Form argument orders.
    remove: [],
    override: [compatibleColumn, compatibleTable, compatibleForm],
  },
});
